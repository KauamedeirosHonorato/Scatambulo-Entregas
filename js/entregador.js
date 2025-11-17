import { db, ref, set, onValue, update, get } from "./firebase.js";
import { geocodeAddress, getRouteDetails, calculateSpeed } from "./utils.js";
import * as Map from "./map.js";
import * as UI from "./ui-entregador.js";

document.addEventListener("DOMContentLoaded", () => {
  const currentUser = JSON.parse(localStorage.getItem("currentUser"));
  if (!currentUser || currentUser.panel !== "entregador.html") {
    window.location.href = "index.html";
    return;
  }

  let entregadorLocation = null;
  let activeDelivery = null;
  let routeRecalculationInterval = null;
  let orderIdToConfirm = null;
  const notificationSound = new Audio("/audio/NotificacaoPedidoEntregue.mp3");

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
    }
  );

  Map.initMap("map");
  checkGeolocationPermission();
  listenToFirebaseOrders();

  function checkGeolocationPermission() {
    if (!window.isSecureContext) {
      UI.updateLocationStatus("Erro de segurança: A geolocalização só funciona em páginas seguras (HTTPS).");
      return;
    }

    if ("geolocation" in navigator && "permissions" in navigator) {
      navigator.permissions.query({ name: "geolocation" }).then((permissionStatus) => {
        handlePermissionChange(permissionStatus.state);
        permissionStatus.onchange = () => handlePermissionChange(permissionStatus.state);
      });
    } else {
      startWatchingLocation();
    }
  }

  function handlePermissionChange(state) {
    switch (state) {
      case "granted":
        UI.updateLocationStatus("Permissão concedida. Iniciando monitoramento...");
        startWatchingLocation();
        break;
      case "prompt":
        UI.updateLocationStatus("Este aplicativo precisa da sua localização. Por favor, autorize no aviso do navegador.");
        startWatchingLocation();
        break;
      case "denied":
        UI.updateLocationStatus("Permissão de localização negada. Por favor, habilite o acesso nas configurações do seu navegador e do seu celular para continuar.");
        break;
    }
  }

  function startWatchingLocation() {
    if ("geolocation" in navigator) {
      navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude, speed } = position.coords;
          entregadorLocation = { latitude, longitude, timestamp: Date.now() };

          Map.updateDeliveryMarkerOnMap(entregadorLocation);
          UI.updateSpeedDisplay(speed || 0);
          set(ref(db, "localizacao/entregador"), entregadorLocation);
          UI.updateLocationStatus("Localização ativa.");

          if (activeDelivery) {
            update(ref(db, `entregas_ativas/${activeDelivery.orderId}`), {
              lastLocation: { lat: latitude, lng: longitude, ts: Date.now() },
            });
            updateDeliveryData();
          }
        },
        (error) => {
            let errorMessage = "Ocorreu um erro ao obter a localização.";
            switch (error.code) {
              case error.PERMISSION_DENIED:
                errorMessage = "Permissão de localização negada. Por favor, habilite o acesso à localização para este site nas configurações do seu navegador e do seu celular.";
                break;
              case error.POSITION_UNAVAILABLE:
                errorMessage = "Informações de localização não estão disponíveis no momento.";
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
      UI.updateLocationStatus("Geolocalização não é suportada por este navegador.");
    }
  }

  function listenToFirebaseOrders() {
    onValue(ref(db, "pedidos/"), (snapshot) => {
      const pedidos = snapshot.val() || {};
      const readyOrders = Object.fromEntries(
        Object.entries(pedidos).filter(([, pedido]) => pedido.status === "pronto_para_entrega")
      );
      
      const newReadyOrders = Object.keys(readyOrders).filter(id => !knownReadyOrderIds.has(id));
      if(newReadyOrders.length > 0 && knownReadyOrderIds.size > 0){
        notificationSound.play().catch(console.warn);
      }
      knownReadyOrderIds = new Set(Object.keys(readyOrders));

      UI.renderReadyOrders(readyOrders, (orderId) => {
          orderIdToConfirm = orderId;
          UI.showConfirmDeliveryModal(true);
      }, startNavigation);
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
      stopNavigation();
    } else {
      const destinationCoords = await geocodeAddress(order.endereco);
      if (!destinationCoords) {
        alert("Não foi possível encontrar o endereço.");
        return;
      }
      activeDelivery = { orderId, destinationCoords, order };
      
      set(ref(db, `entregas_ativas/${orderId}`), {
          pedidoId: orderId,
          entregadorId: currentUser.username,
          cliente: { nome: order.nomeCliente, endereco: order.endereco },
          statusEntrega: "em_andamento",
          lastLocation: null
      });

      UI.updateButtonsForNavigation(true, orderId);
      UI.updateNavigationStatus(`Navegando para o pedido de ${order.nomeCliente}.`);
      
      calculateAndDrawRoute();
      if (routeRecalculationInterval) clearInterval(routeRecalculationInterval);
      routeRecalculationInterval = setInterval(calculateAndDrawRoute, 10000);

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
    }
  }

  function stopNavigation() {
    if (routeRecalculationInterval) clearInterval(routeRecalculationInterval);
    routeRecalculationInterval = null;

    const orderId = activeDelivery.orderId;
    set(ref(db, `pedidos/${orderId}/entrega`), null);
    set(ref(db, `entregas_ativas/${orderId}`), null);

    activeDelivery = null;
    Map.clearRouteFromMap();
    UI.updateButtonsForNavigation(false, null);
    UI.updateNavigationStatus("");
    UI.updateEtaDisplay(null);
    UI.updateDistanceDisplay(null);
    UI.showDynamicIsland(false, null);
  }

  async function calculateAndDrawRoute() {
    if (!activeDelivery || !entregadorLocation) return;

    const { destinationCoords } = activeDelivery;
    const routeDetails = await getRouteDetails(entregadorLocation, destinationCoords);

    Map.clearRouteFromMap();

    if (routeDetails) {
      UI.updateEtaDisplay(routeDetails.duration);
      Map.drawRouteOnMap(routeDetails.geometry);
      Map.addRouteMarkers(entregadorLocation, destinationCoords);
      UI.updateDistanceDisplay(routeDetails.distance);
      
      update(ref(db), {
          [`/pedidos/${activeDelivery.orderId}/entrega/distancia`]: routeDetails.distance,
          [`/pedidos/${activeDelivery.orderId}/entrega/tempoEstimado`]: routeDetails.duration,
          [`/pedidos/${activeDelivery.orderId}/entrega/geometria`]: routeDetails.geometry,
      });

      const distanceToDestination = L.latLng(entregadorLocation.latitude, entregadorLocation.longitude).distanceTo(L.latLng(destinationCoords.lat, destinationCoords.lon));
      if (distanceToDestination <= 50) {
        orderIdToConfirm = activeDelivery.orderId;
        UI.showConfirmDeliveryModal(true);
      }
    } else {
      UI.updateEtaDisplay(null);
      UI.updateDistanceDisplay(null);
    }
  }

  async function updateDeliveryData() {
    const snapshot = await get(ref(db, `pedidos/${activeDelivery.orderId}/entrega`));
    const currentEntregaData = snapshot.val() || {};
    const oldEntregadorLocation = currentEntregaData.lastEntregadorCoords;
    const currentSpeed = calculateSpeed(entregadorLocation, oldEntregadorLocation);

    update(ref(db, `pedidos/${activeDelivery.orderId}/entrega`), {
      velocidade: parseFloat(currentSpeed),
      lastEntregadorCoords: entregadorLocation,
    });
  }

  async function updateStatus(pedidoId, newStatus) {
    await update(ref(db), { [`/pedidos/${pedidoId}/status`]: newStatus });
    if (activeDelivery && activeDelivery.orderId === pedidoId) {
      stopNavigation();
    }
    if (newStatus === "entregue") {
      notificationSound.play().catch(console.warn);
      alert('Status do pedido atualizado para "Entregue" com sucesso!');
    }
  }
});
