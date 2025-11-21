import { createNewOrder } from "./firebase.js";
import { parseWhatsappMessage } from "./utils.js";

export function setupEventListeners(
  onLogout,
  onNewOrder,
  onPrintAll,
  onReadMessage,
  onClearDelivered,
  onResetActiveDeliveries,
  onClearAllOrders,
  onNewOrderSubmit, // Movido para o final para consistência
  onReadMessageSubmit, // Movido para o final
  onCepInput
) {
  // Configuração do Menu Hambúrguer
  setupHamburgerMenu();

  // Configuração dos Listeners de Eventos
  const logoutButton = document.getElementById("logout-button");
  const newOrderModal = document.getElementById("novo-pedido-modal"); // CORREÇÃO: ID correto
  const readMessageModal = document.getElementById("read-message-modal");
  const newOrderBtn = document.getElementById("new-order-button");
  const printAllEmPreparoBtn = document.getElementById(
    "print-all-em-preparo-button"
  );
  const readMessageBtn = document.getElementById("read-message-button");
  const closeButtons = document.querySelectorAll(".close-button");
  const readMessageForm = document.getElementById("read-message-form");
  const newOrderForm = document.getElementById("novo-pedido-form"); // CORREÇÃO: ID correto
  const cepField = document.getElementById("cep");
  const clearDeliveredBtn = document.getElementById("clear-delivered-button");
  const resetDeliveriesBtn = document.getElementById(
    "reset-active-deliveries-button"
  ); // Novo botão
  const clearAllBtn = document.getElementById("clear-all-orders-button");

  logoutButton.addEventListener("click", onLogout);
  if (newOrderBtn && onNewOrder) {
    // Use the callback for the button click
    newOrderBtn.addEventListener("click", onNewOrder);
  } else if (newOrderBtn && newOrderModal) {
    // Fallback if no specific callback is provided
    newOrderBtn.addEventListener("click", () =>
      newOrderModal.classList.add("active")
    );
  }
  if (printAllEmPreparoBtn)
    printAllEmPreparoBtn.addEventListener("click", onPrintAll);
  if (readMessageBtn && onReadMessage) {
    // Use the callback for the button click
    readMessageBtn.addEventListener("click", onReadMessage);
  } else if (readMessageBtn && readMessageModal) {
    // Fallback
    readMessageBtn.addEventListener("click", () =>
      readMessageModal.classList.add("active")
    );
  }
  if (clearDeliveredBtn)
    clearDeliveredBtn.addEventListener("click", onClearDelivered);
  if (resetDeliveriesBtn && onResetActiveDeliveries)
    resetDeliveriesBtn.addEventListener("click", onResetActiveDeliveries); // Adiciona o listener
  if (clearAllBtn && onClearAllOrders)
    clearAllBtn.addEventListener("click", onClearAllOrders);

  closeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      // Encontra o modal pai mais próximo e o fecha
      const modalToClose = button.closest(
        ".modal-novo-pedido, .modal-backdrop"
      );
      if (modalToClose) modalToClose.classList.remove("active");
    });
  });

  window.addEventListener("click", (event) => {
    if (event.target === newOrderModal)
      newOrderModal.classList.remove("active");
    if (event.target === readMessageModal)
      readMessageModal.classList.remove("active");
  });

  // CORREÇÃO: Usar 'blur' para o CEP para evitar chamadas excessivas à API
  if (cepField && onCepInput) {
    cepField.addEventListener("blur", onCepInput);
  }
  if (newOrderForm && onNewOrderSubmit)
    newOrderForm.addEventListener("submit", onNewOrderSubmit);
  if (readMessageForm && onReadMessageSubmit)
    readMessageForm.addEventListener("submit", onReadMessageSubmit);
}

/**
 * Handler genérico para o formulário de novo pedido.
 * @param {Event} e - O evento de submit.
 */
export function handleNewOrderSubmit(e) {
  e.preventDefault();

  const itemEl = document.getElementById("item");
  if (!itemEl) {
    console.error("Erro: O campo de item (ID 'item') não foi encontrado.");
    showToast("Erro de formulário: Campo 'Item' ausente.", "error");
    return;
  }

  const orderData = {
    nomeBolo: itemEl.value,
    nomeCliente: document.getElementById("cliente-nome").value, // ID correto
    emailCliente: document.getElementById("email-cliente")?.value || "",
    whatsapp: document.getElementById("telefone").value,
    cep: document.getElementById("cep").value,
    rua: document.getElementById("rua").value,
    numero: document.getElementById("numero").value,
    bairro: document.getElementById("bairro").value,
    cidade: document.getElementById("cidade")?.value || "",
    complemento: document.getElementById("complemento").value,
  };

  orderData.endereco = `${orderData.rua}, ${orderData.numero}, ${orderData.bairro} - ${orderData.cep}`;

  createNewOrder(orderData)
    .then(() => {
      showToast("Novo pedido criado com sucesso!", "success");
      e.target.reset();
      document.getElementById("novo-pedido-modal").classList.remove("active");
    })
    .catch((err) => {
      console.error("Erro ao criar novo pedido:", err);
      showToast("Falha ao criar o pedido. Tente novamente.", "error");
    });
}

/**
 * Handler genérico para o formulário de leitura de mensagem.
 * @param {Event} e - O evento de submit.
 */
export function handleReadMessageSubmit(e) {
  e.preventDefault();
  const messageText = document.getElementById("message-text").value;
  const parsedData = parseWhatsappMessage(messageText);

  if (!parsedData || !parsedData.cliente.enderecoRaw) {
    showToast("Não foi possível extrair dados da mensagem.", "error");
    return;
  }

  fillOrderForm(parsedData);
  document.getElementById("read-message-modal").classList.remove("active");
  document.getElementById("novo-pedido-modal").classList.add("active");
}

/**
 * Handler genérico para o input de CEP.
 * @param {Event} e - O evento de blur.
 */
export async function handleCepInput(e) {
  const cep = e.target.value.replace(/\D/g, "");
  if (cep.length !== 8) return;

  try {
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const data = await res.json();
    if (!data.erro) fillAddressForm(data);
  } catch (err) {
    console.error("Erro ao buscar CEP:", err);
    showToast("Erro ao buscar CEP.", "error");
  }
}

function setupHamburgerMenu() {
  const hamburger = document.querySelector(".hamburger-menu");
  const mobileNav = document.querySelector(".mobile-nav");
  const desktopNav = document.querySelector(".desktop-nav");

  if (!hamburger || !mobileNav || !desktopNav) return;

  // Abre/fecha o menu ao clicar no botão
  hamburger.addEventListener("click", (e) => {
    e.stopPropagation(); // Impede que o evento de clique se propague para o document
    mobileNav.classList.toggle("open");
    hamburger.classList.toggle("open");
  });

  // Fecha o menu se clicar fora dele
  document.addEventListener("click", (e) => {
    if (mobileNav.classList.contains("open")) {
      // Verifica se o clique foi fora do menu e também não foi no próprio botão hambúrguer
      if (!mobileNav.contains(e.target) && !hamburger.contains(e.target)) {
        mobileNav.classList.remove("open");
        hamburger.classList.remove("open");
      }
    }
  });

  // Função para mover os botões
  const moveNavItems = () => {
    if (window.innerWidth <= 768) {
      // Move para o menu mobile se não estiverem lá
      while (desktopNav.firstChild) {
        mobileNav.appendChild(desktopNav.firstChild);
      }
    } else {
      // Move de volta para o menu desktop
      while (mobileNav.firstChild) {
        desktopNav.appendChild(mobileNav.firstChild);
      }
      mobileNav.classList.remove("open"); // Garante que o menu mobile feche
      hamburger.classList.remove("open"); // Garante que o ícone volte ao normal
    }
  };

  // Executa na carga e no redimensionamento da janela
  window.addEventListener("resize", moveNavItems);
  moveNavItems(); // Executa uma vez na carga inicial
}

export function renderBoard(pedidos, onStatusUpdate, onPrintLabel) {
  const adminContainer = document.getElementById("orders-by-status-container");
  // Se o container de admin existir, renderiza as tabelas agrupadas por status
  if (adminContainer) {
    renderGroupedOrders(pedidos, onStatusUpdate, onPrintLabel);
    return;
  }

  const kanbanBoard = document.getElementById("kanban-board"); // Fallback para Kanban (Confeiteira)
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

function renderGroupedOrders(pedidos, onStatusUpdate, onPrintLabel) {
  const container = document.getElementById("orders-by-status-container");
  container.innerHTML = "";

  const pedidosPorStatus = {
    pendente: [],
    em_preparo: [],
    feito: [],
    pronto_para_entrega: [],
    em_entrega: [],
    entregue: [],
    cancelado: [],
  };

  Object.entries(pedidos).forEach(([id, pedido]) => {
    const status = pedido.status || "pendente";
    if (pedidosPorStatus[status]) {
      pedidosPorStatus[status].push([id, pedido]);
    }
  });

  const statusOrder = [
    { id: "pendente", title: "Pendentes" },
    { id: "em_preparo", title: "Em Preparo" },
    { id: "feito", title: "Feitos" },
    { id: "pronto_para_entrega", title: "Prontos para Entrega" },
    { id: "em_entrega", title: "Em Rota" },
    { id: "entregue", title: "Entregues" },
    { id: "cancelado", title: "Cancelados" },
  ];

  statusOrder.forEach((statusInfo) => {
    const groupPedidos = pedidosPorStatus[statusInfo.id];

    // Não renderiza a seção se não houver pedidos nesse status
    if (groupPedidos.length === 0) return;

    // Ordena os pedidos dentro do grupo por timestamp
    groupPedidos.sort(
      ([, a], [, b]) => (b.timestamp || 0) - (a.timestamp || 0)
    );

    const groupWrapper = document.createElement("div");
    groupWrapper.className = "status-group-wrapper";

    groupWrapper.innerHTML = `
      <h3>
        <span class="status-pill status-${statusInfo.id}" style="margin-right: 10px;">${statusInfo.title}</span>
      </h3>
      <div class="orders-table-wrapper">
        <div class="orders-table-header">
          <span>ID</span>
          <span>Cliente</span>
          <span>Item</span>
          <span>Status</span>
          <span>Ações</span>
        </div>
        <div id="orders-list-${statusInfo.id}"></div>
      </div>
    `;

    const listContainer = groupWrapper.querySelector(
      `#orders-list-${statusInfo.id}`
    );
    groupPedidos.forEach(([id, pedido]) => {
      const row = createOrderTableRow(id, pedido, onStatusUpdate, onPrintLabel);
      listContainer.appendChild(row);
    });

    container.appendChild(groupWrapper);
  });
}

/**
 * Cria uma linha (row) para a tabela de pedidos.
 */
function createOrderTableRow(pedidoId, pedido, onStatusUpdate, onPrintLabel) {
  const row = document.createElement("div");
  row.className = "order-row";
  row.id = `pedido-${pedidoId}`;

  const statusText = (pedido.status || "pendente").replace(/_/g, " ");

  row.innerHTML = `
      <div class="order-data-item">
        <span class="label">ID</span>
        <span class="order-id-copy" data-order-id="${pedidoId}" title="Clique para copiar">
          #${pedidoId.substring(0, 5).toUpperCase()}
        </span>
      </div>
      <div class="order-data-item">
        <span class="label">Cliente</span>
        ${pedido.nomeCliente || "N/A"}
      </div>
      <div class="order-data-item">
        <span class="label">Item</span>
        ${
          pedido.nomeBolo ||
          (pedido.items && pedido.items[0] ? pedido.items[0].nome : "N/A")
        }
      </div>
      <div class="order-data-item status-data">
        <span class="label">Status</span>
        <span class="status-pill status-${
          pedido.status || "pendente"
        }">${statusText}</span>
      </div>
      <div class="order-data-item">
        <div class="order-actions-mini">
          <!-- Botões de ação serão adicionados aqui -->
        </div>
      </div>
    `;

  const actionsContainer = row.querySelector(".order-actions-mini");

  // Botão de Imprimir
  const printBtn = document.createElement("button");
  printBtn.className = "action-icon-btn";
  printBtn.title = "Imprimir Etiqueta";
  printBtn.innerHTML = '<i class="ph ph-printer"></i>';
  printBtn.onclick = () => onPrintLabel(pedido, pedidoId);
  actionsContainer.appendChild(printBtn);

  // Botão de Próximo Status (se houver)
  const nextAction = getNextAction(pedido.status);
  if (nextAction) {
    const nextBtn = document.createElement("button");
    nextBtn.className = "action-text-btn primary"; // Nova classe para o botão com texto
    nextBtn.title = nextAction.text;
    nextBtn.innerHTML = `<i class="ph ${nextAction.icon}"></i> <span>${nextAction.text}</span>`; // Adiciona o texto
    nextBtn.onclick = () => onStatusUpdate(pedidoId, nextAction.newStatus);
    actionsContainer.appendChild(nextBtn);
  }

  return row;
}

function getNextAction(status) {
  const actions = statusActions.get(status);
  // Retorna a primeira ação que muda o status
  return actions ? actions.find((a) => a.newStatus) : null;
}

const statusActions = new Map([
  [
    "pendente",
    [
      {
        text: "Iniciar Preparo",
        className: "btn-secondary",
        newStatus: "em_preparo",
        icon: "ph-fire",
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
        icon: "ph-check-circle",
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
        icon: "ph-package",
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
        icon: "ph-moped",
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
                      <div class="order-id-container">
                        <span class="order-id" title="Clique para copiar">#${pedidoId.toUpperCase()}</span>
                        <span class="copy-feedback">Copiado!</span>
                      </div>
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

  // Adiciona a lógica de copiar ao clicar no ID
  const orderIdContainer = card.querySelector(".order-id-container");
  if (orderIdContainer) {
    const orderIdSpan = orderIdContainer.querySelector(".order-id");
    const copyFeedbackSpan = orderIdContainer.querySelector(".copy-feedback");

    orderIdSpan.addEventListener("click", (e) => {
      e.stopPropagation(); // Impede que outros eventos de clique no card sejam disparados
      const codeToCopy = pedidoId.toUpperCase();
      navigator.clipboard.writeText(codeToCopy).then(() => {
        copyFeedbackSpan.classList.add("visible");
        setTimeout(() => {
          copyFeedbackSpan.classList.remove("visible");
        }, 1500);
      });
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
        <div class="info-item">
          <div class="value">${speedText}</div>
          <div class="label">🚗 Velocidade</div>
        </div>
        <div class="info-item">
          <div class="value">${distanceText}</div>
          <div class="label">📏 Distância</div>
        </div>
        <div class="info-item">
          <div class="value">${timeText}</div>
          <div class="label">⏱️ Tempo Estimado</div>
        </div>
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
  // Mapeia os nomes de dados para os IDs dos campos do formulário
  const fields = {
    nomeBolo: document.getElementById("item"), // CORREÇÃO: ID correto é 'item'
    nomeCliente: document.getElementById("cliente-nome"), // CORREÇÃO: ID correto é 'cliente-nome'
    cep: document.getElementById("cep"),
    rua: document.getElementById("rua"),
    bairro: document.getElementById("bairro"),
    numero: document.getElementById("numero"),
    complemento: document.getElementById("complemento"),
    whatsapp: document.getElementById("telefone"), // CORREÇÃO: ID correto é 'telefone'
    emailCliente: document.getElementById("email-cliente"),
  };
  for (const key of Object.keys(fields)) {
    if (Object.prototype.hasOwnProperty.call(fields, key) && data[key]) {
      fields[key].value = data[key];
    }
  }
}

/**
 * Preenche os campos de endereço do formulário com base nos dados do ViaCEP.
 * @param {object} addressData - Objeto com os dados do endereço (logradouro, bairro).
 */
export function fillAddressForm(addressData) {
  const cepField = document.getElementById("cep");
  const ruaField = document.getElementById("rua");
  const bairroField = document.getElementById("bairro");
  const numeroField = document.getElementById("numero");

  if (ruaField) ruaField.value = addressData.logradouro || "";
  if (cepField) cepField.value = addressData.cep || "";
  if (bairroField) bairroField.value = addressData.bairro || "";
  if (numeroField) numeroField.focus(); // Move o foco para o campo de número
}

export function printLabel(pedido, pedidoId) {
  const fullId = pedidoId ? pedidoId.toUpperCase() : "N/A";
  const printContent = `
    <div style="font-family: 'Poppins', sans-serif; padding: 20px; border: 2px solid #d4af37; width: 350px; box-sizing: border-box; border-radius: 10px;">
      <h3 style="text-align: center; margin-top: 0; margin-bottom: 20px; color: #d4af37;">Detalhes do Pedido</h3>
      <p><strong>Cliente:</strong> ${pedido.nomeCliente || "N/A"}</p>
      <p><strong>Bolo:</strong> ${pedido.nomeBolo || "N/A"}</p>
      <p><strong>Cód. Rastreio:</strong> ${fullId}</p>
      <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
      <p><strong>Endereço de Entrega:</strong></p>
      <div style="padding-left: 15px;">
        <p><strong>Rua:</strong> ${pedido.rua || "N/A"}, ${
    pedido.numero || "S/N"
  }</p>
        <p><strong>Bairro:</strong> ${pedido.bairro || "N/A"}</p>
        <p><strong>Cidade:</strong> ${pedido.cidade || "N/A"}</p>
        <p><strong>CEP:</strong> ${pedido.cep || "N/A"}</p>
      </div>
      <p style="margin-top: 25px; text-align: center; font-size: 0.9em; font-style: italic;">Feito com carinho para adoçar o seu dia!</p>
      <p style="margin-top: 5px; text-align: center; font-weight: 600;">Angela Scatambulo Agradece</p>
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

/**
 * Exibe uma notificação toast na tela.
 * @param {string} message - A mensagem a ser exibida.
 * @param {'success' | 'error' | 'info'} type - O tipo de notificação.
 */
export function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) {
    console.error("Toast container not found!");
    return;
  }

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  const icons = {
    success: "✅",
    error: "❌",
    info: "ℹ️",
  };

  // Adiciona o conteúdo
  toast.innerHTML = `
    <span class="toast-icon">${icons[type]}</span>
    <span class="toast-message">${message}</span>
  `;

  container.prepend(toast); // Alterado para prepend para que a nova notificação apareça no topo

  // Remove o toast automaticamente apenas se não for um erro
  if (type !== "error") {
    setTimeout(() => toast.remove(), 5000); // Aumentei para 5 segundos
  }
}

/**
 * Exibe um modal de confirmação.
 * @param {string} message - A mensagem a ser exibida no modal.
 * @param {() => void} onConfirm - Callback a ser executado se o usuário confirmar.
 * @param {string} [confirmText='Confirmar'] - Texto do botão de confirmação.
 * @param {'btn-danger' | 'btn-sucesso' | 'btn-primary'} [confirmClass='btn-danger'] - Classe do botão de confirmação.
 */
export function showConfirmModal(
  message,
  onConfirm,
  confirmText = "Confirmar",
  confirmClass = "btn-danger"
) {
  const modal = document.getElementById("generic-confirm-modal");
  const messageEl = document.getElementById("generic-confirm-modal-body");
  const confirmBtn = document.getElementById(
    "generic-confirm-modal-confirm-btn"
  );
  const cancelBtn = document.getElementById("generic-confirm-modal-cancel-btn");

  if (!modal || !messageEl || !confirmBtn || !cancelBtn) {
    console.error(
      "Elementos do modal de confirmação genérico não encontrados!"
    );
    return;
  }

  messageEl.textContent = message;
  confirmBtn.textContent = confirmText;
  confirmBtn.className = `btn ${confirmClass}`; // Reseta e aplica a nova classe

  // Remove listeners antigos para evitar duplicação
  const newConfirmBtn = confirmBtn.cloneNode(true);
  confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
  const newCancelBtn = cancelBtn.cloneNode(true);
  cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

  newConfirmBtn.onclick = () => {
    modal.classList.remove("active");
    onConfirm();
  };
  newCancelBtn.onclick = () => modal.classList.remove("active");

  modal.classList.add("active");
}

/**
 * Atualiza o texto do status da localização.
 * @param {string} status - A mensagem de status a ser exibida.
 */
export function updateLocationStatus(status) {
  const locationStatus = document.getElementById("location-status");
  if (locationStatus) locationStatus.textContent = status;
}

/**
 * Mostra um banner de erro persistente com ação opcional.
 * @param {string} message
 * @param {string} [actionText]
 * @param {() => void} [actionCallback]
 */
export function showPersistentError(message, actionText, actionCallback) {
  let existing = document.getElementById("persistent-error");
  if (existing) existing.remove();

  const banner = document.createElement("div");
  banner.id = "persistent-error";
  banner.className = "persistent-error";
  banner.innerHTML = `
    <div class="persistent-error-content">
      <span class="persistent-error-message">${message}</span>
      <div class="persistent-error-actions">
        ${
          actionText
            ? `<button id="persistent-error-action" class="btn-primary">${actionText}</button>`
            : ""
        }
        <button id="persistent-error-close" class="btn-secondary">Fechar</button>
      </div>
    </div>
  `;

  document.body.prepend(banner);

  const closeBtn = document.getElementById("persistent-error-close");
  if (closeBtn) closeBtn.addEventListener("click", () => banner.remove());

  if (actionText && actionCallback) {
    const actionBtn = document.getElementById("persistent-error-action");
    if (actionBtn)
      actionBtn.addEventListener("click", () => {
        try {
          actionCallback();
        } finally {
          banner.remove();
        }
      });
  }
}

export function hidePersistentError() {
  const existing = document.getElementById("persistent-error");
  if (existing) existing.remove();
}
