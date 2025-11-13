import { db, ref, set, onValue } from "./firebase.js";

document.addEventListener("DOMContentLoaded", () => {
  // Proteção de rota: verifica se o usuário logado é o Alexandre
  const currentUser = JSON.parse(localStorage.getItem("currentUser"));
  if (!currentUser || currentUser.panel !== "entregador.html") {
    window.location.href = "index.html";
    return;
  }

  // --- Seleção dos Elementos do DOM ---
  const logoutButton = document.getElementById("logout-button");
  const locationStatus = document.getElementById("location-status");
  const permissionActions = document.getElementById("permission-actions");
  const readyOrdersList = document.getElementById("ready-orders-list");

  let map; // Declarada no escopo principal
  let marker;
  let alexandreLocation = null;

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
          "Este aplicativo precisa da sua localização para funcionar.";
        const grantButton = document.createElement("button");
        grantButton.textContent = "Ativar Localização";
        grantButton.className = "btn-primary";
        grantButton.onclick = () => {
          // Ao clicar, o navegador mostrará o aviso para aceitar ou rejeitar
          startWatchingLocation();
        };
        permissionActions.appendChild(grantButton);
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
          alexandreLocation = { latitude, longitude }; // Armazena a localização
          locationStatus.textContent = "Localização ativa.";

          // Atualiza o mapa
          const latLng = [latitude, longitude];
          if (!marker) {
            marker = L.marker(latLng).addTo(map);
          } else {
            marker.setLatLng(latLng);
          }
          map.setView(latLng, 16);

          // Envia para o Firebase
          const locationRef = ref(db, "localizacao/alexandre");
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
      const readyOrders = Object.entries(pedidos)
        .filter(([id, pedido]) => pedido.status === "pronto_para_entrega")
        .reduce((acc, [id, pedido]) => {
          acc[id] = pedido;
          return acc;
        }, {});
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
      card.innerHTML = `
                <h4>${order.nomeBolo}</h4>
                <p><strong>Cliente:</strong> ${order.nomeCliente}</p>
                <p><strong>Endereço:</strong> ${order.endereco}</p>
                <div class="route-info" id="route-info-${orderId}"></div>
                <div class="order-actions">
                    <button class="btn-secondary route-button">Ver Rota</button>
                </div>
            `;

      card
        .querySelector(".route-button")
        .addEventListener("click", async () => {
          if (!alexandreLocation) {
            alert("Aguardando sua localização para calcular a rota.");
            return;
          }

          const routeInfoDiv = card.querySelector(`#route-info-${orderId}`);
          routeInfoDiv.textContent = "Calculando rota...";

          const destinationCoords = await geocodeAddress(order.endereco);
          if (!destinationCoords) {
            routeInfoDiv.textContent = "Não foi possível encontrar o endereço.";
            return;
          }

          const routeDetails = await getRouteDetails(
            alexandreLocation,
            destinationCoords
          );
          if (routeDetails) {
            routeInfoDiv.innerHTML = `<strong>Distância:</strong> ${routeDetails.distance} km | <strong>Tempo:</strong> ${routeDetails.duration} min`;
          } else {
            routeInfoDiv.textContent = "Erro ao calcular a rota.";
          }
        });

      readyOrdersList.appendChild(card);
    }
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
    const url = `https://router.project-osrm.org/route/v1/driving/${startCoords.longitude},${startCoords.latitude};${endCoords.lon},${endCoords.lat}?overview=false`;
    try {
      const response = await fetch(url);
      const data = await response.json();
      if (data.code === "Ok" && data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const distance = (route.distance / 1000).toFixed(1); // Distância em km
        const duration = Math.round(route.duration / 60); // Duração em minutos
        return { distance, duration };
      }
    } catch (error) {
      console.error("Erro ao obter rota:", error);
    }
    return null;
  }
});
