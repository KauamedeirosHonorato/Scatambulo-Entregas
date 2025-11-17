import {
  listenToPedidos,
  createNewOrder,
  updateOrderStatus,
  clearDeliveredOrders,
  getPedido,
  updatePedido,
} from "./firebase.js";
import { parseWhatsappMessage } from "./utils.js";
import { loadComponents } from "./componentLoader.js";
// Removed: import * as MapLogic from "./map-logic.js";
import * as UI from "./ui.js";

document.addEventListener("DOMContentLoaded", () => {
  const currentUser = JSON.parse(localStorage.getItem("currentUser"));
  if (!currentUser || currentUser.panel !== "admin.html") {
    window.location.href = "index.html";
    return;
  }

  const deliveryCompletedSound = new Audio(
    "audio/NotificacaoPedidoEntregue.mp3"
  );
  let knownOrderStatuses = {};
  let isFirstLoad = true;

  loadComponents(
    "#modal-container",
    ["components/modal-new-order.html", "components/modal-read-message.html"],
    () => {
      // Removed: MapLogic.initializeMapWithLocation("map");
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
      handleNewOrderSubmit,
      handleReadMessageSubmit,
      handleCepBlur
    );
  }

  function listenToFirebaseChanges() {
    listenToPedidos((pedidos) => {
      if (!isFirstLoad) {
        for (const pedidoId in pedidos) {
          const oldStatus = knownOrderStatuses[pedidoId];
          const newStatus = pedidos[pedidoId].status;
          if (
            oldStatus &&
            (newStatus === "entregue" || newStatus === "em_preparo") &&
            oldStatus !== newStatus
          ) {
            deliveryCompletedSound.play().catch(console.warn);
          }
        }
      }
      knownOrderStatuses = Object.fromEntries(
        Object.entries(pedidos).map(([id, pedido]) => [id, pedido.status])
      );
      isFirstLoad = false;
      UI.renderBoard(pedidos, updateOrderStatus, UI.printLabel);
      // Removed: MapLogic.processActiveDelivery(pedidos).then(updateMapInfo);
    });

    // Removed: listenToEntregadorLocation((location) => {
    // Removed:   MapLogic.updateEntregadorLocation(location);
    // Removed:   updateMapInfo();
    // Removed: });
  }

  // Removed: async function updateMapInfo() {
  // Removed:   const activeDeliveryOrder = MapLogic.getActiveDelivery();
  // Removed:   const entregadorLocation = MapLogic.getEntregadorLocation();
  // Removed:
  // Removed:   if (!activeDeliveryOrder || !entregadorLocation) {
  // Removed:     UI.updateAdminMapInfo(null);
  // Removed:     return;
  // Removed:   }
  // Removed:
  // Removed:   // `entregaData` should now be available directly from `activeDeliveryOrder`
  // Removed:   // as `MapLogic.processActiveDelivery` populates it via the onRouteUpdate callback.
  // Removed:   const entregaData = activeDeliveryOrder.entrega;
  // Removed:
  // Removed:   if (entregaData) {
  // Removed:     const currentSpeed = calculateSpeed(
  // Removed:       entregadorLocation,
  // Removed:       entregaData.lastEntregadorCoords
  // Removed:     );
  // Removed:
  // Removed:     // Only update Firebase if speed is a valid number
  // Removed:     if (typeof currentSpeed === 'number' && !isNaN(currentSpeed)) {
  // Removed:       await updatePedido(activeDeliveryOrder.id, {
  // Removed:         "entrega/velocidade": parseFloat(currentSpeed),
  // Removed:       });
  // Removed:     }
  // Removed:
  // Removed:     UI.updateAdminMapInfo(activeDeliveryOrder, entregaData, currentSpeed);
  // Removed:   } else {
  // Removed:     // If no entregaData, clear admin map info
  // Removed:     UI.updateAdminMapInfo(null);
  // Removed:   }
  // Removed: }

  function handleNewOrderSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const nomeBolo = form.querySelector("#cakeName").value;
    const nomeCliente = form.querySelector("#clientName").value;
    const clientEmail = form.querySelector("#clientEmail").value; // Get client email
    const cep = form.querySelector("#cep").value;
    const rua = form.querySelector("#rua").value;
    const bairro = form.querySelector("#bairro").value;
    const numero = form.querySelector("#numero").value;
    const complemento = form.querySelector("#complemento").value;
    const whatsapp = form.querySelector("#whatsapp").value;
    const endereco = `${rua}, ${numero}, ${bairro}, CEP: ${cep}`;

    createNewOrder({
      nomeCliente,
      clientEmail, // Pass client email
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
    const parsedData = parseWhatsappMessage(messageText);

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
    if (cep.length === 8) {
      try {
        const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await response.json();
        if (!data.erro) {
          document.getElementById("rua").value = data.logradouro;
          document.getElementById("bairro").value = data.bairro;
        }
      } catch (error) {
        console.error("Erro ao buscar CEP:", error);
      }
    }
  }

  async function printAllEmPreparoLabels() {
    listenToPedidos((pedidos) => {
      let printedCount = 0;
      for (const pedidoId in pedidos) {
        if (pedidos[pedidoId].status === "em_preparo") {
          UI.printLabel(pedidos[pedidoId], pedidoId);
          printedCount++;
        }
      }
      if (printedCount === 0) {
        alert("Não há pedidos em preparo para imprimir etiquetas.");
      }
    });
  }
});