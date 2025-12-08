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
  onHistory,
  onNewOrderSubmit,
  onCepBlur
) {
  // Reutiliza a função de setup global (ui.js), passando apenas os callbacks relevantes
  // O printAll e as ações de limpeza de admin são passados como null, pois a Confeiteira não os tem.
  genericSetupEventListeners(
    onLogout,
    onNewOrder,
    onReadMessage,
    null, // onPrintAll
    null, // onClearDelivered
    null, // onResetActiveDeliveries
    null, // onClearAllOrders
    onHistory,
    onNewOrderSubmit,
    null,
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
  // A confeiteira vê as colunas de status dos pedidos, exceto "Entregue", que fica visível apenas no histórico.
  genericRenderBoard(pedidos, onStatusUpdate, onPrintLabel, onPrintPdf);
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
