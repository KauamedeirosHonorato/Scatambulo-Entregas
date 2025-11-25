// js/entregador.js - Refatorado para MapLibre GL JS

import { db, ref, set, onValue, update, get } from "./firebase.js";
import { geocodeAddress, calculateSpeed, calculateDistance } from "./utils.js";
import * as Map from "./map.js";
import {
  renderDeliveryOrders,
  renderScheduledOrders,
  showDynamicIsland,
  showHistoryModal,
  showSuggestionModal,
  updateButtonsForNavigation,
  updateDistanceDisplay,
  updateEtaDisplay,
  updateNavigationStatus,
  updateSpeedDisplay,
  showConfirmDeliveryModal,
  setFollowMeButtonState,
} from "./ui-entregador.js";
import {
  showToast,
  updateLocationStatus,
  showConfirmModal,
  showPersistentError, // showConfirmModal será substituído por uma implementação local
  setupHamburgerMenu,
  hidePersistentError,
} from "./ui.js";
import { loadComponents } from "./componentLoader.js";

window.addEventListener("load", () => {
  // ======= 1. Validação de Usuário =======
  const currentUser = JSON.parse(localStorage.getItem("currentUser"));
  if (!currentUser || currentUser.panel !== "entregador.html") {
    window.location.href = "index.html";
    return;
  }

  // ======= 2. Estado Global =======
  let map;
  let entregadorLocation = null;
  let activeDelivery = null;
  let orderIdToConfirm = null;
  let currentRoutes = [];
  let routeRecalculationInterval = null;

  let isFollowingDeliveryPerson = true;
  let hasArrived = false;
  let initialLocationSet = false;

  const notificationSound = new Audio("/audio/NotificacaoPedidoEntregue.mp3");
  let knownReadyOrderIds = new Set();

  // ======= 3. Inicialização =======
  initializeApp();

  async function initializeApp() {
    map = await Map.initializeMap("map", undefined, undefined, true); // Start in satellite mode

    setupMapEventListeners();
    checkGeolocationPermission();
    listenToFirebaseOrders();

    // Espera o carregamento dos componentes (modais) antes de continuar
    await loadComponents("#modal-container");
    // Configura todos os listeners de ações (modais, botões da ilha, etc.)
    setupActionListeners();

    setFollowMeButtonState(isFollowingDeliveryPerson);
    Map.setFollowMode(isFollowingDeliveryPerson);
  }

  // ======= 4. Event Listeners =======
  function setupMapEventListeners() {
    if (!map) return;

    map.on("dragstart", () => {
      isFollowingDeliveryPerson = false;
      setFollowMeButtonState(isFollowingDeliveryPerson);
    });
  }

  /**
   * Configura os event listeners para os modais carregados dinamicamente.
   */
  function setupActionListeners() {
    // Configuração do Menu Hambúrguer
    setupHamburgerMenu();

    // Botão de Logout
    const historyButton = document.getElementById("history-button");
    if (historyButton) {
      historyButton.addEventListener("click", handleShowHistory);
    }
    const scheduledOrdersButton = document.getElementById(
      "scheduled-orders-button"
    );
    if (scheduledOrdersButton) {
      scheduledOrdersButton.addEventListener("click", handleShowScheduled);
    }
    const logoutButton = document.getElementById("logout-button");
    if (logoutButton) logoutButton.addEventListener("click", handleLogout);
    // Botões do HUD do mapa
    const followBtn = document.getElementById("follow-me-button");
    if (followBtn) followBtn.addEventListener("click", handleToggleFollowMe);
    else {
      const followBtnMobile = document.getElementById(
        "follow-me-button-mobile"
      );
      if (followBtnMobile)
        followBtnMobile.addEventListener("click", handleToggleFollowMe);
    }
    const satBtn = document.getElementById("satellite-toggle");
    const toggle3dBtn = document.getElementById("toggle-3d");
    let satelliteOn = false;
    let threeDOn = false;

    if (satBtn) {
      satBtn.addEventListener("click", () => {
        satelliteOn = !satelliteOn;
        Map.setSatelliteMode(satelliteOn);
        satBtn.classList.toggle("active", satelliteOn);
      });
    }
    if (toggle3dBtn) {
      toggle3dBtn.addEventListener("click", () => {
        threeDOn = !threeDOn;
        Map.set3DMode(threeDOn);
        toggle3dBtn.classList.toggle("active", threeDOn);
      });
    }

    // Botões da Ilha Dinâmica
    const islandFinishBtn = document.getElementById(
      "dynamic-island-finish-btn"
    );
    const islandCancelBtn = document.getElementById(
      "dynamic-island-cancel-btn"
    );

    if (islandFinishBtn) {
      islandFinishBtn.addEventListener("click", () => {
        if (activeDelivery) {
          orderIdToConfirm = activeDelivery.orderId;
          showConfirmDeliveryModal(true, orderIdToConfirm);
        }
      });
    }
    if (islandCancelBtn) {
      islandCancelBtn.addEventListener("click", handleCancelNavigation);
    }

    // Botões do Modal de Confirmação de Entrega
    const confirmDeliveryFinalBtn = document.getElementById(
      "confirm-delivery-final-btn"
    );
    const cancelDeliveryFinalBtn = document.getElementById(
      "cancel-delivery-final-btn"
    );

    if (confirmDeliveryFinalBtn) {
      confirmDeliveryFinalBtn.addEventListener("click", () =>
        handleFinishDelivery()
      );
    }
    if (cancelDeliveryFinalBtn) {
      cancelDeliveryFinalBtn.addEventListener("click", () => {
        showConfirmDeliveryModal(false);
      });
    }
  }

  function handleLogout() {
    localStorage.removeItem("currentUser");
    window.location.href = "index.html";
  }

  async function handleShowHistory() {
    try {
      const snapshot = await get(ref(db, "pedidos"));
      const pedidos = snapshot.val() || {};

      const deliveredOrders = Object.entries(pedidos).filter(
        ([, p]) =>
          p.status === "entregue" && p.entregadorId === currentUser.username
      );

      // Ordena do mais recente para o mais antigo
      deliveredOrders.sort(
        ([, a], [, b]) => (b.timestamp || 0) - (a.timestamp || 0)
      );

      showHistoryModal(true, deliveredOrders);
    } catch (error) {
      console.error("Erro ao buscar histórico de entregas:", error);
      showToast(
        "Não foi possível carregar o histórico. Tente novamente.",
        "error"
      );
    }
  }

  function handleShowScheduled() {
    const modal = document.getElementById("scheduled-orders-modal");
    if (modal) {
      modal.classList.add("active");
    } else {
      console.error("Modal de pedidos agendados não encontrado!");
      showToast("Erro ao abrir agendamentos.", "error");
    }
  }

  // ======= 5. Geolocalização =======
  function checkGeolocationPermission() {
    if (!window.isSecureContext) {
      UI.updateLocationStatus("Erro de segurança: HTTPS necessário.", "error");
      return;
    }
    navigator.permissions.query({ name: "geolocation" }).then((result) => {
      if (result.state === "granted" || result.state === "prompt") {
        startWatchingLocation();
      } else {
        UI.updateLocationStatus("Permissão de localização negada.", "error");
      }
    });
  }

  function startWatchingLocation() {
    const watchOptions = {
      enableHighAccuracy: true,
      timeout: 20000, // Aumentado para 20 segundos para mais tolerância
      maximumAge: 5000, // Permite usar uma localização de até 5s atrás
    };
    navigator.geolocation.watchPosition(
      handleLocationUpdate,
      handleLocationError,
      watchOptions
    );
  }

  function handleLocationUpdate(position) {
    const { latitude, longitude, speed, heading } = position.coords;

    entregadorLocation = {
      latitude,
      longitude,
      timestamp: Date.now(),
      heading: heading || 0,
      speed: speed || 0,
    };

    Map.updateDeliveryMarkerOnMap(
      entregadorLocation,
      activeDelivery ? activeDelivery.destinationCoords : null
    );
    updateFirebaseState(entregadorLocation);
    // Atualiza a câmera se o modo seguir estiver ativo (corrected to function call)
    if (Map.isFollowMode()) {
      Map.updateCameraForLocation(entregadorLocation);
    } else {
      updateMapViewState();
    }
  }

  function handleLocationError(error) {
    console.error("Erro de geolocalização:", error.code, error.message);
    let userMessage = "Erro ao obter localização.";
    if (error.code === 3) {
      // TIMEOUT
      userMessage = "Sinal de GPS fraco. Tente em um local com céu aberto.";
    }

    updateLocationStatus(userMessage, "error");
    showToast(userMessage, "error");
  }

  function updateFirebaseState(location) {
    set(ref(db, "localizacao/entregador"), location);
    if (activeDelivery) {
      update(ref(db, `entregas_ativas/${activeDelivery.orderId}`), {
        lastLocation: {
          lat: location.latitude,
          lng: location.longitude,
          ts: Date.now(),
        },
      });
    }
  }

  // ======= 6. Lógica do Mapa e Navegação =======
  function getDynamicZoom(speed) {
    const speedKmh = (speed || 0) * 3.6;
    if (speedKmh < 5) return 18;
    if (speedKmh < 30) return 17;
    if (speedKmh < 50) return 16;
    return 15;
  }

  function updateMapViewState() {
    if (!entregadorLocation) return;

    if (!initialLocationSet) {
      Map.fitMapToBounds(entregadorLocation, null);
      resumeActiveDelivery();
      initialLocationSet = true;
    } else if (isFollowingDeliveryPerson) {
      const zoomLevel = getDynamicZoom(entregadorLocation.speed);
      map.flyTo({
        center: [entregadorLocation.longitude, entregadorLocation.latitude],
        zoom: zoomLevel,
        pitch: 45,
        bearing: entregadorLocation.heading || map.getBearing(),
      });
    }

    UI.updateSpeedDisplay(entregadorLocation.speed || 0);
    // updateLocationStatus("Localização ativa.", "success"); // Comentado para reduzir toasts
  }

  function handleToggleFollowMe() {
    isFollowingDeliveryPerson = !isFollowingDeliveryPerson;
    setFollowMeButtonState(isFollowingDeliveryPerson);
    Map.setFollowMode(isFollowingDeliveryPerson);
    if (isFollowingDeliveryPerson)
      Map.updateCameraForLocation(entregadorLocation);

    // Update DOM button state so color indicates active/inactive
    try {
      const followBtn = document.getElementById("follow-me-button");
      if (followBtn)
        followBtn.classList.toggle("active", isFollowingDeliveryPerson);
    } catch (e) {
      /* ignore */
    }
  }

  async function startNavigation(orderId, order) {
    Map.resetProximityAlert(); // Resetar o alerta de proximidade para uma nova entrega
    if (hasArrived) hasArrived = false;
    if (!entregadorLocation) {
      showToast("Aguardando sua localização para iniciar a rota.", "info");
      return;
    }
    if (activeDelivery && activeDelivery.orderId !== orderId) {
      showToast("Finalize a entrega atual antes de iniciar outra.", "info");
      return;
    }

    // Monta o endereço completo a partir dos campos do pedido para garantir consistência
    let enderecoParaGeocodar = order.endereco;
    if (!enderecoParaGeocodar || enderecoParaGeocodar.length < 10) {
      const parts = []; // Monta o endereço a partir das partes para garantir
      if (order.rua) parts.push(order.rua);
      if (order.numero) parts.push(order.numero);
      if (order.bairro) parts.push(order.bairro);
      if (order.cep) parts.push(`CEP: ${order.cep}`);
      enderecoParaGeocodar = parts.join(", ");
    }

    // Limpa qualquer erro persistente anterior
    hidePersistentError();

    const geocodeResult = await geocodeAddress(enderecoParaGeocodar);
    if (!geocodeResult || geocodeResult.error) {
      const msg = `Não foi possível encontrar o endereço: ${enderecoParaGeocodar}`;
      showToast(msg, "error");
      console.warn("Geocode falhou para:", enderecoParaGeocodar, geocodeResult);

      // Mostra um banner persistente com ação para abrir no Google Maps
      showPersistentError(msg, "Abrir no Google Maps", () => {
        const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          enderecoParaGeocodar
        )}`;
        window.open(url, "_blank");
      });

      return;
    }

    // Calcula e exibe a próxima entrega mais próxima do DESTINO ATUAL
    (async (currentOrderDestination) => {
      try {
        const snapshot = await get(ref(db, "pedidos/"));
        const pedidos = snapshot.val() || {};
        const otherReadyOrders = Object.entries(pedidos).filter(
          ([id, p]) => p.status === "pronto_para_entrega" && id !== orderId
        );

        if (otherReadyOrders.length > 0) {
          let closestOrder = null;
          let minDistance = Infinity;

          for (const [otherOrderId, otherOrder] of otherReadyOrders) {
            const otherGeocodeResult = await geocodeAddress(
              otherOrder.endereco
            );
            if (otherGeocodeResult && !otherGeocodeResult.error) {
              const distance = calculateDistance(
                currentOrderDestination.lat,
                currentOrderDestination.lon,
                otherGeocodeResult.lat,
                otherGeocodeResult.lon
              );

              if (distance < minDistance) {
                minDistance = distance;
                closestOrder = {
                  id: otherOrderId,
                  distance: distance,
                  clientName: otherOrder.nomeCliente,
                  address: otherOrder.endereco,
                };
              }
            }
          }

          if (closestOrder) {
            showSuggestionModal(closestOrder, (suggestedOrderId) => {
              const card = document.getElementById(`order-${suggestedOrderId}`);
              if (card) {
                card.scrollIntoView({ behavior: "smooth", block: "center" });
                card.classList.add("highlight");
                setTimeout(() => card.classList.remove("highlight"), 2000);
              }
            });
          }
        }
      } catch (err) {
        console.error("Erro ao calcular o próximo pedido mais próximo:", err);
      }
    })(geocodeResult); // Passa o resultado do geocode da entrega atual

    activeDelivery = { orderId, destinationCoords: geocodeResult, order };
    Map.updateClientMarkerOnMap(geocodeResult);

    // Atualiza ilha dinâmica com informações iniciais
    showDynamicIsland(true, {
      nomeCliente: order.nomeCliente,
      endereco: order.endereco || enderecoParaGeocodar,
      distancia: "--",
      orderId,
    });

    updateButtonsForNavigation(true, orderId);
    updateNavigationStatus(`Navegando para ${order.nomeCliente}.`);
    update(ref(db), {
      [`/pedidos/${orderId}/status`]: "em_entrega",
      [`/pedidos/${orderId}/entregadorId`]: currentUser.username,
    });

    // Atualiza a ilha dinâmica com os dados corretos
    showDynamicIsland(true, {
      ...order,
      endereco: order.endereco || enderecoParaGeocodar,
    });
    Map.updateClientMarkerOnMap(geocodeResult);

    // Define a rota usando o novo plugin e solicita OSRM para desenhar a linha azul
    if (entregadorLocation) {
      const route = await Map.setRoute(entregadorLocation, geocodeResult); // Use returned route
      if (route) {
        const distanceKm = (route.distance / 1000).toFixed(1);
        const durationMin = Math.round(route.duration / 60);
        updateDistanceDisplay(parseFloat(distanceKm));
        updateEtaDisplay(durationMin);

        // Atualiza ilha dinâmica com a distância calculada
        // showDynamicIsland(true, {
        //   ...order,
        //   endereco: order.endereco || enderecoParaGeocodar,
        //   distancia: distanceKm,
        // });

        // Persiste dados de entrega no pedido
        try {
          update(ref(db, `pedidos/${orderId}/entrega`), {
            distancia: parseFloat(distanceKm),
            tempoEstimado: durationMin,
            geometria: route.geometry,
          });
        } catch (e) {
          console.warn("Falha ao salvar dados de entrega:", e);
        }
      }

      Map.fitMapToBounds(entregadorLocation, geocodeResult);
    } else {
      showToast(
        "Localização do entregador não disponível — aguardando GPS.",
        "info"
      );
    }
  }

  function handleStartScheduledNavigation(orderId, order) {
    const modal = document.getElementById("scheduled-orders-modal");
    if (modal) {
      modal.classList.remove("active");
    }
    // Adiciona um pequeno atraso para garantir que o modal fechou antes de iniciar a navegação
    // e potencialmente mostrar outros alertas.
    setTimeout(() => startNavigation(orderId, order), 300);
  }

  async function resumeActiveDelivery() {
    const snapshot = await get(ref(db, "pedidos/"));
    const pedidos = snapshot.val() || {};
    const activeOrderEntry = Object.entries(pedidos).find(([, p]) => {
      // A entrega ativa é a que está "em_entrega" E pertence ao entregador logado
      return (
        p.status === "em_entrega" && p.entregadorId === currentUser.username
      );
    });

    if (activeOrderEntry) {
      const [orderId, orderData] = activeOrderEntry;
      console.log(`Retomando navegação para o pedido: ${orderId}`);
      await startNavigation(orderId, orderData);
    }
  }

  function stopNavigation() {
    Map.resetProximityAlert(); // Resetar o alerta de proximidade ao parar a navegação
    // Use a more aggressive clear to remove quaisquer rotas fantasmas
    if (Map.forceClearAllRoutes) {
      try {
        Map.forceClearAllRoutes();
      } catch (e) {
        Map.clearMap();
      }
    } else {
      Map.clearMap();
    }
    activeDelivery = null;
    currentRoutes = [];
    hidePersistentError();

    // Volta ao estado de seguimento do entregador
    isFollowingDeliveryPerson = true;
    setFollowMeButtonState(isFollowingDeliveryPerson);
    Map.setFollowMode(true);

    // Se tivermos a localização atual do entregador, reposiciona a câmera e redesenha o marcador
    if (entregadorLocation) {
      // Garante que qualquer marcador de cliente seja removido
      try {
        Map.updateClientMarkerOnMap(null);
      } catch (e) {}

      Map.updateDeliveryMarkerOnMap(entregadorLocation);
      try {
        Map.updateCameraForLocation(entregadorLocation);
      } catch (e) {
        // fallback: pan para a posição
        Map.panMapTo(entregadorLocation);
      }
    }

    updateButtonsForNavigation(false, null);
    updateNavigationStatus("");
    updateEtaDisplay(null);
    updateDistanceDisplay(null);
    showDynamicIsland(false, null);
  }

  async function handleFinishDelivery() {
    // O orderId é pego da variável global `orderIdToConfirm`
    if (!orderIdToConfirm) return;
    await updateStatus(orderIdToConfirm, "entregue");
    showConfirmDeliveryModal(false);
    stopNavigation();
  }

  async function handleCancelNavigation() {
    if (!activeDelivery) return;

    const confirmed = await new Promise((resolve) => {
      showConfirmModal(
        "Tem certeza que deseja cancelar a entrega em andamento?",
        resolve,
        "Sim, Cancelar",
        "btn-danger"
      );
    });

    if (confirmed) {
      const orderId = activeDelivery.orderId;
      await update(ref(db), {
        [`/pedidos/${orderId}/status`]: "pronto_para_entrega",
      });
      stopNavigation();
      showToast("A entrega foi cancelada.", "info");
    }
  }

  // ======= 7. Lógica de Pedidos (Firebase) =======
  function listenToFirebaseOrders() {
    onValue(ref(db, "pedidos/"), (snapshot) => {
      const pedidos = snapshot.val() || {};
      const readyOrders = Object.fromEntries(
        Object.entries(pedidos).filter(
          ([, p]) => p.status === "pronto_para_entrega"
        )
      );
      const inRouteOrders = Object.fromEntries(
        Object.entries(pedidos).filter(([, p]) => p.status === "em_entrega")
      );

      // Filtra pedidos agendados para os próximos 7 dias
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Zera a hora para comparar apenas a data
      const sevenDaysFromNow = new Date(today);
      sevenDaysFromNow.setDate(today.getDate() + 7);

      const scheduledOrders = Object.entries(pedidos)
        .filter(([, p]) => {
          if (!p.dataEntrega) return false;
          // Evita problemas de fuso horário tratando a data como string
          const deliveryDate = new Date(`${p.dataEntrega}T00:00:00`);
          return (
            deliveryDate >= today &&
            deliveryDate <= sevenDaysFromNow &&
            p.status !== "entregue" &&
            p.status !== "cancelado"
          );
        })
        .sort(([, a], [, b]) => {
          return new Date(a.dataEntrega) - new Date(b.dataEntrega);
        });

      // Se a entrega ativa não estiver mais listada como "em_entrega",
      // provavelmente foi entregue ou cancelada por outro painel — limpar rotas.
      try {
        if (
          activeDelivery &&
          (!inRouteOrders ||
            !Object.prototype.hasOwnProperty.call(
              inRouteOrders,
              activeDelivery.orderId
            ))
        ) {
          console.log(
            `Entrega ativa ${activeDelivery.orderId} não está mais em 'em_entrega' — limpando rotas.`
          );
          stopNavigation();
        }
      } catch (e) {
        console.warn("Erro ao verificar estado de entrega ativa:", e);
      }

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

      renderDeliveryOrders(
        readyOrders,
        inRouteOrders,
        (orderId) => {
          orderIdToConfirm = orderId;
          showConfirmDeliveryModal(true);
        },
        startNavigation,
        handleCancelNavigation
      );

      renderScheduledOrders(scheduledOrders, handleStartScheduledNavigation);

      // Após a renderização, garante que o item ativo (se houver) seja destacado.
      // Primeiro, remove o destaque de qualquer item que possa tê-lo.
      document
        .querySelectorAll(".order-item.active-delivery")
        .forEach((el) => el.classList.remove("active-delivery"));

      // Em seguida, aplica o destaque ao item da entrega atualmente ativa.
      if (activeDelivery && activeDelivery.orderId) {
        // O ID do elemento é construído como `order-${orderId}` no ui-entregador.js
        const activeOrderItem = document.getElementById(
          `order-${activeDelivery.orderId}`
        );
        if (activeOrderItem) activeOrderItem.classList.add("active-delivery");
      }
    });
  }

  async function updateStatus(pedidoId, newStatus) {
    await update(ref(db, `pedidos/${pedidoId}`), { status: newStatus });
    // Se o pedido foi entregue, cancelado ou retornou para pronto, garantir limpeza forçada
    if (
      newStatus === "entregue" ||
      newStatus === "pronto_para_entrega" ||
      newStatus === "cancelado"
    ) {
      try {
        // Se estamos em uma entrega ativa com esse ID, finalize a navegação
        if (activeDelivery && activeDelivery.orderId === pedidoId) {
          stopNavigation();
        } else {
          // Mesmo que não seja a entrega ativa, garantir que não reste nenhuma rota
          try {
            if (Map.forceClearAllRoutes) Map.forceClearAllRoutes();
            else Map.clearMap();
          } catch (e) {}
        }
      } catch (e) {
        console.warn("Erro ao limpar rotas após atualização de status:", e);
      }
    }
    if (newStatus === "entregue") {
      try {
        notificationSound.play();
      } catch (e) {
        console.warn(e);
      }
      showToast(
        `Pedido #${pedidoId
          .substring(0, 5)
          .toUpperCase()} entregue com sucesso!`,
        "success"
      );
    }
  }
});
