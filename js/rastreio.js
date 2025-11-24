/**
 * js/rastreio.js - Lógica para Rastreamento de Pedido pelo Cliente
 */
import { db, ref, onValue, get } from "./firebase.js";
import { geocodeAddress } from "./utils.js";
import * as Map from "./map.js";
import { showToast } from "./ui.js";

document.addEventListener("DOMContentLoaded", () => {
  const orderCodeInput = document.getElementById("order-code-input");
  const trackOrderButton = document.getElementById("track-order-button");
  const trackingMessage = document.getElementById("tracking-message");
  const orderDetailsSection = document.getElementById("order-details-section");
  const mapContainer = document.getElementById("map-container");

  // --- Estado da Aplicação ---
  let activeOrderListener = null;
  let entregadorListener = null;
  let mapInitPromise = null;

  // Estado para renderização do mapa
  let currentOrder = null;
  let clientCoordinates = null;
  let deliveryPersonLocation = null;

  // --- Inicialização ---
  trackOrderButton.addEventListener("click", trackOrder);
  orderCodeInput.addEventListener("keyup", (e) => {
    if (e.key === "Enter") trackOrder();
  });

  mapInitPromise = Map.initializeMap("rastreio-map", [-51.9333, -23.4243], 12, true);
  mapInitPromise.catch(error => {
    console.error("Falha ao inicializar o mapa:", error);
    showMessage("Não foi possível carregar o mapa.", true);
  });

  // --- Funções de UI ---
  function showMessage(message, isError = false) {
    trackingMessage.textContent = message;
    trackingMessage.style.color = isError ? "var(--ios-red)" : "var(--ios-blue)";
    trackingMessage.style.display = "block";
  }

  function hideDetails() {
    orderDetailsSection.style.display = "none";
    mapContainer.style.display = "none";
    trackingMessage.style.display = "none";
  }

  function updateStaticOrderDetails(id, order) {
    orderDetailsSection.style.display = "block";
    trackingMessage.style.display = "none";

    document.getElementById("order-id-display").textContent = `#${id.toUpperCase()}`;
    document.getElementById("order-cake-name").textContent =
      order.nomeBolo || order.item || (order.items && order.items.length > 0 ? order.items[0].nome : "N/A");
    document.getElementById("order-client-name").textContent = order.nomeCliente || "N/A";

    updateStatusFlow(order.status);
  }

  function updateStatusFlow(currentStatus) {
    const steps = document.querySelectorAll(".status-step");
    let activateNext = true;
    steps.forEach((step) => {
      const statusId = step.dataset.status;
      if (activateNext) {
        step.classList.add("active");
      } else {
        step.classList.remove("active");
      }
      if (statusId === currentStatus) {
        activateNext = false;
      }
    });
  }

  // --- Lógica Principal de Rastreio ---

  function trackOrder() {
    const orderId = orderCodeInput.value.trim().toLowerCase();
    if (!orderId) {
      showMessage("Por favor, insira um código de pedido.", true);
      return;
    }

    // Limpa estado e listeners antigos
    if (activeOrderListener) activeOrderListener();
    if (entregadorListener) entregadorListener();
    currentOrder = null;
    clientCoordinates = null;
    deliveryPersonLocation = null;
    
    if(mapInitPromise) {
        mapInitPromise.then(() => Map.clearMap());
    }

    hideDetails();
    showMessage("Rastreando pedido...", false);

    // Inicia o listener principal do pedido
    const orderRef = ref(db, `pedidos/${orderId}`);
    activeOrderListener = onValue(orderRef, (snapshot) => handleOrderUpdate(orderId, snapshot), (error) => {
      console.error("Erro ao ler dados do pedido:", error);
      showMessage("Erro de conexão ao rastrear o pedido.", true);
      hideDetails();
    });
  }

  async function handleOrderUpdate(orderId, snapshot) {
    if (!snapshot.exists()) {
      showMessage(`Pedido #${orderId.toUpperCase()} não encontrado. Verifique o código.`, true);
      hideDetails();
      return;
    }

    currentOrder = snapshot.val();
    updateStaticOrderDetails(orderId, currentOrder);

    if (currentOrder.status === "em_entrega") {
      mapContainer.style.display = "block";
      
      // Inicia o listener do entregador (se ainda não estiver ativo)
      if (!entregadorListener) {
        startEntregadorListener();
      }

      // Geocodifica o endereço do cliente (se ainda não tivermos as coordenadas)
      if (!clientCoordinates) {
        clientCoordinates = await geocodeAddress(currentOrder.endereco);
        if (clientCoordinates.error) {
          console.warn("Não foi possível obter as coordenadas do cliente.");
        }
      }

      // Redesenha o mapa com os dados mais recentes
      await redrawMap();

    } else {
      mapContainer.style.display = "none";
      if (entregadorListener) {
        entregadorListener(); // Para o listener
        entregadorListener = null;
      }
      mapInitPromise.then(() => Map.clearMap());
    }
  }

  function startEntregadorListener() {
    if (entregadorListener) return; // Garante que não haja múltiplos listeners
    const entregadorRef = ref(db, "localizacao/entregador");
    entregadorListener = onValue(entregadorRef, async (snapshot) => {
      if (snapshot.exists()) {
        deliveryPersonLocation = snapshot.val();
        await redrawMap(); // Redesenha o mapa quando a localização muda
      }
    });
  }

  async function redrawMap() {
    await mapInitPromise;
    Map.invalidateMapSize();
    Map.clearMap();

    // 1. Desenha marcador do cliente
    if (clientCoordinates && !clientCoordinates.error) {
      Map.updateClientMarkerOnMap(clientCoordinates);
    }

    // 2. Desenha marcador do entregador
    if (deliveryPersonLocation) {
      Map.updateDeliveryMarkerOnMap(deliveryPersonLocation, clientCoordinates);
    }

    // 3. Desenha a rota
    if (currentOrder && currentOrder.entrega && currentOrder.entrega.geometria) {
      Map.drawMainRoute(currentOrder.entrega.geometria);
    }

    // 4. Ajusta o zoom
    if (deliveryPersonLocation && clientCoordinates && !clientCoordinates.error) {
      Map.fitMapToBounds(deliveryPersonLocation, clientCoordinates);
    } else if (clientCoordinates && !clientCoordinates.error) {
      Map.fitMapToBounds(clientCoordinates, clientCoordinates, 14);
    }
  }
});
