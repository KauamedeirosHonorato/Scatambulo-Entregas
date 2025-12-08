import { showToast, printLabel } from "./ui.js"; // Importa showToast e printLabel

export function setupEventListeners(
  onLogout,
  onFinishDynamicIsland,
  onCancelNavigation,
  onToggleFollowMe
) {
  const logoutButton = document.getElementById("logout-button");
  const dynamicIslandFinishBtn = document.getElementById(
    "dynamic-island-finish-btn"
  );
  const dynamicIslandCancelBtn = document.getElementById(
    "dynamic-island-cancel-btn"
  );
  const followMeButton = document.getElementById("follow-me-button");

  if (logoutButton) logoutButton.addEventListener("click", onLogout);
  if (dynamicIslandFinishBtn)
    dynamicIslandFinishBtn.addEventListener("click", onFinishDynamicIsland);
  if (dynamicIslandCancelBtn)
    dynamicIslandCancelBtn.addEventListener("click", onCancelNavigation);
  if (followMeButton)
    followMeButton.addEventListener("click", onToggleFollowMe);
}

document.addEventListener("DOMContentLoaded", () => {
  const dynamicIsland = document.getElementById("dynamic-island");

  if (dynamicIsland) {
    dynamicIsland.addEventListener("click", (event) => {
      // Ignora o clique se for em um botão de ação (Maps, Waze, Finalizar, etc.)
      // Isso permite que os botões funcionem sem expandir/recolher a ilha.
      if (event.target.closest("button, a")) {
        return;
      }

      // Só permite a ação se a ilha estiver visível (ativa).
      // A classe 'active' está no elemento pai.
      if (!dynamicIsland.classList.contains("active")) {
        return;
      }

      // Alterna a classe 'expanded' para expandir ou contrair.
      dynamicIsland.classList.toggle("expanded");
    });
  }
});

export function setFollowMeButtonState(isActive) {
  const followMeButton = document.getElementById("follow-me-button");
  if (followMeButton) {
    if (isActive) {
      followMeButton.classList.add("active");
    } else {
      followMeButton.classList.remove("active");
    }
  }
}

// [js/ui-entregador.js] - Substitua a função createOrderCard por esta:

function createOrderCard(
  orderId,
  order,
  onDeliver,
  onStartNavigation,
  onCancelNavigation
) {
  const card = document.createElement("div");
  card.className = "order-card";
  card.id = `order-${orderId}`; // Melhorar seletor de ID

  if (order.status === "em_entrega") {
    card.classList.add("in-route");
  } else if (order.status === "pronto_para_entrega") {
    card.classList.add("ready-for-delivery");
  }

  // Ícones SVG simples para melhorar visual (opcional)
  const iconMap = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: -2px; margin-right: 4px;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>`;
  const iconCake = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: -2px; margin-right: 4px;"><path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8"></path><path d="M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1"></path><path d="M2 21h20"></path><path d="M7 8v2"></path><path d="M12 8v2"></path><path d="M17 8v2"></path><path d="M7 4h.01"></path><path d="M12 4h.01"></path><path d="M17 4h.01"></path></svg>`;

  card.innerHTML = `
    <div class="order-card-header">
        <h4>${order.nomeCliente}</h4>
        <span class="order-id">#${orderId.substring(0, 5).toUpperCase()}</span>
    </div>
    
    <div style="margin-bottom: 8px; color: #444;">
        <strong>${iconCake} Pedido:</strong> <br>
        <span style="display:block; margin-left: 24px; color: #666;">${
          order.nomeBolo
        }</span>
    </div>
    
    <div style="margin-bottom: 16px; color: #444;">
        <strong>${iconMap} Endereço:</strong> <br>
        <span style="display:block; margin-left: 24px; color: #666; font-size: 0.9rem;">${
          order.endereco
        }</span>
    </div>

    <div class="route-info" id="route-info-${orderId}">
      ${
        order.status === "em_entrega" && order.entrega
          ? `
            <div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid #eee;">
              <p style="margin: 0; font-size: 0.85rem; color: #555;">
                <span style="display: inline-block; width: 80px;">Veloc.:</span> ${
                  order.entrega.velocidade
                    ? `${order.entrega.velocidade} km/h`
                    : "--"
                }
              </p>
              <p style="margin: 4px 0; font-size: 0.85rem; color: #555;">
                <span style="display: inline-block; width: 80px;">Dist.:</span> ${
                  order.entrega.distancia
                    ? `${order.entrega.distancia.toFixed(1)} km`
                    : "--"
                }
              </p>
              <p style="margin: 0; font-size: 0.85rem; color: #555;">
                <span style="display: inline-block; width: 80px;">ETA:</span> ${
                  order.entrega.tempoEstimado
                    ? `${Math.round(order.entrega.tempoEstimado)} min`
                    : "--"
                }
              </p>
            </div>
            `
          : ""
      }
    </div>
    
    <div class="order-actions">
        <button class="btn-sucesso deliver-button" style="flex: 1;">
           Confirmar Entrega
        </button>
        <button class="btn-primary route-button" style="flex: 1;">
           Iniciar Rota
        </button>
    </div>
  `;

  const deliverButton = card.querySelector(".deliver-button");
  const routeButton = card.querySelector(".route-button");

  deliverButton.addEventListener("click", (e) => {
    e.stopPropagation(); // Evita cliques acidentais no card
    onDeliver(orderId);
  });

  routeButton.addEventListener("click", (e) => {
    e.stopPropagation();
    if (order.status === "em_entrega") {
      onCancelNavigation();
    } else {
      onStartNavigation(orderId, order);
    }
  });

  // Lógica de exibição dos botões
  if (order.status === "pronto_para_entrega") {
    deliverButton.style.display = "none"; // Esconde botão entregar
    routeButton.textContent = "Iniciar Entrega";
  } else if (order.status === "em_entrega") {
    routeButton.textContent = "Cancelar Entrega";
    // Mantemos ambos visíveis ou ajustamos conforme regra de negócio
    // Se quiser esconder o "Iniciar" quando já estiver navegando, pode usar display none
  }

  return card;
}

export function renderDeliveryOrders(
  readyOrders,
  inRouteOrders,
  onDeliver,
  onStartNavigation,
  onCancelNavigation
) {
  const readyForDeliveryList = document.getElementById(
    "ready-for-delivery-list"
  );
  const readyForDeliveryContainer = document.getElementById(
    "ready-for-delivery-container"
  );
  const inRouteList = document.getElementById("in-route-list");

  if (!readyForDeliveryList || !inRouteList) {
    console.error(
      "Um ou mais elementos da lista de pedidos não foram encontrados no DOM."
    );
    return;
  }

  // Render "Prontos para Entrega"
  readyForDeliveryList.innerHTML = ""; // Limpa a lista
  if (Object.keys(readyOrders).length === 0) {
    readyForDeliveryList.innerHTML =
      "<p>Nenhum pedido pronto para entrega no momento.</p>";
  } else {
    for (const [orderId, order] of Object.entries(readyOrders)) {
      const card = createOrderCard(
        orderId,
        order,
        onDeliver,
        onStartNavigation,
        onCancelNavigation
      );
      readyForDeliveryList.appendChild(card);
    }
  }
  // Esconde o container inteiro se não houver pedidos prontos
  if (readyForDeliveryContainer) {
    readyForDeliveryContainer.style.display =
      Object.keys(readyOrders).length > 0 ? "block" : "none";
  }

  // Render "Em Rota"
  inRouteList.innerHTML = ""; // Limpa a lista
  if (Object.keys(inRouteOrders).length === 0) {
    inRouteList.innerHTML = "<p>Nenhum pedido em rota no momento.</p>";
  } else {
    for (const [orderId, order] of Object.entries(inRouteOrders)) {
      const card = createOrderCard(
        orderId,
        order,
        onDeliver,
        onStartNavigation,
        onCancelNavigation
      );
      inRouteList.appendChild(card);
    }
  }
}

export function updateDeliveryPersonStatus(status, type = "info") {
  const statusEl = document.getElementById("delivery-person-status");
  if (statusEl) {
    statusEl.textContent = status;
  }
  showToast(status, type); // Exibe a mensagem como toast
}

export function updateNavigationStatus(status) {
  const navigationStatus = document.getElementById("navigation-status");
  if (navigationStatus) {
    navigationStatus.textContent = status;
    navigationStatus.style.display = status ? "block" : "none";
  }
}

export function updateSpeedDisplay(speed) {
  const speedDisplay = document.getElementById("speed-display");
  if (speedDisplay) {
    if (speed) {
      speedDisplay.textContent = `${speed} km/h`;
      speedDisplay.style.display = "block";
    } else {
      speedDisplay.style.display = "none";
    }
  }
}

export function updateEtaDisplay(duration) {
  const etaDisplay = document.getElementById("eta-display");
  const expandedEtaEl = document.getElementById("expanded-island-eta");
  const text = duration ? `${duration} min` : "-- min";

  if (etaDisplay) {
    etaDisplay.textContent = text;
    etaDisplay.style.display = duration ? "block" : "none";
  }
  if (expandedEtaEl) {
    expandedEtaEl.textContent = text;
  }
}

export function updateDistanceDisplay(distance) {
  const distanceDisplay = document.getElementById("distance-display");
  const expandedDistanceEl = document.getElementById("expanded-island-distance");
  const text = distance ? `${distance} km` : "-- km";

  if (distanceDisplay) {
    distanceDisplay.innerHTML = distance
      ? `${distance}<span class="unit">km</span>`
      : "-- km";
    distanceDisplay.style.display = distance ? "flex" : "none";
  }
  if (expandedDistanceEl) {
    expandedDistanceEl.textContent = text;
  }
}

export function showDynamicIsland(show, order) {
  const islandWrapper = document.getElementById("dynamic-island-wrapper");
  const clientNameEl = document.getElementById("dynamic-island-client");
  const addressEl = document.getElementById("dynamic-island-address");
  const expandedItemEl = document.getElementById("expanded-island-item");
  const expandedAddressEl = document.getElementById("expanded-island-address");
  const expandedDistanceEl = document.getElementById("expanded-island-distance");
  const expandedEtaEl = document.getElementById("expanded-island-eta");
  const cancelBtn = document.getElementById("dynamic-island-cancel-btn");
  const finishBtn = document.getElementById("dynamic-island-finish-btn");

  if (!islandWrapper || !clientNameEl || !addressEl) {
    console.error("Dynamic Island elements not found:", {
      islandWrapper,
      clientNameEl,
      addressEl,
    });
    return;
  }

  if (show && order) {
    clientNameEl.textContent = order.nomeCliente || "Cliente";
    addressEl.textContent = order.endereco || "Endereço";
    if (expandedItemEl) expandedItemEl.textContent = order.nomeBolo || "--";
    if (expandedAddressEl)
      expandedAddressEl.textContent = order.endereco || "--";
    // A distância agora é exibida no overlay do mapa, não diretamente na ilha dinâmica.
    // if (distanceEl)
    //   distanceEl.textContent = order.distancia
    //     ? `${order.distancia} km`
    //     : "-- km";
    const dynamicIslandEl = islandWrapper.querySelector(".dynamic-island");
    if (dynamicIslandEl) dynamicIslandEl.classList.add("active");
  } else {
    // Limpa o texto ao esconder para não mostrar dados antigos rapidamente
    clientNameEl.textContent = "";
    addressEl.textContent = "";
    if (expandedItemEl) expandedItemEl.textContent = "--";
    if (expandedAddressEl) expandedAddressEl.textContent = "--";
    if (expandedDistanceEl) expandedDistanceEl.textContent = "-- km";
    if (expandedEtaEl) expandedEtaEl.textContent = "-- min";
    const dynamicIslandEl = islandWrapper.querySelector(".dynamic-island");
    if (dynamicIslandEl) dynamicIslandEl.classList.remove("active");
    // Garante que a ilha não permaneça expandida ao ser desativada
    if (dynamicIslandEl) dynamicIslandEl.classList.remove("expanded");
  }
}

/**
 * Mostra uma visão de confirmação na Ilha Dinâmica.
 * @param {'finish' | 'cancel'} action - O tipo de ação para estilizar o botão.
 * @param {string} message - A mensagem a ser exibida.
 * @param {() => void} onConfirm - Callback a ser executado ao confirmar.
 */
export function showIslandConfirmation(action, message, onConfirm) {
  const island = document.getElementById("dynamic-island");
  const confirmMsgEl = document.getElementById("island-confirmation-message");
  const confirmYesBtn = document.getElementById("island-confirm-yes");
  const confirmNoBtn = document.getElementById("island-confirm-no");

  if (!island || !confirmMsgEl || !confirmYesBtn || !confirmNoBtn) {
    console.error("Elementos de confirmação da Ilha Dinâmica não encontrados.");
    return;
  }

  // Garante que a ilha esteja expandida antes de mostrar a confirmação
  island.classList.remove("expanded");
  island.classList.add("confirming");

  confirmMsgEl.textContent = message;

  // Estiliza o botão de confirmação
  confirmYesBtn.className = "btn-island-action"; // Reseta classes
  if (action === 'finish') {
    confirmYesBtn.classList.add("btn-island-finish");
    confirmYesBtn.innerHTML = '<i class="ph ph-check"></i> Sim';
  } else if (action === 'cancel') {
    confirmYesBtn.classList.add("btn-island-cancel");
    confirmYesBtn.innerHTML = '<i class="ph ph-x"></i> Sim';
  }

  // Função para reverter ao estado expandido
  const goBack = () => {
    island.classList.remove("confirming");
    island.classList.add("expanded");
  };

  // Clona os botões para remover listeners antigos
  const newConfirmYesBtn = confirmYesBtn.cloneNode(true);
  confirmYesBtn.parentNode.replaceChild(newConfirmYesBtn, confirmYesBtn);

  const newConfirmNoBtn = confirmNoBtn.cloneNode(true);
  confirmNoBtn.parentNode.replaceChild(newConfirmNoBtn, confirmNoBtn);

  // Adiciona novos listeners
  newConfirmYesBtn.addEventListener("click", (e) => { e.stopPropagation(); onConfirm(); });
  newConfirmNoBtn.addEventListener("click", (e) => { e.stopPropagation(); goBack(); });
}

export function updateButtonsForNavigation(isNavigating, activeOrderId) {
  const allRouteButtons = document.querySelectorAll(".route-button");
  allRouteButtons.forEach((button) => {
    const card = button.closest(".order-card");
    if (!card) return;

    const orderId = card.id;

    if (isNavigating) {
      if (orderId === activeOrderId) {
        button.textContent = "Finalizar Navegação";
        button.disabled = false;
      } else {
        button.disabled = true;
      }
    } else {
      button.textContent = "Iniciar Entrega";
      button.disabled = false;
    }
  });
}

/**
 * Dispara uma animação de confete na tela.
 * Requer que a biblioteca canvas-confetti seja carregada.
 */
export function triggerConfettiAnimation() {
  if (typeof confetti !== "function") {
    console.warn("Biblioteca de confete não carregada.");
    return;
  }

  const duration = 3 * 1000; // Duração da animação em milissegundos
  const animationEnd = Date.now() + duration;
  const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 10000 };

  function randomInRange(min, max) {
    return Math.random() * (max - min) + min;
  }

  const interval = setInterval(function () {
    const timeLeft = animationEnd - Date.now();

    if (timeLeft <= 0) {
      return clearInterval(interval);
    }

    const particleCount = 50 * (timeLeft / duration);
    // Dispara de dois pontos para um efeito mais preenchido
    confetti({
      ...defaults,
      particleCount,
      origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
      colors: ["#d4af37", "#ffffff", "#ff9500", "#34c759"], // Cores da marca
    });
    confetti({
      ...defaults,
      particleCount,
      origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
      colors: ["#d4af37", "#ffffff", "#ff9500", "#34c759"], // Cores da marca
    });
  }, 250);
}

export function showSuggestionModal(orderData, onAccept) {
  const modal = document.getElementById("suggestion-modal");
  if (!modal) {
    console.error("O modal de sugestão não foi encontrado no DOM.");
    return;
  }

  const clientNameEl = document.getElementById("suggestion-client-name");
  const addressEl = document.getElementById("suggestion-address");
  const distanceEl = document.getElementById("suggestion-distance");
  const acceptBtn = document.getElementById("suggestion-modal-accept-btn");
  const closeBtn = document.getElementById("suggestion-modal-close-btn");

  // Função para esconder o modal e limpar listeners
  const hide = () => {
    modal.classList.remove("active");
    // Remove o listener do backdrop para não acumular
    modal.removeEventListener("click", backdropClickHandler);
  };

  const backdropClickHandler = (e) => {
    if (e.target === modal) {
      hide();
    }
  };

  if (orderData) {
    clientNameEl.textContent = orderData.clientName;
    addressEl.textContent = orderData.address;
    distanceEl.textContent = orderData.distance.toFixed(1);

    // Remove listeners antigos clonando os botões
    const newAcceptBtn = acceptBtn.cloneNode(true);
    acceptBtn.parentNode.replaceChild(newAcceptBtn, acceptBtn);

    const newCloseBtn = closeBtn.cloneNode(true);
    closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);

    // Adiciona novos listeners
    newAcceptBtn.addEventListener(
      "click",
      () => {
        if (onAccept) onAccept(orderData.id);
        hide();
      },
      { once: true }
    );

    newCloseBtn.addEventListener("click", hide, { once: true });

    // Adiciona listener para fechar ao clicar fora
    modal.addEventListener("click", backdropClickHandler);

    modal.classList.add("active");
  } else {
    hide();
  }
}

/**
 * Mostra ou esconde o modal de histórico de entregas.
 * @param {boolean} show - True para mostrar, false para esconder.
 * @param {Array} [orders] - Array de pedidos entregues para renderizar.
 */
export function showHistoryModal(show, orders = []) {
  const modal = document.getElementById("history-modal");
  if (!modal) return;

  const listContainer = document.getElementById("history-list-container");
  const closeButton = modal.querySelector(".close-button");

  const hide = () => {
    if (modal) modal.classList.remove("active");
  };

  if (show) {
    listContainer.innerHTML = ""; // Limpa a lista

    if (orders.length === 0) {
      listContainer.innerHTML = "<p>Nenhum pedido entregue encontrado.</p>";
    } else {
      orders.forEach(([orderId, order]) => {
        const item = document.createElement("div");
        item.className = "history-item";
        const deliveryDate = order.timestamp
          ? new Date(order.timestamp).toLocaleString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "Data indisponível";

        item.innerHTML = `
          <div class="history-item-header">
            <strong>#${orderId.substring(0, 5).toUpperCase()}</strong>
            <span>${deliveryDate}</span>
          </div>
          <div class="history-item-body">
            <p><strong>Cliente:</strong> ${order.nomeCliente}</p>
            <p><strong>Item:</strong> ${order.nomeBolo}</p>
          </div>
        `;
        listContainer.appendChild(item);
      });
    }

    if (closeButton) closeButton.onclick = hide;
    modal.classList.add("active");
  } else {
    hide();
  }
}

/**
 * Mostra ou esconde o modal de pedidos agendados.
 * @param {boolean} show - True para mostrar, false para esconder.
 */
export function showScheduledOrdersModal(show) {
  const modal = document.getElementById("scheduled-orders-modal");
  if (!modal) {
    console.error("Modal de pedidos agendados não encontrado!");
    showToast("Erro ao abrir agendamentos.", "error");
    return;
  }

  if (show) {
    modal.classList.add("active");
  } else {
    modal.classList.remove("active");
  }
}

/**
 * Renderiza os pedidos agendados no modal correspondente.
 * @param {Array} scheduledOrders - Array de pedidos agendados.
 * @param {Function} onStartNavigation - Callback para iniciar a navegação.
 */
export function renderScheduledOrders(scheduledOrders, onStartNavigation) {
  const listContainer = document.getElementById("scheduled-orders-list");
  if (!listContainer) return;

  listContainer.innerHTML = ""; // Limpa a lista

  if (scheduledOrders.length === 0) {
    listContainer.innerHTML =
      '<p style="text-align: center; color: #888;">Nenhum pedido agendado para os próximos 2 dias.</p>';
    return;
  }

  // Agrupa os pedidos por data de entrega
  const ordersByDate = scheduledOrders.reduce((acc, [id, order]) => {
    const date = order.dataEntrega;
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push([id, order]);
    return acc;
  }, {});

  // Renderiza cada grupo de data
  for (const date in ordersByDate) {
    const dayGroup = document.createElement("div");
    dayGroup.className = "scheduled-day-group";

    const formattedDate = new Date(`${date}T00:00:00`).toLocaleDateString(
      "pt-BR",
      {
        weekday: "long",
        day: "2-digit",
        month: "long",
      }
    );

    dayGroup.innerHTML = `<h4>${formattedDate}</h4>`;

    ordersByDate[date].forEach(([orderId, order]) => {
      const row = document.createElement("div");
      row.className = "order-row-scheduled";

      const horario = order.horarioEntrega || "Não especificado";

      row.innerHTML = `
        <div class="order-data-item-scheduled">
          <strong>${order.nomeCliente}</strong>
        </div>
        <div class="order-data-item-scheduled">
          ${order.nomeBolo}
        </div>
        <div class="order-data-item-scheduled">
          ${horario}
        </div>
        <div class="order-data-item-scheduled">
          ${order.endereco}
        </div>
        <div class="order-data-item-scheduled">
          <button class="btn-primary start-scheduled-btn" data-order-id="${orderId}">
            <i class="ph ph-moped"></i> Iniciar
          </button>
        </div>
      `;

      dayGroup.appendChild(row);
    });

    listContainer.appendChild(dayGroup);
  }

  // Usa delegação de eventos para os botões "Iniciar"
  listContainer.addEventListener('click', (event) => {
    const startBtn = event.target.closest('.start-scheduled-btn');
    if (startBtn && onStartNavigation) {
      const orderId = startBtn.dataset.orderId;
      const orderData = scheduledOrders.find(([id]) => id === orderId);
      if (orderData) {
        const [, order] = orderData;
        onStartNavigation(orderId, order, startBtn);
      }
    }
  });
}
