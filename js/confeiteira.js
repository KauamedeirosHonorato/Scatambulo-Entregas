import {
  listenToPedidos,
  listenToEntregadorLocation,
  createNewOrder,
  updateOrderStatus,
} from "./firebase.js";
import { parseWhatsappMessage, calculateSpeed } from "./utils.js";
import { loadComponents } from "./componentLoader.js";
import * as MapLogic from "./map-logic.js";
import * as UI from "./ui-confeiteira.js";

// Configurações e Constantes
const CONSTANTS = {
  AUDIO_NEW_ORDER: "audio/NotificacaoPedidoNovo.mp3",
  AUDIO_DELIVERY_COMPLETE: "audio/NotificacaoPedidoEntregue.mp3",
  PAGES: {
    LOGIN: "index.html",
    PANEL: "confeiteira.html"
  },
  CEP_API_URL: "https://viacep.com.br/ws/"
};

// Estado Global da Aplicação
const state = {
  currentUser: null,
  newOrderSound: null,
  deliveryCompleteSound: null,
  knownOrderIds: new Set(),
  knownDeliveredOrderIds: new Set(),
  isFirstLoad: true,
};

document.addEventListener("DOMContentLoaded", initApp);

function initApp() {
  // 1. Verificação de Autenticação
  try {
    state.currentUser = JSON.parse(localStorage.getItem("currentUser"));
    if (!state.currentUser || state.currentUser.panel !== CONSTANTS.PAGES.PANEL) {
      window.location.href = CONSTANTS.PAGES.LOGIN;
      return;
    }
  } catch (e) {
    console.error("Erro ao ler usuário:", e);
    window.location.href = CONSTANTS.PAGES.LOGIN;
    return;
  }

  // 2. Inicialização de Sons
  state.newOrderSound = new Audio(CONSTANTS.AUDIO_NEW_ORDER);
  state.deliveryCompleteSound = new Audio(CONSTANTS.AUDIO_DELIVERY_COMPLETE);

  // 3. Carregamento de Componentes e Configuração Inicial
  loadComponents(
    "#modal-container",
    ["components/modal-new-order.html", "components/modal-read-message.html"],
    () => {
      MapLogic.initializeMapWithLocation("map");
      setupUIEventListeners();
      listenToFirebaseChanges();
    }
  );
}

function setupUIEventListeners() {
  UI.setupEventListeners(
    handleLogout,
    handleNewOrderSubmit,
    handleReadMessageSubmit,
    handleCepBlur
  );
}

function handleLogout() {
  localStorage.removeItem("currentUser");
  window.location.href = CONSTANTS.PAGES.LOGIN;
}

  function listenToFirebaseChanges() {
    listenToPedidos((pedidos) => {
      const visibleStatuses = ["pendente", "em_preparo", "feito"];
      const currentPendingOrderIds = new Set();
      const currentDeliveredOrderIds = new Set();
  
      for (const pedidoId in pedidos) {
        if (pedidos[pedidoId].status === "pendente") {
          currentPendingOrderIds.add(pedidoId);
          if (!state.isFirstLoad && !state.knownOrderIds.has(pedidoId)) {
            state.newOrderSound.play().catch(console.warn);
          }
        }
        if (pedidos[pedidoId].status === "entregue") {
          currentDeliveredOrderIds.add(pedidoId);
          if (!state.isFirstLoad && !state.knownDeliveredOrderIds.has(pedidoId)) {
            state.deliveryCompleteSound.play().catch(console.warn);
          }
        }
      }
  
      state.knownOrderIds = currentPendingOrderIds;
      state.knownDeliveredOrderIds = currentDeliveredOrderIds;
      state.isFirstLoad = false;
  
      // Filtra os pedidos para mostrar apenas os relevantes para a confeiteira
      const confeiteiraPedidos = Object.fromEntries(
        Object.entries(pedidos).filter(([, pedido]) =>
          visibleStatuses.includes(pedido.status)
        )
      );
      UI.renderBoard(confeiteiraPedidos, updateOrderStatus, UI.printLabel);
      MapLogic.processActiveDelivery(pedidos).then(updateMapInfo);
    });
  
    listenToEntregadorLocation((location) => {
      MapLogic.updateEntregadorLocation(location);
      if (!location) {
        UI.updateDeliveryPersonStatus("Aguardando localização do entregador...");
        return;
      }
      UI.updateDeliveryPersonStatus(
        `Entregador localizado em: ${location.latitude.toFixed(
          4
        )}, ${location.longitude.toFixed(4)}`
      );
      updateMapInfo();
    });
  }
  function updateMapInfo() {
    const activeDeliveryOrder = MapLogic.getActiveDelivery();
    const entregadorLocation = MapLogic.getEntregadorLocation();
  
    if (!activeDeliveryOrder || !entregadorLocation) {
      UI.clearConfeiteiraMapInfo();
      return;
    }
  
    const entregaData = activeDeliveryOrder.entrega;
    if (!entregaData) {
      UI.clearConfeiteiraMapInfo();
      return;
    }
  
    const currentSpeed = calculateSpeed(
      entregadorLocation,
      entregaData.lastEntregadorCoords
    );
    UI.updateConfeiteiraMapInfo(
      activeDeliveryOrder,
      entregaData,
      currentSpeed
    );
  }
  function handleNewOrderSubmit(e) {
    e.preventDefault();
    const form = e.target;
    
    const nomeBolo = form.querySelector("#cakeName").value;
    const nomeCliente = form.querySelector("#clientName").value;
    const clientEmail = form.querySelector("#clientEmail").value;
    const cep = form.querySelector("#cep").value;
    const rua = form.querySelector("#rua").value;
    const bairro = form.querySelector("#bairro").value;
    const numero = form.querySelector("#numero").value;
    const complemento = form.querySelector("#complemento").value;
    const whatsapp = form.querySelector("#whatsapp").value;
    const endereco = `${rua}, ${numero}, ${bairro}, CEP: ${cep}`;
  
    createNewOrder({
      nomeCliente,
      clientEmail,
      endereco,
      nomeBolo,
      cep,
      rua,
      bairro,
      numero,
      complemento,
      whatsapp,
    });
    form.reset();
    document.getElementById("new-order-modal").style.display = "none";
  }
  
  function handleReadMessageSubmit(e) {
    e.preventDefault();
    const messageText = document.getElementById("message-text").value;
    if (!messageText) return; // Guard clause
  
    const parsedData = parseWhatsappMessage(messageText);
    if (!parsedData) {
      console.warn("Mensagem do WhatsApp não pôde ser parseada.");
      return; // Guard clause
    }
  
    const orderData = {
      clientName: parsedData.cliente.nome,
      cakeName: parsedData.itens.length > 0 ? parsedData.itens[0].nome : "",
      whatsapp: parsedData.cliente.telefone,
      rua: parsedData.cliente.enderecoRaw,
    };
  
    UI.fillOrderForm(orderData);
  
    document.getElementById("read-message-modal").style.display = "none";
    document.getElementById("new-order-modal").style.display = "block";
  }
  
  async function handleCepBlur(e) {
    const cep = e.target.value.replace(/\D/g, "");
    if (cep.length !== 8) return; // Guard clause
  
    try {
      const response = await fetch(`${CONSTANTS.CEP_API_URL}${cep}/json/`);
      if (!response.ok) { // Guard clause for network errors
        console.error("Erro na requisição CEP:", response.statusText);
        return;
      }
      const data = await response.json();
      if (data.erro) { // Guard clause for CEP not found
        console.warn("CEP não encontrado.");
        return;
      }
      document.getElementById("rua").value = data.logradouro;
      document.getElementById("bairro").value = data.bairro;
    } catch (error) {
      console.error("Erro ao buscar CEP:", error);
    }
  }});
