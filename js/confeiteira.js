import {
  listenToPedidos,
  listenToEntregadorLocation,
  createNewOrder,
  updateOrderStatus,
} from "./firebase.js";
import { parseWhatsappMessage } from "./utils.js";
import { loadComponents } from "./componentLoader.js";
import * as MapLogic from "./map-logic.js";
import * as UI from "./ui-confeiteira.js";

document.addEventListener("DOMContentLoaded", () => {
  const currentUser = JSON.parse(localStorage.getItem("currentUser"));
  if (!currentUser || currentUser.panel !== "confeiteira.html") {
    window.location.href = "index.html";
    return;
  }

  const newOrderSound = new Audio("audio/NotificacaoPedidoNovo.mp3");
  const deliveryCompleteSound = new Audio(
    "audio/NotificacaoPedidoEntregue.mp3"
  );
  let knownOrderIds = new Set();
  let knownDeliveredOrderIds = new Set();
  let isFirstLoad = true;

  loadComponents(
    "#modal-container",
    ["components/modal-new-order.html", "components/modal-read-message.html"],
    () => {
      MapLogic.initializeMapWithLocation("map");
      setupUIEventListeners();
      listenToFirebaseChanges();
    }
  );

  function setupUIEventListeners() {
    const newOrderModal = document.getElementById("new-order-modal");
    const readMessageModal = document.getElementById("read-message-modal");

    UI.setupEventListeners(
      () => {
        localStorage.removeItem("currentUser");
        window.location.href = "index.html";
      },
      () => {
        newOrderModal.classList.add('active');
      }, // onNewOrder
      () => {
        readMessageModal.classList.add('active');
      }, // onReadMessage
      handleReadMessageSubmit,
      handleCepBlur
    );
  }

  function listenToFirebaseChanges() {
    // 1. Ouvir Pedidos
    listenToPedidos((pedidos) => {
      processNotifications(pedidos);

      // Kanban
      const visibleStatuses = [
        "pendente",
        "em_preparo",
        "feito",
        "pronto_para_entrega",
      ];
      const confeiteiraPedidos = Object.fromEntries(
        Object.entries(pedidos).filter(([, p]) =>
          visibleStatuses.includes(p.status)
        )
      );
      UI.renderBoard(confeiteiraPedidos, updateOrderStatus, UI.printLabel);

      // Atualizar Mapa via MapLogic
      MapLogic.processActiveDelivery(pedidos).then(() => {
        updateOverlayInfo();
      });
    });

    // 2. Ouvir Localização
    listenToEntregadorLocation((location) => {
      MapLogic.updateEntregadorLocation(location);
      if (location) {
        UI.updateDeliveryPersonStatus("Entregador online");
      } else {
        UI.updateDeliveryPersonStatus("Aguardando localização...");
      }
      updateOverlayInfo();
    });
  }

  function updateOverlayInfo() {
    const activeDelivery = MapLogic.getActiveDelivery();
    const location = MapLogic.getEntregadorLocation();

    if (!activeDelivery || !location || !activeDelivery.entrega) {
      UI.clearConfeiteiraMapInfo();
      return;
    }

    const entregaData = activeDelivery.entrega;
    const currentSpeed = entregaData.velocidade || 0;
    UI.updateConfeiteiraMapInfo(activeDelivery, entregaData, currentSpeed);
  }

  // --- Helpers de Notificação e Formulário ---
  function processNotifications(pedidos) {
    if (isFirstLoad) {
      // Na primeira carga, apenas popula os sets sem tocar sons
      knownOrderIds = new Set(
        Object.keys(pedidos).filter((id) => pedidos[id].status === "pendente")
      );
      knownDeliveredOrderIds = new Set(
        Object.keys(pedidos).filter((id) => pedidos[id].status === "entregue")
      );
      isFirstLoad = false;
      return;
    }

    // Processa notificações para novos pedidos em status específicos
    const newPendingOrders = Object.keys(pedidos).filter(
      (id) => pedidos[id].status === "pendente" && !knownOrderIds.has(id)
    );
    if (newPendingOrders.length > 0) {
      newOrderSound.play().catch(console.warn);
      knownOrderIds = new Set(
        Object.keys(pedidos).filter((id) => pedidos[id].status === "pendente")
      );
    }

    const newDeliveredOrders = Object.keys(pedidos).filter(
      (id) =>
        pedidos[id].status === "entregue" && !knownDeliveredOrderIds.has(id)
    );
    if (newDeliveredOrders.length > 0) {
      deliveryCompleteSound.play().catch(console.warn);
      knownDeliveredOrderIds = new Set(
        Object.keys(pedidos).filter((id) => pedidos[id].status === "entregue")
      );
    }
  }

  function handleNewOrderSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const data = {
      nomeBolo: form.querySelector("#cakeName").value,
      nomeCliente: form.querySelector("#clientName").value,
      clientEmail: form.querySelector("#clientEmail").value,
      cep: form.querySelector("#cep").value,
      rua: form.querySelector("#rua").value,
      bairro: form.querySelector("#bairro").value,
      numero: form.querySelector("#numero").value,
      complemento: form.querySelector("#complemento").value,
      whatsapp: form.querySelector("#whatsapp").value,
    };
    data.endereco = `${data.rua}, ${data.numero}, ${data.bairro}, CEP: ${data.cep}`;
    createNewOrder(data);
    form.reset();
    document.getElementById("new-order-modal").classList.remove('active');
  }

  function handleReadMessageSubmit(e) {
    e.preventDefault();
    const messageText = document.getElementById("message-text").value;
    const parsedData = parseWhatsappMessage(messageText);
    if (!parsedData) return;

    const orderData = {
      clientName: parsedData.cliente.nome,
      cakeName: parsedData.itens.length > 0 ? parsedData.itens[0].nome : "",
      whatsapp: parsedData.cliente.telefone,
      rua: parsedData.cliente.enderecoRaw,
    };
    UI.fillOrderForm(orderData);
    document.getElementById("read-message-modal").classList.remove('active');
    document.getElementById("new-order-modal").classList.add('active');
  }

  async function handleCepBlur(e) {
    const cep = e.target.value.replace(/\D/g, "");
    const ruaField = document.getElementById("rua");
    const bairroField = document.getElementById("bairro");
    const numeroField = document.getElementById("numero");
    const complementoField = document.getElementById("complemento");

    // Clear previous address data
    ruaField.value = "";
    bairroField.value = "";
    if (numeroField) numeroField.value = "";
    if (complementoField) complementoField.value = "";

    if (cep.length !== 8) {
      console.log("CEP inválido: deve conter 8 dígitos.");
      return;
    }

    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await res.json();

      if (!data.erro) {
        ruaField.value = data.logradouro;
        bairroField.value = data.bairro;
        if (numeroField) numeroField.focus();
      } else {
        console.log("CEP não encontrado.");
      }
    } catch (err) {
      console.error("Erro ao buscar CEP:", err);
    }
  }
});
