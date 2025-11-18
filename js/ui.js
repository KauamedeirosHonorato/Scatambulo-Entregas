export function setupEventListeners(
  onLogout,
  onNewOrder,
  onPrintAll,
  onReadMessage,
  onClearDelivered,
  onResetActiveDeliveries,
  onClearAllOrders, // Novo callback para limpar todos os pedidos
  onNewOrderSubmit,
  onReadMessageSubmit,
  onCepInput
) {
  const logoutButton = document.getElementById("logout-button");
  const newOrderModal = document.getElementById("new-order-modal");
  const readMessageModal = document.getElementById("read-message-modal");
  const newOrderBtn = document.getElementById("new-order-button");
  const printAllEmPreparoBtn = document.getElementById(
    "print-all-em-preparo-button"
  );
  const readMessageBtn = document.getElementById("read-message-button");
  const closeButtons = document.querySelectorAll(".close-button");
  const readMessageForm = document.getElementById("read-message-form");
  const newOrderForm = document.getElementById("new-order-form");
  const cepField = document.getElementById("cep");
  const clearDeliveredBtn = document.getElementById("clear-delivered-button");
  const resetDeliveriesBtn = document.getElementById(
    "reset-active-deliveries-button"
  ); // Novo botão
  const clearAllOrdersBtn = document.getElementById("clear-all-orders-button"); // Novo botão para limpar todos os pedidos

  logoutButton.addEventListener("click", onLogout);
  newOrderBtn.addEventListener(
    "click",
    () => (newOrderModal.style.display = "block")
  );
  printAllEmPreparoBtn.addEventListener("click", onPrintAll);
  readMessageBtn.addEventListener(
    "click",
    () => (readMessageModal.style.display = "block")
  );
  if (clearDeliveredBtn)
    clearDeliveredBtn.addEventListener("click", onClearDelivered);
  if (resetDeliveriesBtn)
    resetDeliveriesBtn.addEventListener("click", onResetActiveDeliveries); // Adiciona o listener
  if (clearAllOrdersBtn)
    clearAllOrdersBtn.addEventListener("click", onClearAllOrders); // Adiciona o listener para limpar todos os pedidos

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

  if (cepField && onCepInput) cepField.addEventListener("input", onCepInput);
  if (newOrderForm && onNewOrderSubmit)
    newOrderForm.addEventListener("submit", onNewOrderSubmit);
  if (readMessageForm && onReadMessageSubmit)
    readMessageForm.addEventListener("submit", onReadMessageSubmit);
}

export function renderBoard(pedidos, onStatusUpdate, onPrintLabel) {
  const kanbanBoard = document.getElementById("kanban-board");
  kanbanBoard.innerHTML = "";
  const statuses = [
    { id: "pendente", title: "Pendente" },
    { id: "em_preparo", title: "Em Preparo" },
    { id: "feito", title: "Feito" },
    { id: "pronto_para_entrega", title: "Pronto para Entrega" },
    { id: "em_entrega", title: "Em Entrega" },
    { id: "entregue", title: "Entregue" },
  ];

  statuses.forEach((statusInfo) => {
    const column = document.createElement("div");
    column.className = "kanban-column";
    column.dataset.status = statusInfo.id;
    column.innerHTML = `<h3>${statusInfo.title}</h3>`;
    kanbanBoard.appendChild(column);
  });

  Object.entries(pedidos).forEach(([pedidoId, pedido]) => {
    const column = kanbanBoard.querySelector(
      `.kanban-column[data-status="${pedido.status}"]`
    );
    if (column) {
      const card = createOrderCard(
        pedidoId,
        pedido,
        onStatusUpdate,
        onPrintLabel
      );
      column.appendChild(card);
    }
  });
}

const statusActions = new Map([
  [
    "pendente",
    [
      {
        text: "Iniciar Preparo",
        className: "btn-secondary",
        newStatus: "em_preparo",
      },
    ],
  ],
  [
    "em_preparo",
    [
      {
        text: "Marcar como Feito",
        className: "btn-secondary",
        newStatus: "feito",
      },
      {
        text: "Imprimir Etiqueta",
        className: "btn-secondary",
        action: "print",
      },
    ],
  ],
  [
    "feito",
    [
      {
        text: "Pronto para Entrega",
        className: "btn-primary",
        newStatus: "pronto_para_entrega",
      },
    ],
  ],
  [
    "pronto_para_entrega",
    [
      {
        text: "Marcar como Entregue",
        className: "btn-sucesso",
        newStatus: "entregue",
      },
    ],
  ],
]);

/**
 * Cria um cartão de pedido para o quadro Kanban.
 */
export function createOrderCard(
  pedidoId,
  pedido,
  onStatusUpdate,
  onPrintLabel
) {
  const card = document.createElement("div");
  card.className = "order-card";
  card.id = `pedido-${pedidoId}`;

  let deliveryInfoHtml = "";
  if (pedido.status === "em_entrega" && pedido.entrega) {
    const { velocidade, distancia, tempoEstimado } = pedido.entrega;
    const speedText =
      typeof velocidade === "number" ? `${velocidade} km/h` : "...";
    const distanceText =
      typeof distancia === "number" || !isNaN(distancia)
        ? `${distancia} km`
        : "...";
    const timeText =
      typeof tempoEstimado === "number" || !isNaN(tempoEstimado)
        ? `${tempoEstimado} min`
        : "...";

    deliveryInfoHtml = `
          <div class="delivery-realtime-info">
            <p>🚗 <strong>Velocidade:</strong> ${speedText}</p>
            <p>📏 <strong>Distância:</strong> ${distanceText}</p>
            <p>⏱️ <strong>Tempo Estimado:</strong> ${timeText}</p>
          </div>
        `;
  }

  card.innerHTML = `<div class="order-card-header">
                      <h4>${pedido.nomeBolo || "Bolo"}</h4>
                      <span class="order-id">#${pedidoId.toUpperCase()}</span>
                    </div>
                    <p>${pedido.nomeCliente}</p>
                    <p>${pedido.endereco}</p>
                    <div class="distance"></div>
                    ${deliveryInfoHtml}`;
  const actions = document.createElement("div");
  actions.className = "order-actions";

  const availableActions = statusActions.get(pedido.status);
  if (availableActions) {
    availableActions.forEach((actionInfo) => {
      const button = document.createElement("button");
      button.textContent = actionInfo.text;
      button.className = actionInfo.className;
      button.onclick = () => {
        if (actionInfo.newStatus)
          onStatusUpdate(pedidoId, actionInfo.newStatus);
        if (actionInfo.action === "print") onPrintLabel(pedido, pedidoId);
      };
      actions.appendChild(button);
    });
  }

  card.appendChild(actions);
  return card;
}

export function updateAdminMapInfo(order, deliveryData, speed) {
  const infoEl = document.getElementById("delivery-info-admin");
  if (!infoEl) return;

  if (!order || !deliveryData) {
    infoEl.style.display = "none";
    infoEl.innerHTML = "";
    return;
  }

  const speedText = typeof speed === "number" ? `${speed} km/h` : "...";
  const distanceText =
    typeof deliveryData.distancia === "number" || !isNaN(deliveryData.distancia)
      ? `${deliveryData.distancia} km`
      : "...";
  const timeText =
    typeof deliveryData.tempoEstimado === "number" ||
    !isNaN(deliveryData.tempoEstimado)
      ? `${deliveryData.tempoEstimado} min`
      : "...";

  infoEl.innerHTML = `
    <h4>Entrega em Andamento</h4>
    <p><strong>Pedido:</strong> ${order.nomeBolo}</p>
    <p><strong>Cliente:</strong> ${order.nomeCliente}</p>
    <div class="delivery-realtime-info">
      <p>🚗 <strong>Velocidade:</strong> ${speedText}</p>
      <p>📏 <strong>Distância Restante:</strong> ${distanceText}</p>
      <p>⏱️ <strong>Tempo Estimado:</strong> ${timeText}</p>
    </div>
  `;
  infoEl.style.display = "block";
}






export function highlightClosestOrder(closestOrder) {
  const readyOrdersColumn = document.querySelector(
    '.kanban-column[data-status="pronto_para_entrega"]'
  );
  if (!readyOrdersColumn) return;

  const columnTitle = readyOrdersColumn.querySelector("h3");
  const orderCards = readyOrdersColumn.querySelectorAll(".order-card");

  orderCards.forEach((card) => card.classList.remove("closest-delivery"));

  if (closestOrder) {
    const closestCard = document.getElementById(`pedido-${closestOrder.id}`);
    if (closestCard) {
      closestCard.classList.add("closest-delivery");
      columnTitle.textContent = `Próximo: ${
        closestOrder.clientName
      } (${closestOrder.distance.toFixed(1)} km)`;
    }
  } else {
    columnTitle.textContent = "Pronto para Entrega";
  }
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
  const shortId = pedidoId ? pedidoId.substring(0, 5).toUpperCase() : "N/A";
  const printContent = `
    <div style="font-family: 'Poppins', sans-serif; padding: 20px; border: 1px solid #ccc; width: 300px; box-sizing: border-box;">
      <h3 style="text-align: center; margin-bottom: 15px;">Pedido Scatambulo #${shortId}</h3>
      <p><strong>Bolo:</strong> ${pedido.nomeBolo || "Não informado"}</p>
      <p><strong>Cliente:</strong> ${pedido.nomeCliente || "Não informado"}</p>
      <p><strong>Endereço:</strong> ${pedido.endereco || "Não informado"}</p>
      <p><strong>WhatsApp:</strong> ${pedido.whatsapp || "Não informado"}</p>
      <p style="margin-top: 20px; text-align: center; font-size: 0.8em;">Obrigado pela preferência!</p>
    </div>
  `;

  const printWindow = window.open("", "_blank");
  printWindow.document.write("<html><head><title>Etiqueta do Pedido</title>");
  printWindow.document.write("<style>");
  printWindow.document.write(`
    @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;700&display=swap');
    body { font-family: 'Poppins', sans-serif; margin: 0; padding: 10px; }
  `);
  printWindow.document.write("</style></head><body>");
  printWindow.document.write(printContent);
  printWindow.document.write("</body></html>");
  printWindow.document.close();
  printWindow.print();
}
