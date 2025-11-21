/**
 * js/rastreio.js - Lógica para Rastreamento de Pedido pelo Cliente
 */
import { db, ref, onValue } from "./firebase.js";
import { geocodeAddress } from "./utils.js";
import * as Map from "./map.js";
import { showToast } from "./ui.js";

document.addEventListener("DOMContentLoaded", () => {
  const orderCodeInput = document.getElementById("order-code-input");
  const trackOrderButton = document.getElementById("track-order-button");
  const trackingMessage = document.getElementById("tracking-message");
  const orderDetailsSection = document.getElementById("order-details-section");
  const mapContainer = document.getElementById("map-container");

  let activeOrderListener = null;
  let entregadorListener = null;
  let mapInitialized = false;

  trackOrderButton.addEventListener("click", trackOrder);
  orderCodeInput.addEventListener("keyup", (e) => {
    if (e.key === "Enter") trackOrder();
  });

  // Inicializa o mapa com o ponto central da cidade
  Map.initializeMap("rastreio-map", [-51.9333, -23.4243], 12, true).then(() => {
    mapInitialized = true;
  });

  function showMessage(message, isError = false) {
    trackingMessage.textContent = message;
    trackingMessage.style.color = isError
      ? "var(--ios-red)"
      : "var(--ios-blue)";
    trackingMessage.style.display = "block";
  }

  function hideDetails() {
    orderDetailsSection.style.display = "none";
    mapContainer.style.display = "none";
    trackingMessage.style.display = "none";
  }

  function trackOrder() {
    const orderId = orderCodeInput.value.trim().toLowerCase();
    if (!orderId) {
      showMessage("Por favor, insira um código de pedido.", true);
      return;
    }

    // Limpa listeners antigos
    if (activeOrderListener) activeOrderListener();
    if (entregadorListener) entregadorListener();
    Map.clearMap();
    hideDetails();
    showMessage("Rastreando pedido...", false);

    const orderRef = ref(db, `pedidos/${orderId}`);
    activeOrderListener = onValue(
      orderRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const orderData = snapshot.val();
          displayOrderDetails(orderId, orderData);
        } else {
          showMessage(
            `Pedido #${orderId.toUpperCase()} não encontrado. Verifique o código.`,
            true
          );
          hideDetails();
        }
      },
      (error) => {
        console.error("Erro ao ler dados do pedido:", error);
        showMessage("Erro de conexão ao rastrear o pedido.", true);
        hideDetails();
      }
    );
  }

  function displayOrderDetails(id, order) {
    orderDetailsSection.style.display = "block";
    trackingMessage.style.display = "none";

    // Preenche os dados do pedido
    document.getElementById(
      "order-id-display"
    ).textContent = `#${id.toUpperCase()}`;
    document.getElementById("order-cake-name").textContent =
      order.item ||
      (order.items && order.items.length > 0 ? order.items[0].nome : "N/A");
    document.getElementById("order-client-name").textContent =
      order.nomeCliente || "N/A";

    // Atualiza a barra de status visual
    updateStatusFlow(order.status);

    // Lógica para o mapa (só exibe e rastreia se estiver em entrega)
    if (order.status === "em_entrega") {
      mapContainer.style.display = "block";
      startEntregadorListener(order);
    } else {
      mapContainer.style.display = "none";
      if (entregadorListener) entregadorListener(); // Para o listener se sair do status "em_entrega"
      Map.clearMap(); // Garante que o mapa esteja limpo
    }
  }

  function getStatusText(status) {
    switch (status) {
      case "pendente":
        return "Aguardando Confirmação";
      case "em_preparo":
        return "Em Preparo pela Confeiteira";
      case "pronto_para_entrega":
        return "Pronto para a Rota";
      case "em_entrega":
        return "A Caminho!";
      case "entregue":
        return "Entregue com Sucesso!";
      default:
        return "Status Desconhecido";
    }
  }

  function updateStatusFlow(currentStatus) {
    const steps = document.querySelectorAll(".status-step");
    let activateNext = true;

    steps.forEach((step) => {
      const statusId = step.dataset.status;

      // Se já passou pelo status atual (ou é ele), ativa
      if (activateNext) {
        step.classList.add("active");
      } else {
        step.classList.remove("active");
      }

      // O próximo passo deve ser desativado após o status atual
      if (statusId === currentStatus) {
        activateNext = false;
      }
    });
  }

  async function startEntregadorListener(order) {
    // Para listener anterior, se houver
    if (entregadorListener) entregadorListener();

    const entregadorRef = ref(db, "localizacao/entregador");

    // Obter coordenadas do cliente apenas uma vez
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

    // 1. Limpa tudo (marcadores e rotas)
    Map.clearMap();

    // 2. Adiciona marcador do cliente
    Map.updateClientMarkerOnMap(clientCoords);

    // 3. Adiciona marcador do entregador
    if (entregadorLocation) {
      Map.updateDeliveryMarkerOnMap(entregadorLocation, clientCoords);
    }

    // 4. Desenha a rota se existir no pedido (dados do Admin/Entregador)
    if (order.entrega && order.entrega.geometria) {
      Map.drawMainRoute(order.entrega.geometria);
    }

    // 5. Ajusta o zoom do mapa
    if (entregadorLocation && clientCoords) {
      Map.fitMapToBounds(entregadorLocation, clientCoords);
    } else if (clientCoords) {
      // Se não tiver localização do entregador, foca no cliente
      Map.fitMapToBounds(clientCoords, clientCoords, 14);
    }
  }
});
