/**
 * js/ui-confeiteira.js - Funções de UI Específicas da Confeiteira
 */
import {
  printLabel as genericPrintLabel,
  setupEventListeners as genericSetupEventListeners,
  renderBoard as genericRenderBoard,
  fillOrderForm as genericFillOrderForm,
  fillAddressForm as genericFillAddressForm,
  showToast,
} from "./ui.js";

// =========================================================================
// 1. EVENT LISTENERS
// =========================================================================

export function setupEventListeners(
  onLogout,
  onNewOrder,
  onReadMessage,
  onNewOrderSubmit,
  onReadMessageSubmit,
  onCepBlur
) {
  // Reutiliza a função de setup global (ui.js), passando apenas os callbacks relevantes
  // O printAll e as ações de limpeza de admin são passados como null, pois a Confeiteira não os tem.
  genericSetupEventListeners(
    onLogout,
    onNewOrder,
    null, // onPrintAll
    onReadMessage,
    null, // onClearDelivered
    null, // onResetActiveDeliveries
    null, // onClearAllOrders
    onNewOrderSubmit,
    onReadMessageSubmit,
    (e) => onCepBlur(e)
  );
}

// =========================================================================
// 2. RENDERIZAÇÃO
// =========================================================================

/**
 * Renderiza o Kanban Board. Reutiliza a função genérica e passa `isAdmin = false`.
 */
export function renderBoard(pedidos, onStatusUpdate, onPrintLabel, onPrintPdf) {
  // A confeiteira só vê 3 colunas (Pendente, Em Preparo, Pronto para Envio) e Entregue (apenas para referência)
  genericRenderBoard(pedidos, onStatusUpdate, onPrintLabel, onPrintPdf);
}

/**
 * Atualiza o indicador visual do status do entregador.
 * @param {object | null} status - O objeto de status do Firebase ou null.
 */
export function updateDeliveryPersonStatus(status) {
  const statusContainer = document.getElementById("delivery-status-container");
  const statusTextEl = document.getElementById("delivery-person-status");

  if (!statusContainer || !statusTextEl) return;

  if (status && status.timestamp) {
    const lastUpdate = new Date(status.timestamp);
    const now = new Date();
    const minutesAgo = Math.floor((now - lastUpdate) / 60000);

    let statusText = "";
    let statusClass = "";

    if (minutesAgo < 5) {
      statusText = `Online - Última atualização há ${minutesAgo} min`;
      statusClass = "status-online";
    } else if (minutesAgo < 60) {
      statusText = `Inativo - Atualizado há ${minutesAgo} min`;
      statusClass = "status-inactive";
    } else {
      statusText = "Offline (Mais de 1h)";
      statusClass = "status-offline";
    }

    // Aplica o ícone e cor via estilo CSS e classes (simulando iOS)
    if (statusClass === "status-online") {
      statusTextEl.innerHTML = `<i class="ph-fill ph-moped" style="color: var(--ios-green);"></i> ${statusText}`;
    } else if (statusClass === "status-inactive") {
      statusTextEl.innerHTML = `<i class="ph-fill ph-clock" style="color: var(--ios-orange);"></i> ${statusText}`;
    } else {
      statusTextEl.innerHTML = `<i class="ph ph-person-simple-bike" style="color: var(--ios-text-sec);"></i> ${statusText}`;
    }

    statusContainer.classList.remove(
      "status-online",
      "status-inactive",
      "status-offline"
    );
    statusContainer.classList.add(statusClass);
  } else {
    // Entregador desconectado ou sem dados
    statusTextEl.innerHTML = `<i class="ph ph-person-simple-bike" style="color: var(--ios-text-sec);"></i> Desconectado`;
    statusContainer.classList.remove("status-online", "status-inactive");
    statusContainer.classList.add("status-offline");
  }
}

// =========================================================================
// 3. FUNÇÕES AUXILIARES
// =========================================================================

export function fillOrderForm(data) {
  genericFillOrderForm(data);
}
export function fillAddressForm(data) {
  genericFillAddressForm(data);
}
export function printLabel(pedido, pedidoId) {
  genericPrintLabel(pedido, pedidoId);
}
