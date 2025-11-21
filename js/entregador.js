// js/entregador.js - Refatorado para MapLibre GL JS

import { db, ref, set, onValue, update, get } from "./firebase.js";
import { geocodeAddress, calculateSpeed, calculateDistance } from "./utils.js";
import * as Map from "./map.js";
import * as UI from "./ui-entregador.js";
import {
  showToast,
  updateLocationStatus,
  showConfirmModal,
  showPersistentError, // showConfirmModal será substituído por uma implementação local
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
    setupUIEventListeners();

    // Espera o carregamento dos componentes (modais) antes de continuar
    await loadComponents("#modal-container"); // Re-add this call
    setupModalEventListeners(); // <--- MOVIDO: Agora é chamado APÓS o carregamento dos modais

    UI.setFollowMeButtonState(isFollowingDeliveryPerson);
    Map.setFollowMode(isFollowingDeliveryPerson);
  }

  // ======= 4. Event Listeners =======
  function setupMapEventListeners() {
    if (!map) return;

    map.on("dragstart", () => {
      isFollowingDeliveryPerson = false;
      UI.setFollowMeButtonState(isFollowingDeliveryPerson);
    });
  }

  /**
   * Configura os event listeners para os modais carregados dinamicamente.
   */
  function setupModalEventListeners() {
    const confirmDeliveryBtn = document.getElementById(
      "confirm-delivery-final-btn"
    );
    const cancelDeliveryBtn = document.getElementById(
      "cancel-delivery-final-btn"
    );

    // Ação de confirmar a entrega
    if (confirmDeliveryBtn)
      confirmDeliveryBtn.addEventListener("click", handleFinishDelivery);

    // Ação de cancelar (apenas fecha o modal)
    if (cancelDeliveryBtn) {
      cancelDeliveryBtn.addEventListener(
        "click",
        () => UI.showConfirmDeliveryModal(false) // Chama a função para esconder o modal
      );
    }
  }

  function setupUIEventListeners() {
    // Conecta os botões da ilha dinâmica diretamente aqui
    const finishBtn = document.getElementById("dynamic-island-finish-btn");
    const cancelBtn = document.getElementById("dynamic-island-cancel-btn");

    if (finishBtn) {
      finishBtn.addEventListener("click", () => {
        if (activeDelivery) {
          orderIdToConfirm = activeDelivery.orderId;
          UI.showConfirmDeliveryModal(true, orderIdToConfirm);
        }
      });
    }
    if (cancelBtn) {
      cancelBtn.addEventListener("click", handleCancelNavigation);
    }

    UI.setupEventListeners(
      () => {
        // onLogout
        localStorage.removeItem("currentUser");
        window.location.href = "index.html";
      },
      null, // onNewOrder (não aplicável para entregador)
      null, // onPrintAll (não aplicável para entregador)
      null, // onReadMessage (não aplicável para entregador)
      null, // onClearDelivered (não aplicável para entregador)
      null, // onResetActiveDeliveries (não aplicável para entregador)
      null, // onClearAllOrders (não aplicável para entregador)
      null, // onNewOrderSubmit (não aplicável para entregador)
      null // onReadMessageSubmit (não aplicável para entregador)
    );

    // Local HUD buttons (follow, satellite, 3D) — ensure follow button wired
    const followBtn = document.getElementById("follow-me-button");
    if (followBtn) followBtn.addEventListener("click", handleToggleFollowMe);
    else {
      const followBtnMobile = document.getElementById(
        "follow-me-button-mobile"
      );
      if (followBtnMobile)
        followBtnMobile.addEventListener("click", handleToggleFollowMe);
    }

    // HUD controls (follow, satellite, 3D)
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
    updateLocationStatus("Localização ativa.", "success");
  }

  function handleToggleFollowMe() {
    isFollowingDeliveryPerson = !isFollowingDeliveryPerson;
    UI.setFollowMeButtonState(isFollowingDeliveryPerson);
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
            UI.showSuggestionModal(closestOrder, (suggestedOrderId) => {
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
    UI.showDynamicIsland(true, {
      nomeCliente: order.nomeCliente,
      endereco: order.endereco || enderecoParaGeocodar,
      distancia: "--",
      orderId,
    });

    UI.updateButtonsForNavigation(true, orderId);
    UI.updateNavigationStatus(`Navegando para ${order.nomeCliente}.`);
    update(ref(db), {
      [`/pedidos/${orderId}/status`]: "em_entrega",
      [`/pedidos/${orderId}/entregadorId`]: currentUser.username,
    });

    UI.showDynamicIsland(true, order);

    // Define a rota usando o novo plugin e solicita OSRM para desenhar a linha azul
    if (entregadorLocation) {
      const route = await Map.setRoute(entregadorLocation, geocodeResult); // Use returned route
      if (route) {
        const distanceKm = (route.distance / 1000).toFixed(1);
        const durationMin = Math.round(route.duration / 60);
        UI.updateDistanceDisplay(parseFloat(distanceKm));
        UI.updateEtaDisplay(durationMin);

        // Atualiza ilha dinâmica com a distância calculada
        UI.showDynamicIsland(true, {
          nomeCliente: order.nomeCliente,
          endereco: order.endereco || enderecoParaGeocodar,
          distancia: distanceKm,
          orderId,
        });

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
    UI.setFollowMeButtonState(isFollowingDeliveryPerson);
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

    UI.updateButtonsForNavigation(false, null);
    UI.updateNavigationStatus("");
    UI.updateEtaDisplay(null);
    UI.updateDistanceDisplay(null);
    UI.showDynamicIsland(false, null);
  }

  async function handleFinishDelivery(orderId) {
    // O orderId é pego da variável global `orderIdToConfirm`
    if (!orderIdToConfirm) return;
    await updateStatus(orderIdToConfirm, "entregue");
    UI.showConfirmDeliveryModal(false);
    stopNavigation();
  }

  async function handleCancelNavigation() {
    if (!activeDelivery) return;

    const confirmed = await new Promise((resolve) => {
      showConfirmModal(
        "Tem certeza que deseja cancelar a entrega em andamento?",
        () => resolve(true),
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

      UI.renderDeliveryOrders(
        readyOrders,
        inRouteOrders,
        (orderId) => {
          orderIdToConfirm = orderId;
          UI.showConfirmDeliveryModal(true);
        },
        startNavigation,
        handleCancelNavigation
      );

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
