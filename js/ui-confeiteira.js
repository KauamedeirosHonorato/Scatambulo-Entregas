import {
  printLabel as genericPrintLabel,
  setupEventListeners as genericSetupEventListeners,
  createOrderCard as genericCreateOrderCard,
} from "./ui.js";

export function setupEventListeners(
  onLogout,
  onNewOrder,
  onReadMessage,
  onNewOrderSubmit,
  onReadMessageSubmit,
  onCepBlur
) {
  // Configuração do Menu Hambúrguer
  setupHamburgerMenu();

  // Chama a função genérica, passando os callbacks corretos.
  // As funções que não se aplicam à confeiteira (ex: onPrintAll) são passadas como null.
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
    (e) => onCepBlur(e) // Garante que o evento seja passado
  );
}
function setupHamburgerMenu() {
  const hamburger = document.querySelector(".hamburger-menu");
  const mobileNav = document.querySelector(".mobile-nav");
  const desktopNav = document.querySelector(".desktop-nav");

  if (!hamburger || !mobileNav || !desktopNav) return;

  hamburger.addEventListener("click", () => {
    mobileNav.classList.toggle("open");
    hamburger.classList.toggle("open");
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
    }
  };

  window.addEventListener("resize", moveNavItems);
  moveNavItems();
}

export function renderBoard(pedidos, onStatusUpdate, onPrintLabel) {
  const kanbanBoard = document.getElementById("kanban-board");
  kanbanBoard.innerHTML = "";
  const statuses = [
    { id: "pendente", title: "Pendente" },
    { id: "em_preparo", title: "Em Preparo" },
    { id: "feito", title: "Feito" },
    { id: "pronto_para_entrega", title: "Pronto para Entrega" },
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

export function updateDeliveryPersonStatus(status) {
  const statusEl = document.getElementById("delivery-person-status");
  if (statusEl) {
    statusEl.textContent = status;
  }
}

export function updateConfeiteiraMapInfo(order, deliveryData, speed) {
  const infoEl = document.getElementById("delivery-info-confeiteira");
  if (!infoEl) return;

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

export function clearConfeiteiraMapInfo() {
  const infoEl = document.getElementById("delivery-info-confeiteira");
  if (infoEl) {
    infoEl.style.display = "none";
    infoEl.innerHTML = "";
  }
}
