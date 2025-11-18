import {
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
      listenToFirebaseChanges();
    }
  );

  function setupUIEventListeners() {
    UI.setupEventListeners(
      () => {
        localStorage.removeItem("currentUser");
        window.location.href = "index.html";
      },
      () => {}, // onNewOrder (handled by modal)
      printAllEmPreparoLabels,
      () => {}, // onReadMessage (handled by modal)
      clearDeliveredOrders,
      () => {
        if (confirm("Tem certeza que deseja resetar TODAS as entregas ativas?"))
          resetAllActiveDeliveries();
      }, // Conecta a função ao UI
      handleNewOrderSubmit,
      handleReadMessageSubmit,
      handleCepInput
    );
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
    document.getElementById("new-order-modal").style.display = "none";
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
    document.getElementById("read-message-modal").style.display = "none";
    document.getElementById("new-order-modal").style.display = "block";
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

  async function printAllEmPreparoLabels() {
    listenToPedidos((pedidos) => {
      let printedCount = 0;
      for (const id in pedidos) {
        if (pedidos[id].status === "em_preparo") {
          UI.printLabel(pedidos[id], id);
          printedCount++;
        }
      }
      if (printedCount === 0) alert("Não há pedidos em preparo.");
    });
  }
});