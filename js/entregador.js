import { db, ref, set, onValue, update } from "./firebase.js";

document.addEventListener("DOMContentLoaded", () => {
  // Proteção de rota: verifica se o usuário logado é o Alexandre
  const currentUser = JSON.parse(localStorage.getItem("currentUser")); // Proteção de rota: verifica se o usuário logado é o Entregador
  if (!currentUser || currentUser.panel !== "entregador.html") {
    window.location.href = "index.html";
    return;
  }

  // --- Seleção dos Elementos do DOM ---
  const logoutButton = document.getElementById("logout-button");
  const locationStatus = document.getElementById("location-status");
  const permissionActions = document.getElementById("permission-actions");
  const readyOrdersList = document.getElementById("ready-orders-list");
  const etaDisplay = document.getElementById("eta-display");
  const speedDisplay = document.getElementById("speed-display");
  const distanceDisplay = document.getElementById("distance-display");
  const navigationStatus = document.getElementById("navigation-status");
  const confirmDeliveryModal = document.getElementById(
    "confirm-delivery-modal"
  );
  const confirmDeliveryBtn = document.getElementById("confirm-delivery-btn");
  const cancelDeliveryBtn = document.getElementById("cancel-delivery-btn");
  const closeModalBtn = confirmDeliveryModal.querySelector(".close-button");

  let map; // Declarada no escopo principal
  let userLocationMarker;
  let entregadorLocation = null;
  let routeLayer = null; // Para armazenar a camada da rota no mapa
  let routeMarkers = []; // Para armazenar os marcadores de início e fim da rota
  let orderIdToConfirm = null; // Armazena o ID do pedido a ser confirmado
  let activeDelivery = null; // Armazena o estado da entrega ativa { orderId, destinationCoords }
  let routeRecalculationInterval = null; // Armazena o intervalo para recalcular a rota
  let knownReadyOrderIds = new Set(); // Rastreia pedidos prontos para notificação
  const notificationSound = new Audio(
    "https://cdn.freesound.org/previews/219/219244_401265-lq.mp3"
  ); // Som de notificação

  // --- INICIALIZAÇÃO ---
  setupEventListeners();
  initMap();
  checkGeolocationPermission();
  listenToFirebaseOrders();

  /**
   * Configura os ouvintes de eventos para a página.
   */
  function setupEventListeners() {
    logoutButton.addEventListener("click", () => {
      localStorage.removeItem("currentUser");
      window.location.href = "index.html";
    });

    // --- Lógica do Modal de Confirmação ---
    closeModalBtn.addEventListener("click", () => {
      confirmDeliveryModal.style.display = "none";
    });
    cancelDeliveryBtn.addEventListener("click", () => {
      confirmDeliveryModal.style.display = "none";
    });
    confirmDeliveryBtn.addEventListener("click", () => {
      if (orderIdToConfirm) {
        updateStatus(orderIdToConfirm, "entregue");
        confirmDeliveryModal.style.display = "none";
      }
    });
  }

  /**
   * Inicializa o mapa Leaflet.
   */
  function initMap() {
    const mapElement = document.getElementById("map"); // Elemento do mapa
    if (!mapElement) return; // Sai se o elemento do mapa não for encontrado

    map = L.map(mapElement).setView([-23.5505, -46.6333], 13); // Ponto inicial (São Paulo)
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
  }

  /**
   * Verifica o status da permissão de geolocalização e age de acordo.
   */
  function checkGeolocationPermission() {
    if (!window.isSecureContext) {
      locationStatus.textContent =
        "Erro de segurança: A geolocalização só funciona em páginas seguras (HTTPS).";
      return;
    }

    if ("geolocation" in navigator && "permissions" in navigator) {
      navigator.permissions
        .query({ name: "geolocation" })
        .then((permissionStatus) => {
          updateUIForPermission(permissionStatus.state);
          permissionStatus.onchange = () => {
            updateUIForPermission(permissionStatus.state);
          };
        });
    } else {
      // Fallback para navegadores mais antigos sem a API de Permissões
      startWatchingLocation();
    }
  }

  /**
   * Atualiza a interface do usuário com base no estado da permissão.
   * @param {string} state - O estado da permissão ('granted', 'prompt', ou 'denied').
   */
  function updateUIForPermission(state) {
    permissionActions.innerHTML = ""; // Limpa ações anteriores

    switch (state) {
      case "granted":
        locationStatus.textContent =
          "Permissão concedida. Iniciando monitoramento...";
        startWatchingLocation();
        break;
      case "prompt":
        locationStatus.textContent =
          "Este aplicativo precisa da sua localização. Por favor, autorize no aviso do navegador.";
        // Solicita a localização diretamente, o que fará o navegador exibir o prompt de permissão.
        startWatchingLocation();
        break;
      case "denied":
        locationStatus.textContent =
          "Permissão de localização negada. Por favor, habilite o acesso nas configurações do seu navegador e do seu celular para continuar.";
        break;
    }
  }

  /**
   * Inicia o monitoramento da localização do dispositivo.
   */
  function startWatchingLocation() {
    // Geolocation API requer um contexto seguro (HTTPS) na maioria dos navegadores modernos.

    if (!window.isSecureContext) {
      locationStatus.textContent =
        "Erro de segurança: A geolocalização só funciona em páginas seguras (HTTPS).";
      return;
    }

    if ("geolocation" in navigator) {
      navigator.geolocation.watchPosition(
        (position) => {
          // Callback de sucesso
          const { latitude, longitude } = position.coords;
          entregadorLocation = { latitude, longitude }; // Armazena a localização
          locationStatus.textContent = "Localização ativa.";

          // Atualiza o mapa
          const latLng = [latitude, longitude];
          if (!userLocationMarker) {
            // Se for a primeira vez, centraliza o mapa na localização do usuário
            map.setView(latLng, 16);
            userLocationMarker = L.marker(latLng, {
              icon: L.icon({
                iconUrl: "./CarroIcone/Versa2025.png",
                iconSize: [70, 70],
                iconAnchor: [35, 55], // Ajusta a âncora para a base do ícone
              }),
            }).addTo(map);
          } else {
            userLocationMarker.setLatLng(latLng);
          }

          // Atualiza o marcador de velocidade
          speedDisplay.style.display = "flex";
          const speed = position.coords.speed; // em m/s
          if (typeof speed === "number" && speed !== null) {
            const speedKmh = Math.round(speed * 3.6);
            speedDisplay.innerHTML = `${speedKmh}<span class="unit">km/h</span>`;
          } else {
            speedDisplay.innerHTML = `0<span class="unit">km/h</span>`;
          }

          // Envia para o Firebase
          const locationRef = ref(db, "localizacao/entregador");
          set(locationRef, { latitude, longitude });
        },
        (error) => {
          // Callback de erro
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
          locationStatus.textContent = errorMessage;
        },
        { enableHighAccuracy: true }
      );
    } else {
      locationStatus.textContent =
        "Geolocalização não é suportada por este navegador.";
    }
  }

  /**
   * Ouve as alterações nos pedidos do Firebase e renderiza a lista de prontos.
   */
  function listenToFirebaseOrders() {
    const pedidosRef = ref(db, "pedidos/");
    onValue(pedidosRef, (snapshot) => {
      const pedidos = snapshot.val() || {};
      const readyOrders = {};
      const currentReadyOrderIds = new Set();
      let isFirstLoad = knownReadyOrderIds.size === 0;

      for (const [id, pedido] of Object.entries(pedidos)) {
        if (pedido.status === "pronto_para_entrega") {
          readyOrders[id] = pedido;
          currentReadyOrderIds.add(id);

          // Se o ID não era conhecido e não é a primeira carga, é um novo pedido
          if (!knownReadyOrderIds.has(id) && !isFirstLoad) {
            // Toca o som de notificação
            // A reprodução pode ser bloqueada pelo navegador se o usuário não tiver interagido com a página.
            notificationSound.play().catch((error) => {
              console.warn(
                "Não foi possível tocar o som de notificação:",
                error
              );
            });
          }
        }
      }

      // Atualiza o conjunto de IDs conhecidos
      knownReadyOrderIds = currentReadyOrderIds;

      renderReadyOrders(readyOrders);
    });
  }

  /**
   * Renderiza os cards dos pedidos prontos para entrega.
   * @param {object} orders - Objeto com os pedidos prontos.
   */
  function renderReadyOrders(orders) {
    readyOrdersList.innerHTML = "";
    if (Object.keys(orders).length === 0) {
      readyOrdersList.innerHTML =
        "<p>Nenhum pedido pronto para entrega no momento.</p>";
      return;
    }

    for (const [orderId, order] of Object.entries(orders)) {
      const card = document.createElement("div");
      card.className = "order-card";
      card.id = orderId; // Adiciona o ID do pedido ao card
      card.innerHTML = `
                <h4>${order.nomeBolo}</h4>
                <p><strong>Cliente:</strong> ${order.nomeCliente}</p>
                <p><strong>Endereço:</strong> ${order.endereco}</p>
                <div class="route-info" id="route-info-${orderId}"></div>
                <div class="order-actions">
                    <button class="btn-sucesso deliver-button">Entregar</button>
                    <button class="btn-secondary route-button">Iniciar Entrega</button>
                </div>
            `;

      card
        .querySelector(".route-button")
        .addEventListener("click", async () => {
          if (!entregadorLocation) {
            alert("Aguardando sua localização para iniciar a entrega.");
            return;
          }

          // Se já estiver em uma entrega, não permite iniciar outra
          if (activeDelivery && activeDelivery.orderId !== orderId) {
            alert("Finalize a entrega atual antes de iniciar uma nova rota.");
            return;
          }

          if (activeDelivery && activeDelivery.orderId === orderId) {
            stopNavigation();
          } else {
            startNavigation(orderId, order.endereco);
          }
        });

      card.querySelector(".deliver-button").addEventListener("click", () => {
        orderIdToConfirm = orderId;
        confirmDeliveryModal.style.display = "block";
      });

      readyOrdersList.appendChild(card);
    }
  }

  /**
   * Inicia o modo de navegação para um pedido.
   */
  async function startNavigation(orderId, address) {
    const routeInfoDiv = document.querySelector(`#route-info-${orderId}`);
    routeInfoDiv.textContent = "Calculando rota...";

    const destinationCoords = await geocodeAddress(address);
    if (!destinationCoords) {
      routeInfoDiv.textContent = "Não foi possível encontrar o endereço.";
      return;
    }

    activeDelivery = { orderId, destinationCoords };

    // Atualiza a UI
    updateButtonsForNavigation(true, orderId);
    const clientName = document
      .querySelector(`#${orderId} p strong`)
      .nextSibling.textContent.trim();
    navigationStatus.textContent = `Navegando para o pedido de ${clientName}.`;
    navigationStatus.style.display = "block";

    // Calcula e exibe a rota inicial
    await calculateAndDrawRoute();

    // Inicia o recálculo periódico
    if (routeRecalculationInterval) clearInterval(routeRecalculationInterval);
    routeRecalculationInterval = setInterval(calculateAndDrawRoute, 10000); // Recalcula a cada 10 segundos
  }

  /**
   * Para o modo de navegação.
   */
  function stopNavigation() {
    if (routeRecalculationInterval) clearInterval(routeRecalculationInterval);
    routeRecalculationInterval = null;

    const orderId = activeDelivery.orderId;
    const routeInfoDiv = document.querySelector(`#route-info-${orderId}`);
    if (routeInfoDiv) routeInfoDiv.textContent = "";

    activeDelivery = null;
    clearRouteFromMap();
    updateButtonsForNavigation(false, null);
    navigationStatus.style.display = "none";
    etaDisplay.style.display = "none";
    distanceDisplay.style.display = "none";
  }

  /**
   * Calcula e desenha a rota no mapa.
   */
  async function calculateAndDrawRoute() {
    if (!activeDelivery || !entregadorLocation) return;

    const { orderId, destinationCoords } = activeDelivery;
    const routeInfoDiv = document.querySelector(`#route-info-${orderId}`);

    const routeDetails = await getRouteDetails(
      entregadorLocation,
      destinationCoords
    );

    clearRouteFromMap(); // Limpa rota e marcadores anteriores

    if (routeDetails) {
      if (routeInfoDiv) {
        routeInfoDiv.innerHTML = `<strong>Distância:</strong> ${routeDetails.distance} km | <strong>Tempo:</strong> ${routeDetails.duration} min`;
      }
      etaDisplay.textContent = `${routeDetails.duration} min`;
      etaDisplay.style.display = "block";

      routeLayer = L.geoJSON(routeDetails.geometry, {
        style: { color: "#007bff", weight: 5 },
      }).addTo(map);

      addRouteMarkers(entregadorLocation, destinationCoords);

      updateDistanceDisplay(routeDetails.distance);
      // Centraliza o mapa para mostrar toda a rota
      map.invalidateSize();
      map.fitBounds(routeLayer.getBounds());
    } else {
      if (routeInfoDiv) routeInfoDiv.textContent = "Erro ao calcular a rota.";
      etaDisplay.style.display = "none";
      distanceDisplay.style.display = "none";
    }
  }

  /**
   * Atualiza a aparência e o estado dos botões durante a navegação.
   */
  function updateButtonsForNavigation(isNavigating, activeOrderId) {
    const allRouteButtons = document.querySelectorAll(".route-button");
    allRouteButtons.forEach((button) => {
      const card = button.closest(".order-card");
      const orderId = card
        .querySelector(".route-info")
        .id.replace("route-info-", "");

      if (isNavigating) {
        if (orderId === activeOrderId) {
          button.textContent = "Finalizar Navegação";
          button.disabled = false;
        } else {
          button.disabled = true; // Desabilita botões de outras rotas
        }
      } else {
        button.textContent = "Iniciar Entrega";
        button.disabled = false;
      }
    });
  }

  /**
   * Converte um endereço em coordenadas usando a API Nominatim.
   */
  async function geocodeAddress(address) {
    const addressForQuery = address.split(", CEP:")[0];
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          addressForQuery
        )}`
      );
      const data = await response.json();
      if (data && data.length > 0) {
        return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
      }
    } catch (error) {
      console.error("Erro de geocodificação:", error);
    }
    return null;
  }

  /**
   * Obtém detalhes da rota (distância e duração) usando a API OSRM.
   */
  async function getRouteDetails(startCoords, endCoords) {
    const url = `https://router.project-osrm.org/route/v1/driving/${startCoords.longitude},${startCoords.latitude};${endCoords.lon},${endCoords.lat}?overview=full&geometries=geojson`;
    try {
      const response = await fetch(url);
      const data = await response.json();
      if (data.code === "Ok" && data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const geometry = route.geometry; // Geometria da rota para desenhar no mapa
        const distance = (route.distance / 1000).toFixed(1); // Distância em km
        const duration = Math.round(route.duration / 60); // Duração em minutos
        return { distance, duration, geometry };
      }
    } catch (error) {
      console.error("Erro ao obter rota:", error);
    }
    return null;
  }

  /**
   * Atualiza o display de distância no mapa.
   */
  function updateDistanceDisplay(distance) {
    distanceDisplay.innerHTML = `${distance}<span class="unit">km</span>`;
    distanceDisplay.style.display = "flex";
  }

  /**
   * Adiciona marcadores de início (carro) e fim (pacote) da rota no mapa.
   */
  function addRouteMarkers(startCoords, endCoords) {
    // O marcador do entregador (userLocationMarker) já está no mapa, então adicionamos apenas o do cliente.
    // Usa um ícone customizado para a localização do cliente (fim da rota)
    const clientIcon = L.icon({
      iconUrl: "./CarroIcone/cliente.png",
      iconSize: [50, 50], // Tamanho do ícone
      iconAnchor: [25, 50], // Ponto do ícone que corresponde à localização
    });

    const endMarker = L.marker([endCoords.lat, endCoords.lon], {
      icon: clientIcon,
    }).addTo(map);

    routeMarkers.push(endMarker); // Adiciona apenas o marcador do cliente para ser limpo depois
  }

  /**
   * Limpa a rota e os marcadores de rota do mapa.
   */
  function clearRouteFromMap() {
    if (routeLayer) {
      map.removeLayer(routeLayer);
      routeLayer = null;
    }
    routeMarkers.forEach((marker) => map.removeLayer(marker));
    routeMarkers = [];
  }

  /**
   * Atualiza o status de um pedido no Firebase.
   */
  async function updateStatus(pedidoId, newStatus) {
    const updates = {};
    updates[`/pedidos/${pedidoId}/status`] = newStatus;
    try {
      await update(ref(db), updates);
      // Se a entrega finalizada era a que estava em navegação, para o modo de navegação.
      if (activeDelivery && activeDelivery.orderId === pedidoId) {
        stopNavigation();
      }
      alert('Status do pedido atualizado para "Entregue" com sucesso!');
    } catch (err) {
      console.error("Erro ao atualizar status:", err);
      alert("Ocorreu um erro ao atualizar o status do pedido.");
    }
  }
});
