import { db, ref, onValue } from "./firebase.js";
import { geocodeAddress } from "./utils.js";
import * as Map from "./map.js";

document.addEventListener("DOMContentLoaded", () => {
  const orderCodeInput = document.getElementById("order-code-input");
  const trackOrderButton = document.getElementById("track-order-button");
  const trackingMessage = document.getElementById("tracking-message");
  const orderDetailsSection = document.getElementById("order-details-section");
  const mapContainer = document.getElementById("map-container");

  let activeOrderListener = null; // Para parar de ouvir o pedido anterior
  let entregadorListener = null; // Para parar de ouvir o entregador anterior
  let mapInitialized = false;

  trackOrderButton.addEventListener("click", trackOrder);
  orderCodeInput.addEventListener("keyup", (e) => {
    if (e.key === "Enter") trackOrder();
  });

  function trackOrder() {
    const orderId = orderCodeInput.value.trim().toLowerCase();
    if (!orderId) {
      showMessage("Por favor, insira um código de pedido.", true);
      return;
    }

    // Limpa listeners antigos antes de criar novos
    if (activeOrderListener) activeOrderListener();
    if (entregadorListener) entregadorListener();

    const orderRef = ref(db, `pedidos/${orderId}`);
    activeOrderListener = onValue(
      orderRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const orderData = snapshot.val();
          displayOrderDetails(orderId, orderData);
        } else {
          showMessage("Pedido não encontrado.", true);
          orderDetailsSection.style.display = "none";
        }
      },
      (error) => {
        console.error(error);
        showMessage("Erro ao buscar o pedido.", true);
      }
    );
  }

  function showMessage(msg, isError = false) {
    trackingMessage.textContent = msg;
    trackingMessage.style.color = isError ? "var(--danger-color)" : "#333";
  }

  function displayOrderDetails(orderId, order) {
    showMessage(""); // Limpa mensagens de erro
    orderDetailsSection.style.display = "block";

    document.getElementById(
      "order-id-display"
    ).textContent = `#${orderId.toUpperCase()}`;
    document.getElementById("cake-name").textContent = order.nomeBolo;
    document.getElementById("client-name").textContent = order.nomeCliente;

    updateStatusTimeline(order.status);

    if (order.status === "em_entrega") {
      showMap();
      listenToEntregador(order);
    } else {
      mapContainer.style.display = "none";
    }
  }

  function updateStatusTimeline(currentStatus) {
    const statuses = [
      "em_preparo",
      "pronto_para_entrega",
      "em_entrega",
      "entregue",
    ];
    const currentIndex = statuses.indexOf(currentStatus);

    document.querySelectorAll(".status-step").forEach((step, index) => {
      step.classList.remove("active", "completed");
      if (index < currentIndex) {
        step.classList.add("completed");
      } else if (index === currentIndex && currentStatus === "entregue") {
        // Se for o último status (entregue), marca como completo também
        step.classList.add("completed");
      } else if (index === currentIndex) {
        step.classList.add("active");
      }
    });
  }

  function showMap() {
    mapContainer.style.display = "block";
    if (!mapInitialized) {
      Map.initializeMap("map");
      mapInitialized = true;
    }
    // Força o mapa a se redimensionar corretamente dentro do modal
    setTimeout(() => Map.invalidateMapSize(), 100);
  }

  async function listenToEntregador(order) {
    // Limpa listener antigo
    if (entregadorListener) entregadorListener();

    const entregadorRef = ref(db, "localizacao/entregador");
    const clientCoords = await geocodeAddress(order.endereco);

    if (clientCoords.error) {
      console.warn("Não foi possível obter as coordenadas do cliente.");
      return;
    }

    entregadorListener = onValue(entregadorRef, (snapshot) => {
      if (!snapshot.exists()) return;

      const entregadorLocation = snapshot.val();
      updateMap(entregadorLocation, clientCoords, order);
    });
  }

  function updateMap(entregadorLocation, clientCoords, order) {
    if (!mapInitialized) return;

    // Limpa marcadores e rotas antigas
    Map.clearMap();

    // Adiciona marcador do cliente
    Map.updateClientMarkerOnMap(clientCoords, {
      title: "Seu Endereço",
      isDraggable: false,
    });

    // Adiciona marcador do entregador
    if (entregadorLocation) {
      Map.updateDeliveryMarkerOnMap(entregadorLocation, {
        title: "Entregador",
      });
    }

    // Desenha a rota se existir no pedido
    if (order.entrega && order.entrega.geometria) {
      Map.drawRouteOnMap(order.entrega.geometria);
    }

    // Ajusta o zoom do mapa para mostrar ambos os pontos
    if (entregadorLocation && clientCoords) {
      Map.fitMapToBounds(entregadorLocation, clientCoords);
    } else {
      // Se não tiver localização do entregador, foca no cliente
      Map.panMapTo(
        { latitude: clientCoords.lat, longitude: clientCoords.lon },
        15
      );
    }
  }
});
