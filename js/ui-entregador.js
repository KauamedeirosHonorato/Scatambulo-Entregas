import { showToast } from "./ui.js"; // Importa showToast

export function setupEventListeners(
  onLogout,
  onConfirmDelivery,
  onCancelDelivery,
  onFinishDynamicIsland,
  onCancelNavigation,
  onToggleFollowMe
) {
  const logoutButton = document.getElementById("logout-button");
  const confirmDeliveryBtn = document.getElementById("confirm-delivery-btn");
  const cancelDeliveryBtn = document.getElementById("cancel-delivery-btn");
  const closeModalBtn = document.querySelector("#confirm-delivery-modal .close-button");
  const dynamicIslandFinishBtn = document.getElementById(
    "dynamic-island-finish-btn"
  );
  const dynamicIslandCancelBtn = document.getElementById(
    "dynamic-island-cancel-btn"
  );
  const followMeButton = document.getElementById("follow-me-button");

  if (logoutButton) logoutButton.addEventListener("click", onLogout);
  if (confirmDeliveryBtn)
    confirmDeliveryBtn.addEventListener("click", onConfirmDelivery);
  if (cancelDeliveryBtn)
    cancelDeliveryBtn.addEventListener("click", onCancelDelivery);
  if (closeModalBtn) closeModalBtn.addEventListener("click", onCancelDelivery);
  if (dynamicIslandFinishBtn)
    dynamicIslandFinishBtn.addEventListener("click", onConfirmDelivery);
  if (dynamicIslandCancelBtn)
    dynamicIslandCancelBtn.addEventListener("click", onCancelNavigation);
  if (followMeButton)
    followMeButton.addEventListener("click", onToggleFollowMe);
}

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

    <div class="route-info" id="route-info-${orderId}"></div>
    
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
    routeButton.textContent = "Finalizar Navegação";
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
  if (etaDisplay) {
    if (duration) {
      etaDisplay.textContent = `${duration} min`;
      etaDisplay.style.display = "block";
    } else {
      etaDisplay.style.display = "none";
    }
  }
}

export function updateDistanceDisplay(distance) {
  const distanceDisplay = document.getElementById("distance-display");
  if (distanceDisplay) {
    if (distance) {
      distanceDisplay.innerHTML = `${distance}<span class="unit">km</span>`;
      distanceDisplay.style.display = "flex";
    } else {
      distanceDisplay.style.display = "none";
    }
  }
}

export function showConfirmDeliveryModal(show) {
  const confirmDeliveryModal = document.getElementById("confirm-delivery-modal");
  if (confirmDeliveryModal) {
    if (show) {
      confirmDeliveryModal.classList.add("active");
    } else {
      confirmDeliveryModal.classList.remove("active");
    }
  }
}

export function showDynamicIsland(show, order) {
  const dynamicIsland = document.getElementById("dynamic-island");
  const clientNameEl = document.getElementById("dynamic-island-client");
  const addressEl = document.getElementById("dynamic-island-address");

  const distanceEl = document.getElementById("dynamic-island-distance");
  const cancelBtn = document.getElementById("dynamic-island-cancel-btn");
  const finishBtn = document.getElementById("dynamic-island-finish-btn");

  if (!dynamicIsland || !clientNameEl || !addressEl) return;

  if (show && order) {
    clientNameEl.textContent = order.nomeCliente || "Cliente";
    addressEl.textContent = order.endereco || "Endereço";
    if (distanceEl)
      distanceEl.textContent = order.distancia
        ? `${order.distancia} km`
        : "-- km";

    // Mostra botões e habilita/desabilita conforme status
    if (cancelBtn) cancelBtn.style.display = "inline-block";
    if (finishBtn) finishBtn.style.display = "inline-block";

    dynamicIsland.classList.add("active");
  } else {
    // Limpa o texto ao esconder para não mostrar dados antigos rapidamente
    clientNameEl.textContent = "";
    addressEl.textContent = "";
    if (distanceEl) distanceEl.textContent = "-- km";
    if (cancelBtn) cancelBtn.style.display = "none";
    if (finishBtn) finishBtn.style.display = "none";
    dynamicIsland.classList.remove("active");
  }
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

export function showSuggestionModal(orderData, onAccept) {
  const modal = document.getElementById('suggestion-modal');
  if (!modal) {
    console.error('O modal de sugestão não foi encontrado no DOM.');
    return;
  }

  const clientNameEl = document.getElementById('suggestion-client-name');
  const addressEl = document.getElementById('suggestion-address');
  const distanceEl = document.getElementById('suggestion-distance');
  const acceptBtn = document.getElementById('suggestion-modal-accept-btn');
  const closeBtn = document.getElementById('suggestion-modal-close-btn');

  // Função para esconder o modal e limpar listeners
  const hide = () => {
    modal.classList.remove('active');
    // Remove o listener do backdrop para não acumular
    modal.removeEventListener('click', backdropClickHandler);
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
    newAcceptBtn.addEventListener('click', () => {
      if (onAccept) onAccept(orderData.id);
      hide();
    }, { once: true });

    newCloseBtn.addEventListener('click', hide, { once: true });
    
    // Adiciona listener para fechar ao clicar fora
    modal.addEventListener('click', backdropClickHandler);

    modal.classList.add('active');
  } else {
    hide();
  }
}


