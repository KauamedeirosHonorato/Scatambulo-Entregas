import { db, ref, set, onValue, update, get } from "./firebase.js";
import { geocodeAddress, getRouteDetails, calculateSpeed } from "./utils.js";
import * as Map from "./map.js";
import * as MapLogic from "./map-logic.js";
import * as UI from "./ui-entregador.js";

document.addEventListener("DOMContentLoaded", () => {
  // ======= 1. Validação de Usuário =======
  const currentUser = JSON.parse(localStorage.getItem("currentUser"));
  if (!currentUser || currentUser.panel !== "entregador.html") {
    window.location.href = "index.html";
    return;
  }

  // ======= 2. Estado Global =======
  // Variáveis Locais de Estado (Fonte da Verdade para o GPS)
  let entregadorLocation = null;
  let previousEntregadorLocation = null;
  let activeDelivery = null;
  let orderIdToConfirm = null;
  const notificationSound = new Audio("/audio/NotificacaoPedidoEntregue.mp3");
  let knownReadyOrderIds = new Set();
  let initialLocationSet = false;
  let isFollowingDeliveryPerson = true;
  let hasArrived = false;

  // ======= 3. Inicializa Mapas e UI =======

  MapLogic.initializeMapWithLocation("map");
  checkGeolocationPermission();
  listenToFirebaseOrders();

  // ======= 4. Funções Auxiliares =======
  function handleToggleFollowMe() {
    isFollowingDeliveryPerson = !isFollowingDeliveryPerson;
    UI.setFollowMeButtonState(isFollowingDeliveryPerson);
    if (isFollowingDeliveryPerson && entregadorLocation) {
      Map.panMapTo(entregadorLocation);
    }
  }

  function checkGeolocationPermission() {
    if (!window.isSecureContext) {
      UI.updateLocationStatus("Erro de segurança: HTTPS necessário.");
      return;
    }

    if ("geolocation" in navigator) {
      navigator.permissions.query({ name: "geolocation" }).then((result) => {
        if (result.state === "granted" || result.state === "prompt") {
          startWatchingLocation();
        } else {
          UI.updateLocationStatus("Permissão de localização negada.");
        }
      });
    } else {
      startWatchingLocation();
    }
  }

  function startWatchingLocation() {
    if (!("geolocation" in navigator)) {
      UI.updateLocationStatus("Geolocalização não suportada.");
      return;
    }

    const watchOptions = { enableHighAccuracy: true };
    navigator.geolocation.watchPosition(
      handleLocationUpdate,
      handleLocationError,
      watchOptions
    );
  }

  /**
   * Lida com uma atualização de localização bem-sucedida.
   * @param {GeolocationPosition} position - O objeto de posição retornado pelo navegador.
   */
  function handleLocationUpdate(position) {
    const { latitude, longitude, speed, heading } = position.coords;

    updateLocalState(latitude, longitude, heading);
    updateFirebaseState(latitude, longitude);
    updateMapViewState();

    UI.updateSpeedDisplay(speed || 0);
    UI.updateLocationStatus("Localização ativa.");

    if (!initialLocationSet) {
      resumeActiveDelivery();
      initialLocationSet = true;
    }
  }

  /**
   * Lida com erros ao obter a localização.
   * @param {GeolocationPositionError} error - O objeto de erro.
   */
  function handleLocationError(error) {
    console.error("Erro de geolocalização:", error);
    UI.updateLocationStatus("Erro ao obter localização.");
  }

  function updateLocalState(latitude, longitude, heading) {
    previousEntregadorLocation = entregadorLocation;
    entregadorLocation = {
      latitude,
      longitude,
      timestamp: Date.now(),
      heading: heading || 0,
    };
    MapLogic.updateEntregadorLocation(entregadorLocation);
  }

  function updateFirebaseState(latitude, longitude) {
    set(ref(db, "localizacao/entregador"), entregadorLocation);
    if (activeDelivery) {
      update(ref(db, `entregas_ativas/${activeDelivery.orderId}`), {
        lastLocation: { lat: latitude, lng: longitude, ts: Date.now() },
      });
    }
  }

  function updateMapViewState() {
    if (!initialLocationSet) {
      Map.fitMapToBounds(entregadorLocation, null);
    }
    if (isFollowingDeliveryPerson) {
      Map.panMapTo(entregadorLocation);
    }
  }

  // ======= 5. Firebase Orders =======
  function listenToFirebaseOrders() {
    onValue(ref(db, "pedidos/"), (snapshot) => {
      const pedidos = snapshot.val() || {};

      const readyOrders = Object.fromEntries(
        Object.entries(pedidos).filter(
          ([id, p]) => p.status === "pronto_para_entrega"
        )
      );

      const inRouteOrders = Object.fromEntries(
        Object.entries(pedidos).filter(([id, p]) => p.status === "em_entrega")
      );

      const newReadyOrders = Object.keys(readyOrders).filter(
        (id) => !knownReadyOrderIds.has(id)
      );
      if (newReadyOrders.length && knownReadyOrderIds.size) {
        try {
          notificationSound.play();
        } catch (e) {
          console.warn(e);
        }
      }
      knownReadyOrderIds = new Set(Object.keys(readyOrders));

      // A função onDeliver agora apenas abre o modal de confirmação
      UI.renderDeliveryOrders(
        readyOrders,
        inRouteOrders,
        (orderId) => {
          orderIdToConfirm = orderId;
          UI.showConfirmDeliveryModal(true);
        },
        startNavigation
      );
    });
  }
  // ======= 6. Navegação =======
  async function startNavigation(orderId, order) {
    hasArrived = false;
    if (!entregadorLocation) {
      alert("Aguardando localização.");
      return;
    }

    // Usa a variável de estado local 'activeDelivery'
    if (activeDelivery && activeDelivery.orderId !== orderId) {
      alert("Finalize a entrega atual antes de iniciar outra.");
      return;
    }

    const geocodeResult = await geocodeAddress(order.endereco);
    if (!geocodeResult || geocodeResult.error) {
      alert(`Não foi possível encontrar o endereço.`);
      return;
    }

    // Define a entrega ativa localmente
    activeDelivery = { orderId, destinationCoords: geocodeResult, order };

    UI.updateButtonsForNavigation(true, orderId);
    UI.updateNavigationStatus(`Navegando para ${order.nomeCliente}.`);
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
    Map.startNavigation(
      () => entregadorLocation, // Usa a localização local
      geocodeResult,
      handleRouteUpdate
    );
  }

  // NOVO: Retoma a navegação se uma entrega já estiver ativa ao carregar a página
  async function resumeActiveDelivery() {
    const snapshot = await get(ref(db, "pedidos/"));
    const pedidos = snapshot.val() || {};
    const activeOrderEntry = Object.entries(pedidos).find(
      ([, p]) => p.status === "em_entrega"
    );

    if (activeOrderEntry) {
      const [orderId, orderData] = activeOrderEntry;
      console.log(`Retomando navegação para o pedido: ${orderId}`);
      await startNavigation(orderId, orderData);
    }
  }

  // ======= 7. Finalizar e Parar Navegação =======
  async function handleFinishDelivery(orderId) {
    if (!orderId) return;
    await updateStatus(orderId, "entregue");
    activeDelivery = null; // Limpa o estado local da entrega ativa
    UI.showConfirmDeliveryModal(false);
    handleStopNavigation(orderId);
  }

  function handleStopNavigation(orderId) {
    const updates = {};
    updates[`pedidos/${orderId}/entrega`] = null;
    updates[`/entregas_ativas/${orderId}`] = null; // Garante a limpeza da entrega ativa
    update(ref(db), updates);

    activeDelivery = null;
    Map.stopNavigation(); // Limpa mapa (rota, cliente)
    UI.updateButtonsForNavigation(false, null); // Reseta botões
    UI.updateNavigationStatus(""); // Limpa status de navegação
    UI.updateEtaDisplay(null);
    UI.updateDistanceDisplay(null);
    UI.showDynamicIsland(false, null); // Esconde ilha dinâmica
  }

  async function handleCancelNavigation() {
    if (!activeDelivery) return;

    if (confirm("Cancelar entrega?")) {
      const orderId = activeDelivery.orderId;
      await update(ref(db), {
        [`/pedidos/${orderId}/status`]: "pronto_para_entrega",
      });
      handleStopNavigation(orderId);
    }
  }

  // ======= 8. Atualização da Rota =======
  function handleRouteUpdate(routeDetails) {
    const entregadorLocation = MapLogic.getEntregadorLocation();
    const previousLocation = MapLogic.getPreviousEntregadorLocation();

    if (!entregadorLocation || !activeDelivery) return; // Usa a variável local

    if (routeDetails && !routeDetails.error) {
      UI.updateEtaDisplay(routeDetails.duration);
      UI.updateDistanceDisplay(parseFloat(routeDetails.distance));

      const speed = calculateSpeed(entregadorLocation, previousLocation);
      UI.updateSpeedDisplay(speed || 0);

      update(ref(db), {
        // Usa a variável local
        [`/pedidos/${activeDelivery.orderId}/entrega/distancia`]:
          routeDetails.distance,
        // Usa a variável local
        [`/pedidos/${activeDelivery.orderId}/entrega/tempoEstimado`]:
          routeDetails.duration,
        [`/pedidos/${activeDelivery.orderId}/entrega/velocidade`]: speed, // Usa a variável local
        // Usa a variável local
        [`/pedidos/${activeDelivery.orderId}/entrega/geometria`]:
          routeDetails.geometry,
        // Usa a variável local
        [`/pedidos/${activeDelivery.orderId}/entrega/lastEntregadorCoords`]:
          entregadorLocation,
      });

      const distanceToDest = L.latLng(
        entregadorLocation.latitude,
        entregadorLocation.longitude
      ).distanceTo(
        L.latLng(
          activeDelivery.destinationCoords.lat, // Usa a variável local
          activeDelivery.destinationCoords.lon // Usa a variável local
        )
      );

      if (distanceToDest <= 50 && !hasArrived) {
        hasArrived = true;
        orderIdToConfirm = activeDelivery.orderId; // Usa a variável local
        UI.showConfirmDeliveryModal(true);
        Map.stopNavigation();
      }
    } else {
      UI.updateEtaDisplay(null);
      UI.updateDistanceDisplay(null);
      UI.updateSpeedDisplay(0);
    }
  }

  // ======= 9. Atualizar Status =======
  async function updateStatus(pedidoId, newStatus) {
    await update(ref(db, `pedidos/${pedidoId}`), { status: newStatus });

    if (newStatus === "entregue") {
      try {
        notificationSound.play();
      } catch (e) {
        console.warn(e);
      }
      alert(`Pedido ${pedidoId} entregue com sucesso!`);
    }
  }

  // ======= 10. Event Listeners da UI =======
  // Seletores dos elementos
  const logoutButton = document.getElementById("logout-button");
  const confirmDeliveryBtn = document.getElementById("confirm-delivery-btn");
  const cancelDeliveryModalBtn = document.getElementById("cancel-delivery-btn");
  const closeModalButton = document.querySelector(
    "#confirm-delivery-modal .close-button"
  );
  const finishFromIslandBtn = document.getElementById(
    "dynamic-island-finish-btn"
  );
  const cancelFromIslandBtn = document.getElementById(
    "dynamic-island-cancel-btn"
  );
  const followMeButton = document.getElementById("follow-me-button");

  // Anexando os eventos
  logoutButton.addEventListener("click", () => {
    localStorage.removeItem("currentUser");
    window.location.href = "index.html";
  });

  confirmDeliveryBtn.addEventListener("click", () => {
    if (orderIdToConfirm) handleFinishDelivery(orderIdToConfirm);
  });

  cancelDeliveryModalBtn.addEventListener("click", () =>
    UI.showConfirmDeliveryModal(false)
  );
  closeModalButton.addEventListener("click", () =>
    UI.showConfirmDeliveryModal(false)
  );

  finishFromIslandBtn.addEventListener("click", () => {
    if (activeDelivery) UI.showConfirmDeliveryModal(true);
  });
  cancelFromIslandBtn.addEventListener("click", handleCancelNavigation);
  followMeButton.addEventListener("click", handleToggleFollowMe);
});
