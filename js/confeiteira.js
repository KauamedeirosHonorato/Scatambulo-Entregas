/**
 * js/confeiteira.js - Lógica Principal do Painel Confeiteira
 */
import {
  db,
  ref,
  listenToPedidos,
  updateOrderStatus,
  listenToEntregadorLocation,
} from "./firebase.js";
import * as UI from "./ui-confeiteira.js";
import * as CommonUI from "./ui.js"; // Para showToast, showModal, etc.
import { parseWhatsappMessage } from "./utils.js";
import {
  handleNewOrderSubmit,
  handleReadMessageSubmit,
  handleCepInput,
} from "./ui.js";
import { loadComponents } from "./componentLoader.js";
import { showPrintPreviewModal } from "./modal-print-preview.js";

document.addEventListener("DOMContentLoaded", () => {
  // ======= 1. Validação de Usuário =======
  const currentUser = JSON.parse(localStorage.getItem("currentUser"));
  if (!currentUser || currentUser.panel !== "confeiteira.html") {
    window.location.href = "index.html";
    return;
  }

  // ======= 2. Estado Global =======
  const newOrderSound = new Audio("audio/NotificacaoPedidoNovo.mp3");
  const deliveryCompleteSound = new Audio(
    "audio/NotificacaoPedidoEntregue.mp3"
  );
  let knownOrderIds = new Set();
  let knownDeliveredOrderIds = new Set();
  let isFirstLoad = true;
  let userInteracted = false;

  // ======= 3. Inicialização =======
  initializeApp();

  function tryPlaySound(audio) {
    if (!audio) return;
    if (userInteracted) {
      audio.play().catch(() => {});
      return;
    }

    // If the user hasn't interacted yet, schedule play on first interaction
    const handler = () => {
      try {
        audio.play().catch(() => {});
      } catch (e) {
        /* ignore */
      }
      userInteracted = true;
      window.removeEventListener("click", handler);
      window.removeEventListener("touchstart", handler);
      window.removeEventListener("keydown", handler);
    };

    window.addEventListener("click", handler, { once: true });
    window.addEventListener("touchstart", handler, { once: true });
    window.addEventListener("keydown", handler, { once: true });
  }

  async function initializeApp() {
    // 3.1. Carregar Modais e Componentes
    await loadComponents("#modal-container", [
      "components/modal-print-all-em-preparo.html",
      "components/modal-print-preview.html",
    ]);

    // 3.2. Configurar Listeners de UI
    setupUIEventListeners();

    // 3.3. Iniciar Listeners do Firebase
    listenToFirebaseChanges();
  }

  // ======= 4. Event Listeners UI =======
  function setupUIEventListeners() {
    UI.setupEventListeners(
      () => {
        localStorage.removeItem("currentUser");
        window.location.href = "index.html";
      },
      // onNewOrder: Callback para o clique do botão "Novo Pedido"
      () => {
        handleNewOrder(); // Prepara o modal (limpa formulário)
        document.getElementById("novo-pedido-modal").classList.add("active"); // Abre o modal
      },
      null, // onPrintAll (não aplicável para confeiteira)
      // onReadMessage: Callback para o clique do botão "Ler Mensagem"
      () => {
        handleReadMessage(); // Prepara o modal (limpa formulário)
        document.getElementById("read-message-modal").classList.add("active"); // Abre o modal
      },
      handleNewOrderSubmit, // Handler genérico do ui.js
      handleReadMessageSubmit, // Handler genérico do ui.js
      handleCepInput
    );
  }

  // ======= 5. Event Listeners Firebase =======
  function listenToFirebaseChanges() {
    listenToPedidos(handlePedidosUpdate, handleError);
    listenToEntregadorLocation(UI.updateDeliveryPersonStatus, handleError);
  }

  function handlePedidosUpdate(pedidos) {
    // 5.1. Notificações
    processNotifications(pedidos);

    // 5.2. Renderizar Kanban
    UI.renderBoard(pedidos, updatePedidoStatus, UI.printLabel, handlePrintPdf);
  }

  function handleError(error) {
    console.error("Firebase Error:", error);
    CommonUI.showPersistentError(
      "Erro de Conexão com o Firebase. Recarregue a página.",
      "Recarregar",
      () => window.location.reload()
    );
  }

  // ======= 6. Ações de Pedido (Confeiteira) =======

  async function updatePedidoStatus(pedidoId, newStatus) {
    // A confeiteira não precisa de confirmação para seus status
    try {
      await updateOrderStatus(pedidoId, newStatus);
      CommonUI.showToast(
        `Pedido #${pedidoId
          .substring(0, 5)
          .toUpperCase()} atualizado para ${newStatus.replace("_", " ")}!`,
        "success"
      );
    } catch (e) {
      console.error("Erro ao atualizar status:", e);
      CommonUI.showToast("Erro ao atualizar status do pedido.", "error");
    }
  }

  function handlePrintPdf(pedido, pedidoId) {
    const orderData = {
      id: pedidoId,
      customerName: pedido.nomeCliente,
      address: pedido.endereco,
      item: pedido.nomeBolo,
      status: pedido.status,
    };
    showPrintPreviewModal(orderData);
  }

  function processNotifications(pedidos) {
    if (isFirstLoad) {
      knownOrderIds = new Set(
        Object.keys(pedidos).filter((id) => pedidos[id].status === "pendente")
      );
      knownDeliveredOrderIds = new Set(
        Object.keys(pedidos).filter((id) => pedidos[id].status === "entregue")
      );
      isFirstLoad = false;
      return;
    }

    // Notificação de novos pedidos (pendentes)
    const newPendingOrders = Object.keys(pedidos).filter(
      (id) => pedidos[id].status === "pendente" && !knownOrderIds.has(id)
    );
    if (newPendingOrders.length > 0) {
      tryPlaySound(newOrderSound);
      newPendingOrders.forEach((id) => {
        knownOrderIds.add(id);
        CommonUI.showToast(
          `Novo Pedido Pendente! #${id.substring(0, 5).toUpperCase()}`,
          "info"
        );
      });
    }

    // Notificação de pedidos entregues (para limpar o board visualmente)
    const newDeliveredOrders = Object.keys(pedidos).filter(
      (id) =>
        pedidos[id].status === "entregue" && !knownDeliveredOrderIds.has(id)
    );
    if (newDeliveredOrders.length > 0) {
      tryPlaySound(deliveryCompleteSound);
      newDeliveredOrders.forEach((id) => {
        knownDeliveredOrderIds.add(id);
        CommonUI.showToast(
          `Entrega Concluída! Pedido #${id.substring(0, 5).toUpperCase()}`,
          "success"
        );
      });
    }
  }

  // ======= 7. Ações de Formulário =======

  function handleNewOrder() {
    // Ação ao abrir o modal (limpar o formulário)
    document.getElementById("novo-pedido-form").reset();
    document.getElementById("pedido-error").textContent = "";
  }

  function handleReadMessage() {
    document.getElementById("read-message-form").reset();
    document.getElementById("read-message-error").textContent = "";
  }
});
