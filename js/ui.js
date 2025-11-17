export function setupEventListeners(
  onLogout,
  onNewOrder,
  onPrintAll,
  onReadMessage,
  onClearDelivered,
  onNewOrderSubmit,
  onReadMessageSubmit,
  onCepBlur
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

  logoutButton.addEventListener("click", onLogout);
  newOrderBtn.addEventListener("click", () => (newOrderModal.style.display = "block"));
  printAllEmPreparoBtn.addEventListener("click", onPrintAll);
  readMessageBtn.addEventListener("click", () => (readMessageModal.style.display = "block"));
  if(clearDeliveredBtn) clearDeliveredBtn.addEventListener("click", onClearDelivered);

  closeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      newOrderModal.style.display = "none";
      readMessageModal.style.display = "none";
    });
  });

  window.addEventListener("click", (event) => {
    if (event.target === newOrderModal) newOrderModal.style.display = "none";
    if (event.target === readMessageModal) readMessageModal.style.display = "none";
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
    { id: "pronto_para_entrega", title: "Pronto para Entrega" },
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
      const card = createOrderCard(pedidoId, pedido, onStatusUpdate, onPrintLabel);
      column.appendChild(card);
    }
  });
}

function createOrderCard(pedidoId, pedido, onStatusUpdate, onPrintLabel) {
    const card = document.createElement("div");
    card.className = "order-card";
    card.id = `pedido-${pedidoId}`;

    let deliveryInfoHtml = "";
    if (pedido.status === "em_entrega" && pedido.entrega) {
      const { velocidade, distancia, tempoEstimado } = pedido.entrega;
      const speedText = typeof velocidade === "number" ? `${velocidade} km/h` : "...";
      const distanceText = typeof distancia === "number" || !isNaN(distancia) ? `${distancia} km` : "...";
      const timeText = typeof tempoEstimado === "number" || !isNaN(tempoEstimado) ? `${tempoEstimado} min` : "...";

      deliveryInfoHtml = `
          <div class="delivery-realtime-info">
            <p>🚗 <strong>Velocidade:</strong> ${speedText}</p>
            <p>📏 <strong>Distância:</strong> ${distanceText}</p>
            <p>⏱️ <strong>Tempo Estimado:</strong> ${timeText}</p>
          </div>
        `;
    }

    card.innerHTML = `<h4>${pedido.nomeBolo || "Bolo"}</h4><p>${
      pedido.nomeCliente
    }</p><p>${
      pedido.endereco
    }</p><div class="distance"></div>${deliveryInfoHtml}`;
    const actions = document.createElement("div");
    actions.className = "order-actions";

    if (pedido.status === "pendente") {
      const btnPreparo = document.createElement("button");
      btnPreparo.textContent = "Iniciar Preparo";
      btnPreparo.className = "btn-secondary";
      btnPreparo.onclick = () => onStatusUpdate(pedidoId, "em_preparo");
      actions.appendChild(btnPreparo);
    } else if (pedido.status === "em_preparo") {
      const btnFeito = document.createElement("button");
      btnFeito.textContent = "Marcar como Feito";
      btnFeito.className = "btn-secondary";
      btnFeito.onclick = () => onStatusUpdate(pedidoId, "feito");
      actions.appendChild(btnFeito);

      const btnImprimir = document.createElement("button");
      btnImprimir.textContent = "Imprimir Etiqueta";
      btnImprimir.className = "btn-secondary";
      btnImprimir.onclick = () => onPrintLabel(pedido, pedidoId);
      actions.appendChild(btnImprimir);
    }

    if (pedido.status === "feito") {
      const btnPronto = document.createElement("button");
      btnPronto.textContent = "Pronto para Entrega";
      btnPronto.className = "btn-primary";
      btnPronto.onclick = () => onStatusUpdate(pedidoId, "pronto_para_entrega");
      actions.appendChild(btnPronto);
    }

    if (pedido.status === "pronto_para_entrega") {
      const btnEntregue = document.createElement("button");
      btnEntregue.textContent = "Marcar como Entregue";
      btnEntregue.className = "btn-sucesso";
      btnEntregue.onclick = () => onStatusUpdate(pedidoId, "entregue");
      actions.appendChild(btnEntregue);
    }

    card.appendChild(actions);
    return card;
}

export function updateAdminMapInfo(
  activeDeliveryOrder,
  routeDetails,
  currentSpeed
) {
  const adminEtaDisplay = document.getElementById("admin-eta-display");
  const adminSpeedDisplay = document.getElementById("admin-speed-display");
  const adminActiveOrderDisplay = document.getElementById(
    "admin-active-order-display"
  );

  if (routeDetails) {
    adminEtaDisplay.innerHTML = `${routeDetails.duration}<span class="unit">min</span>`;
    adminEtaDisplay.style.display = "flex";
    adminSpeedDisplay.innerHTML = `${currentSpeed}<span class="unit">km/h</span>`;
    adminSpeedDisplay.style.display = "flex";
    adminActiveOrderDisplay.textContent = `Entregando para: ${activeDeliveryOrder.nomeCliente}`;
    adminActiveOrderDisplay.style.display = "block";
  } else {
    adminEtaDisplay.style.display = "none";
    adminSpeedDisplay.style.display = "none";
    adminActiveOrderDisplay.style.display = "none";
  }
}

export function highlightClosestOrder(closestOrder) {
    const readyOrdersColumn = document.querySelector(
        '.kanban-column[data-status="pronto_para_entrega"]'
    );
    if(!readyOrdersColumn) return;

    const columnTitle = readyOrdersColumn.querySelector("h3");
    const orderCards = readyOrdersColumn.querySelectorAll(".order-card");

    orderCards.forEach(card => card.classList.remove("closest-delivery"));

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
    const printWindow = window.open("", "Etiqueta", "width=400,height=300");
    printWindow.document.write(`
      <html><head><title>Etiqueta</title>
      <style>body{font-family:Arial;padding:10px} .label{border:1px dashed #000;padding:10px}</style>
      </head><body>
        <div class="label">
          <h3>Pedido #${pedidoId ? pedidoId.substring(0, 5) : 'N/A'}</h3>
          <p><strong>Cliente:</strong> ${pedido.nomeCliente}</p>
          <p><strong>Telefone:</strong> ${pedido.whatsapp || 'N/A'}</p>
          <p><strong>Endereço:</strong> ${pedido.endereco}</p>
          <p><strong>Bolo:</strong> ${pedido.nomeBolo}</p>
        </div>
      </body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
}
