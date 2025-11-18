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
  const closeModalBtn = document.querySelector(
    "#confirm-delivery-modal .close-button"
  );
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
    dynamicIslandFinishBtn.addEventListener("click", onFinishDynamicIsland);
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

function createOrderCard(orderId, order, onDeliver, onStartNavigation) {
  const card = document.createElement("div");
  card.className = "order-card";
  card.id = orderId;

  if (order.status === 'em_entrega') {
    card.classList.add('in-route'); // Add in-route class for styling
  }

  card.innerHTML = `
            <div class="order-card-header">
                <h4>${order.nomeBolo}</h4>
                <span class="order-id">#${orderId.toUpperCase()}</span>
            </div>
            <p><strong>Cliente:</strong> ${order.nomeCliente}</p>
            <p><strong>Endereço:</strong> ${order.endereco}</p>
            <div class="route-info" id="route-info-${orderId}"></div>
            <div class="order-actions">
                <button class="btn-sucesso deliver-button">Entregar</button>
                <button class="btn-secondary route-button">Iniciar Entrega</button>
            </div>
        `;

  const deliverButton = card.querySelector(".deliver-button");
  const routeButton = card.querySelector(".route-button");

  deliverButton.addEventListener("click", () => onDeliver(orderId));
  routeButton.addEventListener("click", () => onStartNavigation(orderId, order));

  if (order.status === 'pronto_para_entrega') {
    deliverButton.style.display = 'none';
  } else if (order.status === 'em_entrega') {
    routeButton.style.display = 'none';
  }

  return card;
}

export function renderDeliveryOrders(readyOrders, inRouteOrders, onDeliver, onStartNavigation) {
  const readyForDeliveryList = document.getElementById("ready-for-delivery-list");
  const inRouteList = document.getElementById("in-route-list");

  if (!readyForDeliveryList || !inRouteList) {
    console.error("Um ou mais elementos da lista de pedidos não foram encontrados no DOM.");
    return;
  }

  // Render "Prontos para Entrega"
  readyForDeliveryList.innerHTML = ""; // Limpa a lista
  if (Object.keys(readyOrders).length === 0) {
    readyForDeliveryList.innerHTML = "<p>Nenhum pedido pronto para entrega no momento.</p>";
  } else {
    for (const [orderId, order] of Object.entries(readyOrders)) {
      const card = createOrderCard(orderId, order, onDeliver, onStartNavigation);
      readyForDeliveryList.appendChild(card);
    }
  }

  // Render "Em Rota"
  inRouteList.innerHTML = ""; // Limpa a lista
  if (Object.keys(inRouteOrders).length === 0) {
    inRouteList.innerHTML = "<p>Nenhum pedido em rota no momento.</p>";
  } else {
    for (const [orderId, order] of Object.entries(inRouteOrders)) {
      const card = createOrderCard(orderId, order, onDeliver, onStartNavigation);
      inRouteList.appendChild(card);
    }
  }
}

export function updateLocationStatus(status) {
  const locationStatus = document.getElementById("location-status");
  if (locationStatus) locationStatus.textContent = status;
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
  const confirmDeliveryModal = document.getElementById(
    "confirm-delivery-modal"
  );
  if (confirmDeliveryModal) {
    confirmDeliveryModal.style.display = show ? "block" : "none";
  }
}

export function showDynamicIsland(show, order) {
  const dynamicIsland = document.getElementById("dynamic-island");
  const dynamicIslandContent = document.getElementById(
    "dynamic-island-content"
  );
  if (!dynamicIsland || !dynamicIslandContent) return;

  if (show && order) {
    dynamicIslandContent.innerHTML = `<p><strong>Cliente:</strong> ${order.nomeCliente}</p>
      <p>
        <strong>Endereço:</strong> ${order.endereco}</p>`;
    dynamicIsland.style.display = "flex";
  } else {
    dynamicIsland.style.display = "none";
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
