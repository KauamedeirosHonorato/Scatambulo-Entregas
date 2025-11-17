import {
  printLabel as genericPrintLabel,
  createOrderCard as genericCreateOrderCard,
} from "./ui.js";

export function setupEventListeners(
  onLogout,
  onNewOrderSubmit,
  onReadMessageSubmit,
  onCepBlur
) {
  const logoutButton = document.getElementById("logout-button");
  const newOrderModal = document.getElementById("new-order-modal");
  const readMessageModal = document.getElementById("read-message-modal");
  const newOrderBtn = document.getElementById("new-order-button");
  const readMessageBtn = document.getElementById("read-message-button");
  const closeButtons = document.querySelectorAll(".close-button");
  const readMessageForm = document.getElementById("read-message-form");
  const newOrderForm = document.getElementById("new-order-form");
  const cepField = document.getElementById("cep");

  logoutButton.addEventListener("click", onLogout);
  newOrderBtn.addEventListener(
    "click",
    () => (newOrderModal.style.display = "block")
  );
  readMessageBtn.addEventListener(
    "click",
    () => (readMessageModal.style.display = "block")
  );

  closeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      newOrderModal.style.display = "none";
      readMessageModal.style.display = "none";
    });
  });

  window.addEventListener("click", (event) => {
    if (event.target === newOrderModal) newOrderModal.style.display = "none";
    if (event.target === readMessageModal)
      readMessageModal.style.display = "none";
  });

  cepField.addEventListener("blur", onCepBlur);
  newOrderForm.addEventListener("submit", onNewOrderSubmit);
  readMessageForm.addEventListener("submit", onReadMessageSubmit);
}

export function renderBoard(pedidos, onStatusUpdate, onPrintLabel) {
  const kanbanBoard = document.getElementById("kanban-board");
  kanbanBoard.innerHTML = "";
  const statuses = [
    { id: "pendente", title: "Pendente" },
    { id: "em_preparo", title: "Em Preparo" },
    { id: "feito", title: "Feito" },
  ];

  statuses.forEach((statusInfo) => {
    const column = document.createElement("div");
    column.className = "kanban-column";
    column.dataset.status = statusInfo.id;
    column.innerHTML = `<h3>${statusInfo.title}</h3>`;
    kanbanBoard.appendChild(column);
  });

  Object.entries(pedidos).forEach(([pedidoId, pedido]) => {
    if (statuses.some((s) => s.id === pedido.status)) {
      const column = kanbanBoard.querySelector(
        `.kanban-column[data-status="${pedido.status}"]`
      );
      if (column) {
        const card = genericCreateOrderCard(
          pedidoId,
          pedido,
          onStatusUpdate,
          onPrintLabel
        );
        column.appendChild(card);
      }
    }
  });
}

export function updateConfeiteiraMapInfo(
  activeDeliveryOrder,
  entregaData,
  currentSpeed
) {
  const confeiteiraEtaDisplay = document.getElementById(
    "confeiteira-eta-display"
  );
  const confeiteiraSpeedDisplay = document.getElementById(
    "confeiteira-speed-display"
  );
  const confeiteiraDistanceDisplay = document.getElementById(
    "confeiteira-distance-display"
  ); // New element for distance
  const confeiteiraActiveOrderDisplay = document.getElementById(
    "confeiteira-active-order-display"
  );

  if (entregaData) {
    confeiteiraEtaDisplay.innerHTML = `${
      entregaData.tempoEstimado ? Math.round(entregaData.tempoEstimado / 60) : "..."
    }<span class="unit">min</span>`; // Convert seconds to minutes
    confeiteiraEtaDisplay.style.display = "flex";
    confeiteiraSpeedDisplay.innerHTML = `${Math.round(
      currentSpeed || 0
    )}<span class="unit">km/h</span>`;
    confeiteiraSpeedDisplay.style.display = "flex";
    confeiteiraDistanceDisplay.innerHTML = `${
      entregaData.distancia ? (entregaData.distancia / 1000).toFixed(1) : "..."
    }<span class="unit">km</span>`; // Convert meters to kilometers
    confeiteiraDistanceDisplay.style.display = "flex";
    confeiteiraActiveOrderDisplay.textContent = `Entregando para: ${activeDeliveryOrder.nomeCliente}`;
    confeiteiraActiveOrderDisplay.style.display = "block";
  } else {
    clearConfeiteiraMapInfo();
  }
}

export function clearConfeiteiraMapInfo() {
  const confeiteiraEtaDisplay = document.getElementById(
    "confeiteira-eta-display"
  );
  const confeiteiraSpeedDisplay = document.getElementById(
    "confeiteira-speed-display"
  );
  const confeiteiraDistanceDisplay = document.getElementById(
    "confeiteira-distance-display"
  ); // Clear distance display
  const confeiteiraActiveOrderDisplay = document.getElementById(
    "confeiteira-active-order-display"
  );

  confeiteiraEtaDisplay.style.display = "none";
  confeiteiraSpeedDisplay.style.display = "none";
  confeiteiraDistanceDisplay.style.display = "none"; // Clear distance display
  confeiteiraActiveOrderDisplay.style.display = "none";
}

export function updateDeliveryPersonStatus(status) {
  const deliveryPersonStatus = document.getElementById(
    "delivery-person-status"
  );
  deliveryPersonStatus.textContent = status;
}

export function fillOrderForm(data) {
  const fields = {
    cakeName: document.getElementById("cakeName"),
    clientName: document.getElementById("clientName"),
    cep: document.getElementById("cep"),
    rua: document.getElementById("rua"),
    bairro: document.getElementById("bairro"),
    numero: document.getElementById("numero"),
    complemento: document.getElementById("complemento"),
    whatsapp: document.getElementById("whatsapp"),
  };
  for (const key in fields) {
    if (Object.prototype.hasOwnProperty.call(fields, key) && data[key]) {
      fields[key].value = data[key];
    }
  }
}

export function printLabel(pedido, pedidoId) {
  genericPrintLabel(pedido, pedidoId);
}

export function updateButtonsForNavigation(isNavigating) {
  console.log(`Navigation buttons updated. Is navigating: ${isNavigating}`);
  // Implement actual UI button updates here based on isNavigating status
  // e.g., disable "Start Delivery" button, enable "Stop Navigation" button
}
