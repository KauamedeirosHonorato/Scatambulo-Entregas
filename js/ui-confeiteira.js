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
  newOrderBtn.addEventListener("click", () => (newOrderModal.style.display = "block"));
  readMessageBtn.addEventListener("click", () => (readMessageModal.style.display = "block"));

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
        const card = createOrderCard(pedidoId, pedido, onStatusUpdate, onPrintLabel);
        column.appendChild(card);
      }
    }
  });
}

function createOrderCard(pedidoId, pedido, onStatusUpdate, onPrintLabel) {
    const card = document.createElement("div");
    card.className = "order-card";
    card.innerHTML = `<h4>${pedido.nomeBolo}</h4><p>${pedido.nomeCliente}</p>`;

    const actions = document.createElement("div");
    actions.className = "order-actions";

    if (pedido.status === "pendente") {
      const btnPreparo = document.createElement("button");
      btnPreparo.textContent = "Iniciar Preparo";
      btnPreparo.onclick = () => onStatusUpdate(pedidoId, "em_preparo");
      actions.appendChild(btnPreparo);
    } else if (pedido.status === "em_preparo") {
      const btnFeito = document.createElement("button");
      btnFeito.textContent = "Marcar como Feito";
      btnFeito.onclick = () => onStatusUpdate(pedidoId, "feito");
      actions.appendChild(btnFeito);

      const btnImprimir = document.createElement("button");
      btnImprimir.textContent = "Imprimir Etiqueta";
      btnImprimir.className = "btn-secondary";
      btnImprimir.onclick = () => onPrintLabel(pedido);
      actions.appendChild(btnImprimir);
    }

    card.appendChild(actions);
    return card;
}

export function updateConfeiteiraMapInfo(activeDeliveryOrder) {
    const confeiteiraEtaDisplay = document.getElementById("confeiteira-eta-display");
    const confeiteiraSpeedDisplay = document.getElementById("confeiteira-speed-display");
    const confeiteiraActiveOrderDisplay = document.getElementById("confeiteira-active-order-display");
    const entregaData = activeDeliveryOrder.entrega;

    if(entregaData){
        confeiteiraEtaDisplay.innerHTML = `${entregaData.tempoEstimado || "..."}<span class="unit">min</span>`;
        confeiteiraEtaDisplay.style.display = "flex";
        confeiteiraSpeedDisplay.innerHTML = `${entregaData.velocidade || 0}<span class="unit">km/h</span>`;
        confeiteiraSpeedDisplay.style.display = "flex";
        confeiteiraActiveOrderDisplay.textContent = `Entregando para: ${activeDeliveryOrder.nomeCliente}`;
        confeiteiraActiveOrderDisplay.style.display = "block";
    } else {
        clearConfeiteiraMapInfo();
    }
}

export function clearConfeiteiraMapInfo() {
    const confeiteiraEtaDisplay = document.getElementById("confeiteira-eta-display");
    const confeiteiraSpeedDisplay = document.getElementById("confeiteira-speed-display");
    const confeiteiraActiveOrderDisplay = document.getElementById("confeiteira-active-order-display");

    confeiteiraEtaDisplay.style.display = "none";
    confeiteiraSpeedDisplay.style.display = "none";
    confeiteiraActiveOrderDisplay.style.display = "none";
}

export function updateDeliveryPersonStatus(status){
    const deliveryPersonStatus = document.getElementById("delivery-person-status");
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

export function printLabel(pedido) {
    const printContent = `
      <div style="font-family: 'Poppins', sans-serif; padding: 20px; border: 1px solid #ccc; width: 300px;">
        <h3 style="text-align: center; margin-bottom: 15px;">Pedido Scatambulo</h3>
        <p><strong>Bolo:</strong> ${pedido.nomeBolo}</p>
        <p><strong>Cliente:</strong> ${pedido.nomeCliente}</p>
        <p><strong>Endereço:</strong> ${pedido.endereco}</p>
        <p><strong>Número:</strong> ${pedido.numero}</p>
        ${
          pedido.complemento
            ? `<p><strong>Complemento:</strong> ${pedido.complemento}</p>`
            : ""
        }
        <p><strong>WhatsApp:</strong> ${pedido.whatsapp}</p>
        <p style="margin-top: 20px; text-align: center; font-size: 0.8em;">Obrigado pela preferência!</p>
      </div>
    `;

    const printWindow = window.open("", "_blank");
    printWindow.document.write("<html><head><title>Etiqueta do Pedido</title>");
    printWindow.document.write("<style>");
    printWindow.document.write(`
      body { font-family: 'Poppins', sans-serif; margin: 0; padding: 0; }
      div { box-sizing: border-box; }
      @media print {
        body { margin: 0; }
        div { page-break-after: always; }
      }
    `);
    printWindow.document.write("</style></head><body>");
    printWindow.document.write(printContent);
    printWindow.document.write("</body></html>");
    printWindow.document.close();
    printWindow.print();
  }
