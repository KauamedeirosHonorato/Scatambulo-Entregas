import {
  db,
  ref,
  get,
  listenToPedidos,
  listenToEntregadorLocation, // Não esqueça de importar isso
  createNewOrder,
  updateOrderStatus,
  clearDeliveredOrders,
  resetAllActiveDeliveries, // Importa a nova função
} from "./firebase.js";
import { parseWhatsappMessage } from "./utils.js"; // Certifique-se de que este arquivo existe
import { loadComponents } from "./componentLoader.js";
import * as MapLogic from "./map-logic.js";
import * as UI from "./ui.js";

window.addEventListener("load", () => {
  const currentUser = JSON.parse(localStorage.getItem("currentUser"));
  if (!currentUser || currentUser.panel !== "admin.html") {
    window.location.href = "index.html";
    return;
  }

  MapLogic.initializeMapWithLocation("map");

  const deliveryCompletedSound = new Audio(
    "audio/NotificacaoPedidoEntregue.mp3"
  );
  let knownOrderStatuses = {};
  let isFirstLoad = true;

  loadComponents(
    "#modal-container",
    ["components/modal-new-order.html", "components/modal-read-message.html"],
    () => {
      // Garante que os modais foram carregados antes de configurar os eventos
      setupUIEventListeners();
      // Aplica o estilo correto ao botão do modal de novo pedido
      const newOrderSubmitButton = document.querySelector(
        '#new-order-form button[type="submit"]'
      );
      if (newOrderSubmitButton)
        newOrderSubmitButton.classList.add("btn-primary");
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
      printAllEmPreparoLabels,
      () => {
        readMessageModal.classList.add('active');
      }, // onReadMessage
      clearDeliveredOrders,
      () => {
        if (confirm("Tem certeza que deseja resetar TODAS as entregas ativas?"))
          resetAllActiveDeliveries();
      }, // Conecta a função ao UI
      null, // onClearAllOrders (não usado no admin, mas necessário para alinhar os argumentos)
      handleNewOrderSubmit,
      handleReadMessageSubmit,
      handleCepInput
    );

    // Adiciona event listeners para os botões de fechar dos modais
    newOrderModal.querySelector('.close-button').addEventListener('click', () => {
      newOrderModal.classList.remove('active');
    });
    readMessageModal.querySelector('.close-button').addEventListener('click', () => {
      readMessageModal.classList.remove('active');
    });
  }

  function listenToFirebaseChanges() {
    // 1. Ouvir Pedidos
    listenToPedidos((pedidos) => {
      // Sons de notificação
      if (!isFirstLoad) {
        for (const pedidoId in pedidos) {
          const oldStatus = knownOrderStatuses[pedidoId];
          const newStatus = pedidos[pedidoId].status;
          if (
            oldStatus &&
            oldStatus !== newStatus &&
            newStatus === "entregue"
          ) {
            deliveryCompletedSound.play().catch(console.warn);
          }
        }
      }
      knownOrderStatuses = Object.fromEntries(
        Object.entries(pedidos).map(([id, pedido]) => [id, pedido.status])
      );
      isFirstLoad = false;

      // Atualizar Kanban
      UI.renderBoard(pedidos, updateOrderStatus, UI.printLabel);

      // Atualizar Lógica do Mapa (Rota, Marcadores)
      MapLogic.processActiveDelivery(pedidos).then(() => {
        updateOverlayInfo(); // Atualiza os textos do overlay após processar o mapa
      });
    });

    // 2. Ouvir Localização do Entregador
    listenToEntregadorLocation((location) => {
      MapLogic.updateEntregadorLocation(location);
      updateOverlayInfo();
    });
  }

  function updateOverlayInfo() {
    const activeDeliveryOrder = MapLogic.getActiveDelivery();
    const entregadorLocation = MapLogic.getEntregadorLocation();

    // Se não tiver entrega ativa OU não tiver localização, limpa overlay
    if (!activeDeliveryOrder || !entregadorLocation) {
      UI.updateAdminMapInfo(null);
      return;
    }

    // Pega os dados de entrega (velocidade, eta) salvos no pedido
    const entregaData = activeDeliveryOrder.entrega;

    if (entregaData) {
      const currentSpeed = entregaData.velocidade || 0;
      UI.updateAdminMapInfo(activeDeliveryOrder, entregaData, currentSpeed);
    }
  }

  // --- Handlers de Formulário (Mantidos iguais) ---
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
      cakeName: parsedData.items.length > 0 ? parsedData.items[0].nome : "",
      whatsapp: parsedData.cliente.telefone,
      rua: parsedData.cliente.enderecoRaw,
    };

    UI.fillOrderForm(orderData);
    document.getElementById("read-message-modal").classList.remove('active');
    document.getElementById("new-order-modal").classList.add('active');
  }

  async function handleCepInput(e) {
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

    if (cep.length < 8) {
      console.log("CEP incompleto.");
      return;
    }

    if (cep.length === 8) {
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
  }

  async function printAllEmPreparoLabels() {
    try {
      const snapshot = await get(ref(db, "pedidos"));
      const pedidos = snapshot.val() || {};
      const pedidosEmPreparo = Object.entries(pedidos).filter(
        ([, pedido]) => pedido.status === "em_preparo"
      );

      if (pedidosEmPreparo.length === 0) {
        alert("Não há pedidos em preparo para imprimir.");
        return;
      }

      pedidosEmPreparo.forEach(([id, pedido]) => UI.printLabel(pedido, id));
    } catch (error) {
      console.error("Erro ao buscar pedidos para impressão:", error);
      alert("Não foi possível buscar os pedidos para impressão.");
    }
  }
});
