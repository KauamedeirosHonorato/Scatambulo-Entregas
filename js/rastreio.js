import { getPedido, listenToEntregadorLocation } from "./firebase.js";
import * as Map from "./map.js";
import * as MapLogic from "./map-logic.js"; // Reusing MapLogic for route calculations

document.addEventListener("DOMContentLoaded", () => {
  const orderCodeInput = document.getElementById("order-code-input");
  const trackOrderButton = document.getElementById("track-order-button");
  const trackingMessage = document.getElementById("tracking-message");
  const mapSection = document.getElementById("map-section");
  const customerEtaDisplay = document.getElementById("customer-eta-display");
  const customerSpeedDisplay = document.getElementById("customer-speed-display");
  const deliveryStatusSpan = document.getElementById("delivery-status");
  const customerNameSpan = document.getElementById("customer-name");
  const customerAddressSpan = document.getElementById("customer-address");

  let currentOrderId = null;
  let currentOrder = null;
  let entregadorLocation = null;

  // Initialize map without a specific location initially
  Map.initializeMap("map");

  trackOrderButton.addEventListener("click", trackOrder);

  async function trackOrder() {
    const orderCode = orderCodeInput.value.trim().toUpperCase();
    trackingMessage.textContent = "";
    mapSection.style.display = "none";
    Map.clearMap(); // Clear any previous map elements

    if (!orderCode || !orderCode.startsWith("SC") || orderCode.length !== 8) {
      trackingMessage.textContent = "Por favor, insira um código de pedido válido (Ex: SC123456).";
      return;
    }

    try {
      const pedido = await getPedido(orderCode.toLowerCase()); // Firebase stores IDs in lowercase

      if (!pedido) {
        trackingMessage.textContent = "Pedido não encontrado.";
        return;
      }

      currentOrder = pedido;
      currentOrderId = orderCode.toLowerCase();

      customerNameSpan.textContent = pedido.nomeCliente;
      customerAddressSpan.textContent = pedido.endereco;
      deliveryStatusSpan.textContent = getStatusText(pedido.status);

      if (pedido.status === "em_entrega") {
        mapSection.style.display = "block";
        MapLogic.processActiveDelivery({ [currentOrderId]: pedido }); // Pass current order to MapLogic
        listenToEntregadorLocation(updateMapAndInfo);
      } else {
        trackingMessage.textContent = `O status do pedido é "${getStatusText(pedido.status)}". A rota só é visível para pedidos "Em Entrega".`;
      }

    } catch (error) {
      console.error("Erro ao rastrear pedido:", error);
      trackingMessage.textContent = "Ocorreu um erro ao rastrear o pedido. Tente novamente.";
    }
  }

  function updateMapAndInfo(location) {
    entregadorLocation = location;
    if (entregadorLocation && currentOrder) {
      MapLogic.updateEntregadorLocation(entregadorLocation);
      MapLogic.processActiveDelivery({ [currentOrderId]: currentOrder }).then(() => {
        // Update ETA and Speed from the active delivery data
        const activeDeliveryOrder = MapLogic.getActiveDelivery();
        if (activeDeliveryOrder && activeDeliveryOrder.entrega) {
          const entregaData = activeDeliveryOrder.entrega;
          const speedText = typeof entregaData.velocidade === "number" ? `${entregaData.velocidade} km/h` : "...";
          const timeText = typeof entregaData.tempoEstimado === "number" || !isNaN(entregaData.tempoEstimado) ? `${entregaData.tempoEstimado} min` : "...";

          customerEtaDisplay.textContent = timeText;
          customerSpeedDisplay.textContent = speedText;
          customerEtaDisplay.style.display = "block";
          customerSpeedDisplay.style.display = "block";
        } else {
          customerEtaDisplay.style.display = "none";
          customerSpeedDisplay.style.display = "none";
        }
      });
    }
  }

  function getStatusText(status) {
    switch (status) {
      case "novo": return "Novo Pedido";
      case "pendente": return "Pendente";
      case "em_preparo": return "Em Preparo";
      case "feito": return "Feito";
      case "pronto_para_entrega": return "Pronto para Entrega";
      case "em_entrega": return "Em Entrega";
      case "entregue": return "Entregue";
      default: return status;
    }
  }
});