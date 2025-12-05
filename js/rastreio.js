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

  // 1. Inicializa o mapa primeiro para garantir que a promessa exista.
  mapInitPromise = Map.initializeMap(
    "rastreio-map",
    [-51.9333, -23.4243],
    12,
    true
  );
  mapInitPromise
    .then(() => {
      // 2. Após a inicialização do mapa, verifica se há um ID na URL e inicia a busca.
      const urlParams = new URLSearchParams(window.location.search);
      const orderIdFromUrl = urlParams.get("id");
      if (orderIdFromUrl) {
        orderCodeInput.value = orderIdFromUrl;
        trackOrder();
      }
    })
    .catch((error) => {
      console.error("Falha ao inicializar o mapa:", error);
      showMessage("Não foi possível carregar o mapa.", true);
    });

  // --- Funções de UI ---
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

  function updateStaticOrderDetails(id, order) {
    orderDetailsSection.style.display = "block";
    trackingMessage.style.display = "none";

    const idDisplay = document.getElementById("order-id-display");
    idDisplay.textContent = `#${id.toUpperCase()}`;

    // Remove o botão de cópia antigo, se existir, para evitar duplicação
    const existingCopyBtn = document.getElementById("copy-tracking-link-btn");
    if (existingCopyBtn) {
      existingCopyBtn.remove();
    }

    // Cria e adiciona o botão de copiar link
    const copyButton = document.createElement("button");
    copyButton.id = "copy-tracking-link-btn";
    copyButton.className = "copy-link-button"; // Para estilização opcional
    copyButton.title = "Copiar link de rastreio";
    copyButton.innerHTML = '<i class="ph ph-link"></i>'; // Ícone de link

    copyButton.addEventListener("click", () => {
      const trackingUrl = window.location.href;
      navigator.clipboard
        .writeText(trackingUrl)
        .then(() => {
          showToast("Link de rastreio copiado!", "success");
        })
        .catch(() => {
          showToast("Falha ao copiar o link.", "error");
        });
    });

    idDisplay.insertAdjacentElement("afterend", copyButton);

    document.getElementById("order-cake-name").textContent =
      order.nomeBolo ||
      order.item ||
      (order.items && order.items.length > 0 ? order.items[0].nome : "N/A");
    document.getElementById("order-client-name").textContent =
      order.nomeCliente || "N/A";

    updateStatusFlow(order.status);
  }

  function updateStatusFlow(currentStatus) {
    const steps = document.querySelectorAll('.status-step');
    const statusOrderOnTimeline = Array.from(steps).map(step => step.dataset.status);

    // Mapeia os status internos do sistema para os passos visíveis na timeline
    const statusMap = {
      'pendente': -1, // Antes da timeline começar
      'em_preparo': statusOrderOnTimeline.indexOf('em_preparo'),
      'feito': statusOrderOnTimeline.indexOf('em_preparo'), // 'feito' significa que 'em_preparo' foi concluído
      'pronto_para_entrega': statusOrderOnTimeline.indexOf('pronto_para_entrega'),
      'em_entrega': statusOrderOnTimeline.indexOf('em_entrega'),
      'entregue': statusOrderOnTimeline.indexOf('entregue')
    };

    const currentIndex = statusMap[currentStatus] ?? -1;

    steps.forEach((step, index) => {
      step.classList.remove('active', 'completed');

      if (index < currentIndex) {
        step.classList.add('completed');
      } else if (index === currentIndex) {
        // Se o status real for 'feito', o passo 'em_preparo' está apenas concluído, não ativo.
        // Caso contrário, o passo atual está ativo.
        if (currentStatus === 'feito') {
          step.classList.add('completed');
        } else {
          step.classList.add('active');
        }
      }
    });
  }

  // --- Lógica Principal de Rastreio ---

  function cleanupPreviousState() {
    if (activeOrderListener) activeOrderListener(); // Remove o listener antigo do Firebase
    if (entregadorListener) entregadorListener();
    activeOrderListener = null;
    entregadorListener = null;
  }

  function trackOrder() {
    const orderId = orderCodeInput.value.trim().toLowerCase();
    if (!orderId) {
      showMessage("Por favor, insira um código de pedido.", true);
      return;
    }

    // Limpa estado e listeners antigos
    cleanupPreviousState();
    currentOrder = null;
    clientCoordinates = null;
    deliveryPersonLocation = null;
    mapInitPromise.then(() => Map.clearMap());

    hideDetails();
    showMessage("Rastreando pedido...", false);

    // Inicia o listener principal do pedido
    const orderRef = ref(db, `pedidos/${orderId}`);
    activeOrderListener = onValue(
      orderRef,
      (snapshot) => handleOrderUpdate(orderId, snapshot),
      (error) => {
        console.error("Erro ao ler dados do pedido:", error);
        showMessage("Erro de conexão ao rastrear o pedido.", true);
        hideDetails();
      }
    );

    // Atualiza a URL e o foco após iniciar a busca.
    // Esta lógica foi movida de um .then() incorreto.
    window.history.pushState({}, "", `?id=${orderId}`);
    trackOrderButton.focus(); // Move o foco para o botão
  }

  async function handleOrderUpdate(orderId, snapshot) {
    if (!snapshot.exists()) {
      showMessage(
        `Pedido #${orderId.toUpperCase()} não encontrado. Verifique o código.`,
        true
      );
      hideDetails();
      return;
    }

    currentOrder = snapshot.val();
    updateStaticOrderDetails(orderId, currentOrder);

    const thankYouMessage = document.getElementById("thank-you-message");

    // Limpa o listener do entregador se o status não for 'em_entrega'
    if (currentOrder.status !== "em_entrega" && entregadorListener) {
      cleanupPreviousState();
    }

    if (currentOrder.status === "em_entrega") {
      if (thankYouMessage) thankYouMessage.style.display = "none";
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
      // Para qualquer outro status que não seja 'em_entrega'
      mapContainer.style.display = "none";
      if (entregadorListener) {
        entregadorListener(); // Para o listener
        entregadorListener = null;
      }
      mapInitPromise.then(() => Map.clearMap());

      // Mostra a mensagem de agradecimento se o status for 'entregue'
      if (currentOrder.status === "entregue") {
        if (thankYouMessage) thankYouMessage.style.display = "block";
      } else {
        if (thankYouMessage) thankYouMessage.style.display = "none";
      }
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

    // 1. Desenha marcador do cliente
    if (clientCoordinates && !clientCoordinates.error) {
      Map.updateClientMarkerOnMap(clientCoordinates);
    } else {
      Map.updateClientMarkerOnMap(null); // Garante que o marcador seja removido se não houver coordenadas
    }

    // 2. Desenha marcador do entregador
    if (deliveryPersonLocation) {
      Map.updateDeliveryMarkerOnMap(deliveryPersonLocation, clientCoordinates);
    } else {
      Map.updateDeliveryMarkerOnMap(null); // Garante que o marcador seja removido
    }

    // 3. Desenha a rota
    if (currentOrder && currentOrder.entrega && currentOrder.entrega.geometria) {
      Map.drawMainRoute(currentOrder.entrega.geometria);
    } else {
      Map.drawMainRoute(null); // Garante que a rota seja limpa se não houver geometria
    }

    // 4. Ajusta o zoom
    if (
      deliveryPersonLocation &&
      clientCoordinates &&
      !clientCoordinates.error
    ) {
      Map.fitMapToBounds(deliveryPersonLocation, clientCoordinates);
    } else if (clientCoordinates && !clientCoordinates.error) {
      // Se apenas a localização do cliente estiver disponível, centraliza o mapa nela.
      Map.panMapTo({ latitude: clientCoordinates.lat, longitude: clientCoordinates.lon });
    }
  }
});
