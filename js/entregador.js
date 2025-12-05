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
  setFollowMeButtonState,
  showScheduledOrdersModal,
  showIslandConfirmation,
} from "./ui-entregador.js";
import { triggerConfettiAnimation } from "./ui-entregador.js";
import {
  showToast,
  updateLocationStatus,
  showConfirmModal,
  showPersistentError, // showConfirmModal será substituído por uma implementação local
  hidePersistentError,
  setupHamburgerMenu,
} from "./ui.js";
import { loadComponents } from "./componentLoader.js";
import { initializeChat } from "./chat.js";

let watchId = null;

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

  // Novas variáveis para o controle de tela cheia
  let mapContainerElement;
  let originalMapParent;
  let fullscreenModal;
  let fullscreenTarget;

  let isFollowingDeliveryPerson = true;
  let hasArrived = false;
  let initialLocationSet = false;
  // Caminho relativo para garantir que o áudio seja encontrado
  const notificationSound = new Audio("audio/NotificacaoPedidoEntregue.mp3");
  let knownReadyOrderIds = new Set();
  let userInteracted = false;

  // ======= 3. Inicialização =======
  initializeApp();

  function tryPlaySound(audio) {
    if (!audio) return;
    if (userInteracted) {
      audio.play().catch(() => {});
      return;
    }

    // If the user hasn't interacted yet, schedule play on first interaction
    const handler = () => {
      try {
        audio.play().catch(() => {});
      } catch (e) {
        /* ignore */
      }
      userInteracted = true;
      window.removeEventListener("click", handler);
      window.removeEventListener("touchstart", handler);
      window.removeEventListener("keydown", handler);
    };

    window.addEventListener("click", handler, { once: true });
    window.addEventListener("touchstart", handler, { once: true });
    window.addEventListener("keydown", handler, { once: true });
  }

  async function initializeApp() {
    map = await Map.initializeMap("map", undefined, undefined, true); // Start in satellite mode
    if (!map) {
      console.error("Map initialization failed. Deliverer page might not function correctly.");
      updateLocationStatus("Erro ao carregar o mapa. Por favor, recarregue a página.", "error");
      return; // Stop further initialization if map failed
    }

    // Inicializa elementos de tela cheia
    mapContainerElement = document.getElementById("map-container");
    originalMapParent = mapContainerElement.parentElement;
    fullscreenModal = document.getElementById("map-fullscreen-modal");
    fullscreenTarget = document.getElementById("fullscreen-map-target");

    setupMapEventListeners();
    checkGeolocationPermission();
    listenToFirebaseOrders();

    // Espera o carregamento dos componentes (modais) antes de continuar
    await Promise.all([
      loadComponents("#modal-container", [
          "components/modal-confirm-delivery.html",
          "components/modal-suggestion.html",
          "components/modal-historico-entregas.html",
          "components/modal-agendados.html",
      ]),
      loadComponents("#chat-component-container", ["components/chat-window.html"]),
    ]);
    // Configura todos os listeners de ações (modais, botões da ilha, etc.)
    setupActionListeners();
    initializeChat();

    // Garante que o mapa tenha o tamanho correto após o carregamento da UI
    Map.invalidateMapSize();

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

    // Listener para abrir o mapa em tela cheia ao clicar nele
    if (mapContainerElement) {
      mapContainerElement.addEventListener("click", (e) => {
        // Só ativa se o clique não for em um botão, link ou na ilha dinâmica
        if (e.target.closest("button, a, .dynamic-island")) {
          return;
        }
        // Só abre se não já estiver em tela cheia
        if (!fullscreenModal.classList.contains("active")) {
          enterFakeFullscreen();
        }
      });
    }
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
    const fullscreenBtn = document.getElementById("map-fullscreen-btn");
    if (fullscreenBtn) {
      fullscreenBtn.addEventListener("click", (e) => {
        e.stopPropagation(); // Impede que o clique no botão propague para o container do mapa
        handleToggleFullscreen();
      });
    }
    else {
      const followBtnMobile = document.getElementById(
        "follow-me-button-mobile"
      );
      if (followBtnMobile)
        followBtnMobile.addEventListener("click", handleToggleFollowMe);
    }

    // Botões da Ilha Dinâmica
    const islandFinishBtn = document.getElementById(
      "dynamic-island-finish-btn"
    );
    const islandCancelBtn = document.getElementById(
      "dynamic-island-cancel-btn"
    );

    if (islandFinishBtn) {
      islandFinishBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (activeDelivery) {
          orderIdToConfirm = activeDelivery.orderId;
          showIslandConfirmation(
            'finish',
            'Confirmar finalização da entrega?',
            handleFinishDelivery
          );
        }
      });
    }
    if (islandCancelBtn) {
      islandCancelBtn.addEventListener("click", (e) => { e.stopPropagation(); handleCancelNavigation(); });
    }

    // Botões de Navegação Externa (Waze/Maps)
    const gmapsBtn = document.getElementById("open-gmaps-btn");
    const wazeBtn = document.getElementById("open-waze-btn");

    const openNavigationApp = (app) => {
      if (!activeDelivery || !activeDelivery.order || !activeDelivery.order.endereco) {
        showToast("Endereço da entrega não disponível.", "error");
        return;
      }

      const address = activeDelivery.order.endereco;
      const encodedAddress = encodeURIComponent(address);
      let url;

      if (app === 'gmaps') {
        url = `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;
      } else if (app === 'waze') {
        url = `https://waze.com/ul?q=${encodedAddress}&navigate=yes`;
      }

      if (url) {
        window.open(url, '_blank');
      }
    };

    if (gmapsBtn) {
      gmapsBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Impede que a ilha se feche
        openNavigationApp('gmaps');
      });
    }
    if (wazeBtn) {
      wazeBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Impede que a ilha se feche
        openNavigationApp('waze');
      });
    }

    // Listeners para o Modal de Pedidos Agendados
    const scheduledModal = document.getElementById("scheduled-orders-modal");
    if (scheduledModal) {
      const closeButtons = scheduledModal.querySelectorAll(".close-button");
      const hideModal = () => scheduledModal.classList.remove("active");

      closeButtons.forEach((btn) => btn.addEventListener("click", hideModal));

      // Fecha também se clicar no backdrop
      scheduledModal.addEventListener("click", (e) => {
        if (e.target === scheduledModal) {
          hideModal();
        }
      });
    }

    // Listener para o alerta de proximidade do mapa
    window.addEventListener("proximity-alert", (e) => {
      const distance = e.detail.distance;
      showToast(`Você está a ${distance}m do destino!`, "success");
    });
  }

  // Funções para controlar o "fullscreen fake" compatível com iOS
  function handleToggleFullscreen() {
    if (!fullscreenModal) return;

    if (fullscreenModal.classList.contains("active")) {
      exitFakeFullscreen();
    } else {
      enterFakeFullscreen();
    }
  }

  function enterFakeFullscreen() {
    if (!mapContainerElement || !fullscreenModal || !fullscreenTarget) return;
    if (fullscreenModal.classList.contains("active")) return;

    // Move o container do mapa para dentro do modal
    fullscreenTarget.appendChild(mapContainerElement);
    fullscreenModal.classList.add("active");

    // Permite a interação com o mapa em tela cheia, desativando eventos no overlay
    const overlay = document.getElementById('map-overlay');
    if (overlay) {
      overlay.style.pointerEvents = 'none';
    }

    const fullscreenBtn = document.getElementById("map-fullscreen-btn");
    if (fullscreenBtn) {
      fullscreenBtn.innerHTML = '<i class="ph ph-arrows-in"></i>';
      fullscreenBtn.title = "Sair da Tela Cheia";
    }
    // Redimensiona o mapa após um pequeno delay para garantir que o DOM foi atualizado
    setTimeout(() => map && map.resize(), 150);
  }

  function exitFakeFullscreen() {
    if (!mapContainerElement || !fullscreenModal || !originalMapParent) return;
    if (!fullscreenModal.classList.contains("active")) return;

    // Move o container do mapa de volta para seu local original
    originalMapParent.appendChild(mapContainerElement);
    fullscreenModal.classList.remove("active");

    // Restaura a capacidade de clique no overlay para reabrir a tela cheia
    const overlay = document.getElementById('map-overlay');
    if (overlay) {
      overlay.style.pointerEvents = 'auto';
    }

    const fullscreenBtn = document.getElementById("map-fullscreen-btn");
    if (fullscreenBtn) {
      fullscreenBtn.innerHTML = '<i class="ph ph-arrows-out"></i>';
      fullscreenBtn.title = "Tela Cheia";
    }
    // Redimensiona o mapa
    setTimeout(() => map && map.resize(), 150);
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
    showScheduledOrdersModal(true);
  }

  // ======= 5. Geolocalização =======
  function checkGeolocationPermission() {
    if (!window.isSecureContext) {
      updateLocationStatus("Erro de segurança: HTTPS necessário para geolocalização.", "error");
      console.error("Geolocation requires HTTPS. Current context is not secure.");
      return;
    }
    navigator.permissions.query({ name: "geolocation" }).then((result) => {
      console.log("Geolocation permission query result:", result.state); // Added logging
      if (result.state === "granted" || result.state === "prompt") {
        startWatchingLocation(true); // Inicia com alta precisão
      } else {
        updateLocationStatus(`Permissão de localização ${result.state}. Por favor, conceda acesso à sua localização.`, "error");
        console.warn(`Geolocation permission ${result.state}. User needs to grant access.`);
      }
    }).catch(error => {
        console.error("Error querying geolocation permission:", error);
        updateLocationStatus("Erro ao verificar permissão de localização.", "error");
    });
  }

  function startWatchingLocation(highAccuracy = true) {
    console.log(`Iniciando geolocalização (alta precisão: ${highAccuracy})`);
    const watchOptions = {
      enableHighAccuracy: highAccuracy,
      timeout: 25000, // Aumentado para 25 segundos
      maximumAge: 10000, // Aceita uma posição de até 10s atrás
    };

    // Limpa qualquer monitoramento anterior para evitar múltiplos watchers
    if (watchId) {
      navigator.geolocation.clearWatch(watchId);
    }

    watchId = navigator.geolocation.watchPosition(
      handleLocationUpdate,
      (error) => handleLocationError(error, highAccuracy), // Passa o modo atual para o handler de erro
      watchOptions
    );
  }

  function handleLocationUpdate(position) {
    // Se a precisão for baixa e uma nova tentativa com alta precisão não estiver agendada, tenta fazer o upgrade.
    if (position.coords.accuracy > 50 && !window.upgradeAccuracyTimeout) {
      console.log("Precisão baixa detectada. Tentando obter alta precisão em segundo plano.");
      // Agenda uma única tentativa de upgrade para não sobrecarregar
      window.upgradeAccuracyTimeout = setTimeout(() => {
        startWatchingLocation(true);
        window.upgradeAccuracyTimeout = null;
      }, 15000); // Tenta após 15 segundos
    }

    const { latitude, longitude, speed, heading } = position.coords;

    const speedKmh = (speed || 0) * 3.6; // Convert m/s to km/h
    entregadorLocation = {
      latitude,
      longitude,
      timestamp: Date.now(),
      heading: heading || 0,
      speed: parseFloat(speedKmh.toFixed(1)),
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

  function handleLocationError(error, wasHighAccuracy) {
    console.error("Erro de geolocalização:", error); // Log the full error object

    // Se o erro for um timeout e estávamos em modo de alta precisão,
    // tenta novamente com baixa precisão como fallback.
    if (error.code === error.TIMEOUT && wasHighAccuracy) {
      console.warn("Timeout com alta precisão. Tentando com baixa precisão.");
      showToast("Sinal de GPS fraco. Usando localização aproximada.", "info");
      startWatchingLocation(false); // Tenta novamente com baixa precisão
      return; // Interrompe a execução para não mostrar a mensagem de erro final
    }

    let userMessage = "Erro ao obter localização.";
    if (error.code === error.PERMISSION_DENIED) {
      userMessage = "Permissão de localização negada. Por favor, ative a localização nas configurações do seu dispositivo.";
    } else if (error.code === error.POSITION_UNAVAILABLE) {
      userMessage = "Localização indisponível. Verifique suas configurações de GPS.";
    } else if (error.code === error.TIMEOUT) {
      userMessage = "Tempo esgotado ao tentar obter localização. Sinal de GPS fraco ou lento.";
    }
    
    // Check if on iOS and provide specific guidance if relevant
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (isIOS && error.code === error.PERMISSION_DENIED) {
      userMessage += " Em iOS, certifique-se de que a permissão de localização está definida como 'Durante o Uso do App' ou 'Sempre' nas configurações de privacidade.";
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

    updateSpeedDisplay(entregadorLocation.speed || 0);
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
      // Ativa o modo de tela cheia fake para iOS
      enterFakeFullscreen();
    } else {
      showToast(
        "Localização do entregador não disponível — aguardando GPS.",
        "info"
      );
    }
  }

  async function handleStartScheduledNavigation(orderId, order, buttonElement) {
    // Desabilita o botão imediatamente para evitar cliques duplos
    buttonElement.disabled = true;
    buttonElement.innerHTML = `<i class="ph ph-spinner-gap"></i> Iniciando...`;

    try {
      // Tenta iniciar a navegação. A função startNavigation já lida com toasts de erro.
      const success = await startNavigation(orderId, order);

      if (success) {
        // Se a navegação iniciou com sucesso, atualiza o botão permanentemente
        buttonElement.innerHTML = `<i class="ph ph-check-circle"></i> Iniciado`;
        buttonElement.classList.replace("btn-primary", "btn-sucesso");
      } else {
        // Se falhou (ex: outra entrega ativa, erro de geocode), reabilita o botão
        buttonElement.disabled = false;
        buttonElement.innerHTML = `<i class="ph ph-moped"></i> Iniciar`;
      }
    } catch (error) {
      console.error("Erro em handleStartScheduledNavigation:", error);
      buttonElement.disabled = false;
      buttonElement.innerHTML = `<i class="ph ph-moped"></i> Iniciar`;
    }
    // If a geolocation watch is active, clear it
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
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
    exitFakeFullscreen(); // Usa a função de fullscreen fake
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
    if (!orderIdToConfirm) {
        if (activeDelivery && activeDelivery.orderId) {
            orderIdToConfirm = activeDelivery.orderId;
        } else {
            return;
        }
    }
    await updateStatus(orderIdToConfirm, "entregue");
    triggerConfettiAnimation(); // Dispara a animação de confete
    stopNavigation();
    orderIdToConfirm = null; // Limpa após o uso
  }

  async function handleCancelNavigation() {
    if (!activeDelivery) return;

    showIslandConfirmation(
      'cancel',
      'Cancelar a entrega em andamento?',
      async () => {
        const orderId = activeDelivery.orderId;
        await update(ref(db), { [`/pedidos/${orderId}/status`]: "pronto_para_entrega" });
        stopNavigation();
        showToast("A entrega foi cancelada.", "info");
      }
    );
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
        tryPlaySound(notificationSound);
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
      tryPlaySound(notificationSound);
      showToast(
        `Pedido #${pedidoId
          .substring(0, 5)
          .toUpperCase()} entregue com sucesso!`,
        "success"
      );
    }
  }
});
