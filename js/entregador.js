import { db, ref, set, onValue, update, get } from "./firebase.js";
import { geocodeAddress, getRouteDetails, calculateSpeed } from "./utils.js";
import * as Map from "./map.js";
import * as MapLogic from "./map-logic.js";
import * as UI from "./ui-entregador.js";

document.addEventListener("DOMContentLoaded", () => {
  const currentUser = JSON.parse(localStorage.getItem("currentUser"));
  if (!currentUser || currentUser.panel !== "entregador.html") {
    window.location.href = "index.html";
    return;
  }

  let entregadorLocation = null;
  let previousEntregadorLocation = null;
  let activeDelivery = null;
  let orderIdToConfirm = null;
  const notificationSound = new Audio("/audio/NotificacaoPedidoEntregue.mp3");
  let knownReadyOrderIds = new Set();
  let initialLocationSet = false;
  let isFollowingDeliveryPerson = true; // New state variable, default to true

  UI.setupEventListeners(
    () => {
      localStorage.removeItem("currentUser");
      window.location.href = "index.html";
    },
    () => {
      if (orderIdToConfirm) {
        updateStatus(orderIdToConfirm, "entregue");
        UI.showConfirmDeliveryModal(false);
      }
    },
    () => UI.showConfirmDeliveryModal(false),
    () => {
      if (activeDelivery) {
        orderIdToConfirm = activeDelivery.orderId;
        UI.showConfirmDeliveryModal(true);
      }
    },
    handleCancelNavigation,
    handleToggleFollowMe // New parameter
  );

  MapLogic.initializeMapWithLocation("map");
  checkGeolocationPermission();
  listenToFirebaseOrders();

  function handleToggleFollowMe() {
    isFollowingDeliveryPerson = !isFollowingDeliveryPerson;
    UI.setFollowMeButtonState(isFollowingDeliveryPerson);
    // If we just enabled following, pan to current location
    if (isFollowingDeliveryPerson && entregadorLocation) {
      Map.panMapTo(entregadorLocation);
    }
  }

  function checkGeolocationPermission() {
    if (!window.isSecureContext) {
      UI.updateLocationStatus(
        "Erro de segurança: A geolocalização só funciona em páginas seguras (HTTPS)."
      );
      return;
    }

    if ("geolocation" in navigator && "permissions" in navigator) {
      navigator.permissions
        .query({ name: "geolocation" })
        .then((permissionStatus) => {
          handlePermissionChange(permissionStatus.state);
          permissionStatus.onchange = () =>
            handlePermissionChange(permissionStatus.state);
        });
    } else {
      startWatchingLocation();
    }
  }

  function handlePermissionChange(state) {
    switch (state) {
      case "granted":
        UI.updateLocationStatus(
          "Permissão concedida. Iniciando monitoramento..."
        );
        startWatchingLocation();
        break;
      case "prompt":
        UI.updateLocationStatus(
          "Este aplicativo precisa da sua localização. Por favor, autorize no aviso do navegador."
        );
        startWatchingLocation();
        break;
      case "denied":
        UI.updateLocationStatus(
          "Permissão de localização negada. Por favor, habilite o acesso nas configurações do seu navegador e do seu celular para continuar."
        );
        break;
    }
  }

  function startWatchingLocation() {
    if ("geolocation" in navigator) {
      navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude, speed, heading } = position.coords;
          previousEntregadorLocation = entregadorLocation; // Store current location as previous
          entregadorLocation = {
            latitude,
            longitude,
            timestamp: Date.now(),
            heading: heading || 0,
          };

          MapLogic.updateEntregadorLocation(entregadorLocation);
          UI.updateSpeedDisplay(speed || 0);
          set(ref(db, "localizacao/entregador"), entregadorLocation);
          UI.updateLocationStatus("Localização ativa.");

          if (!initialLocationSet) {
            Map.fitMapToBounds(entregadorLocation, null); // Center map on initial location with good zoom
            initialLocationSet = true;
          }

          // Conditionally pan the map
          if (isFollowingDeliveryPerson) {
            Map.panMapTo(entregadorLocation);
          }

          if (activeDelivery) {
            update(ref(db, `entregas_ativas/${activeDelivery.orderId}`), {
              lastLocation: { lat: latitude, lng: longitude, ts: Date.now() },
            });
          }
        },
        (error) => {
          let errorMessage = "Ocorreu um erro ao obter a localização.";
          switch (error.code) {
            case error.PERMISSION_DENIED:
              errorMessage =
                "Permissão de localização negada. Por favor, habilite o acesso à localização para este site nas configurações do seu navegador e do seu celular.";
              break;
            case error.POSITION_UNAVAILABLE:
              errorMessage =
                "Informações de localização não estão disponíveis no momento.";
              break;
            case error.TIMEOUT:
              errorMessage = "A solicitação de localização expirou.";
              break;
          }
          UI.updateLocationStatus(errorMessage);
        },
        { enableHighAccuracy: true }
      );
    } else {
      UI.updateLocationStatus(
        "Geolocalização não é suportada por este navegador."
      );
    }
  }

  function listenToFirebaseOrders() {
    onValue(ref(db, "pedidos/"), (snapshot) => {
      const pedidos = snapshot.val() || {};
      const readyOrders = Object.fromEntries(
        Object.entries(pedidos).filter(
          ([, pedido]) => pedido.status === "pronto_para_entrega"
        )
      );

      const newReadyOrders = Object.keys(readyOrders).filter(
        (id) => !knownReadyOrderIds.has(id)
      );
      if (newReadyOrders.length > 0 && knownReadyOrderIds.size > 0) {
        notificationSound.play().catch(console.warn);
      }
      knownReadyOrderIds = new Set(Object.keys(readyOrders));

      UI.renderReadyOrders(
        readyOrders,
        (orderId) => {
          orderIdToConfirm = orderId;
          UI.showConfirmDeliveryModal(true);
        },
        startNavigation
      );
    });
  }

  async function startNavigation(orderId, order) {
    if (!entregadorLocation) {
      alert("Aguardando sua localização para iniciar a entrega.");
      return;
    }
    if (activeDelivery && activeDelivery.orderId !== orderId) {
      alert("Finalize a entrega atual antes de iniciar uma nova rota.");
      return;
    }

    if (activeDelivery && activeDelivery.orderId === orderId) {
      handleStopNavigation();
    } else {
      const geocodeResult = await geocodeAddress(order.endereco);
      if (!geocodeResult || geocodeResult.error) {
        alert(
          `Não foi possível encontrar o endereço: ${
            geocodeResult ? geocodeResult.error : "Erro desconhecido"
          }`
        );
        return;
      }
      const destinationCoords = geocodeResult;
      activeDelivery = { orderId, destinationCoords, order };

      set(ref(db, `entregas_ativas/${orderId}`), {
        pedidoId: orderId,
        entregadorId: currentUser.username,
        cliente: { nome: order.nomeCliente, endereco: order.endereco },
        statusEntrega: "em_andamento",
        lastLocation: null,
      });

      UI.updateButtonsForNavigation(true, orderId);
      UI.updateNavigationStatus(
        `Navegando para o pedido de ${order.nomeCliente}.`
      );

      update(ref(db), {
        [`/pedidos/${orderId}/status`]: "em_entrega",
        [`/pedidos/${orderId}/entregadorId`]: currentUser.username,
        [`/pedidos/${orderId}/entrega`]: {
          distancia: "Calculando...",
          tempoEstimado: "Calculando...",
          velocidade: 0,
          lastEntregadorCoords: entregadorLocation,
        },
      });
      UI.showDynamicIsland(true, order);

      Map.updateClientMarkerOnMap(destinationCoords);
      Map.fitMapToBounds(entregadorLocation, destinationCoords);

      // Inicia a navegação no mapa
      Map.startNavigation(
        () => state.location, // Pass a function that returns the current location
        destinationCoords,
        handleRouteUpdate
      );
    }
  }

  function handleStopNavigation() {
    const orderId = activeDelivery.orderId;
    set(ref(db, `pedidos/${orderId}/entrega`), null);
    set(ref(db, `entregas_ativas/${orderId}`), null);

    activeDelivery = null;
    Map.stopNavigation();
    UI.updateButtonsForNavigation(false, null);
    UI.updateNavigationStatus("");
    UI.updateEtaDisplay(null);
    UI.updateDistanceDisplay(null);
    UI.showDynamicIsland(false, null);
    Map.updateClientMarkerOnMap(null); // Remove o ícone do cliente do mapa
    Map.clearRouteFromMap();
  }

  async function handleCancelNavigation() {
    if (!activeDelivery) return;

    if (
      confirm(
        "Tem certeza que deseja cancelar a entrega em andamento? O pedido voltará para a lista de 'Prontos para Entrega'."
      )
    ) {
      const orderId = activeDelivery.orderId;
      await update(ref(db), {
        [`/pedidos/${orderId}/status`]: "pronto_para_entrega",
      });
      handleStopNavigation(); // Reutiliza a lógica de limpeza
    }
  }

  /**
   * Callback para lidar com as atualizações da rota vindas do módulo do mapa.
   */
  function handleRouteUpdate(routeDetails) {
    if (routeDetails && !routeDetails.error) {
      UI.updateEtaDisplay(routeDetails.duration);
      UI.updateDistanceDisplay(routeDetails.distance);

      const speed = calculateSpeed(
        entregadorLocation,
        previousEntregadorLocation
      );
      UI.updateSpeedDisplay(speed);

      // Atualiza os dados da rota no Firebase
      update(ref(db), {
        [`/pedidos/${activeDelivery.orderId}/entrega/distancia`]:
          routeDetails.distance,
        [`/pedidos/${activeDelivery.orderId}/entrega/tempoEstimado`]:
          routeDetails.duration,
        [`/pedidos/${activeDelivery.orderId}/entrega/velocidade`]: speed,
        [`/pedidos/${activeDelivery.orderId}/entrega/geometria`]:
          routeDetails.geometry,
        // Atualiza também as coordenadas do entregador para o cálculo de velocidade nos outros painéis
        [`/pedidos/${activeDelivery.orderId}/entrega/lastEntregadorCoords`]:
          entregadorLocation,
      });

      // Verifica se o entregador chegou ao destino (50 metros de tolerância)
      const distanceToDestination = L.latLng(
        entregadorLocation.latitude,
        entregadorLocation.longitude
      ).distanceTo(
        L.latLng(
          activeDelivery.destinationCoords.lat,
          activeDelivery.destinationCoords.lon
        )
      );

      if (distanceToDestination <= 50) {
        orderIdToConfirm = activeDelivery.orderId;
        UI.showConfirmDeliveryModal(true);
        Map.stopNavigation(); // Para de recalcular a rota ao chegar
      }
    } else {
      console.error(
        "Failed to get route details:",
        routeDetails ? routeDetails.error : "Unknown error"
      );
      UI.updateEtaDisplay(null);
      UI.updateDistanceDisplay(null);
      UI.updateSpeedDisplay(0);
      // Optionally, alert the user or show a message on the UI
      // alert("Não foi possível obter detalhes da rota. Tente novamente mais tarde.");
    }
  }

  async function updateStatus(pedidoId, newStatus) {
    await update(ref(db), { [`/pedidos/${pedidoId}/status`]: newStatus });
    if (activeDelivery && activeDelivery.orderId === pedidoId) {
      handleStopNavigation();
    }
    if (newStatus === "entregue") {
      notificationSound.play().catch(console.warn);
      alert('Status do pedido atualizado para "Entregue" com sucesso!');
    }
  }
});
