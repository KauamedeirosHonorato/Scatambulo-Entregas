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

  logoutButton.addEventListener("click", onLogout);
  confirmDeliveryBtn.addEventListener("click", onConfirmDelivery);
  cancelDeliveryBtn.addEventListener("click", onCancelDelivery);
  closeModalBtn.addEventListener("click", onCancelDelivery);
  dynamicIslandFinishBtn.addEventListener("click", onFinishDynamicIsland);
  dynamicIslandCancelBtn.addEventListener("click", onCancelNavigation);
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

export function renderReadyOrders(orders, onDeliver, onStartNavigation) {
  const readyOrdersList = document.getElementById("ready-orders-list");
  readyOrdersList.innerHTML = "";
  if (Object.keys(orders).length === 0) {
    readyOrdersList.innerHTML =
      "<p>Nenhum pedido pronto para entrega no momento.</p>";
    return;
  }

  for (const [orderId, order] of Object.entries(orders)) {
    const card = document.createElement("div");
    card.className = "order-card";
    card.id = orderId;
    card.innerHTML = `
              <h4>${order.nomeBolo}</h4>
              <p><strong>Cliente:</strong> ${order.nomeCliente}</p>
              <p><strong>Endereço:</strong> ${order.endereco}</p>
              <div class="route-info" id="route-info-${orderId}"></div>
              <div class="order-actions">
                  <button class="btn-sucesso deliver-button">Entregar</button>
                  <button class="btn-secondary route-button">Iniciar Entrega</button>
              </div>
          `;

    card
      .querySelector(".deliver-button")
      .addEventListener("click", () => onDeliver(orderId));
    card
      .querySelector(".route-button")
      .addEventListener("click", () => onStartNavigation(orderId, order));
    readyOrdersList.appendChild(card);
  }
}

export function updateLocationStatus(status) {
  const locationStatus = document.getElementById("location-status");
  locationStatus.textContent = status;
}

export function updateNavigationStatus(status) {
  const navigationStatus = document.getElementById("navigation-status");
  navigationStatus.textContent = status;
  navigationStatus.style.display = status ? "block" : "none";
}

export function updateSpeedDisplay(speed) {
  const speedDisplay = document.getElementById("speed-display");
  if (speed && speed > 0) {
    speedDisplay.innerHTML = `${Math.round(speed)}<span class="unit">km/h</span>`;
    speedDisplay.style.display = "flex";
  } else {
    speedDisplay.style.display = "none";
  }
}

export function updateEtaDisplay(duration) {
  const etaDisplay = document.getElementById("eta-display");
  if (duration) {
    etaDisplay.textContent = `${duration} min`;
    etaDisplay.style.display = "block";
  } else {
    etaDisplay.style.display = "none";
  }
}

export function updateDistanceDisplay(distance) {
  const distanceDisplay = document.getElementById("distance-display");
  if (distance) {
    distanceDisplay.innerHTML = `${distance}<span class="unit">km</span>`;
    distanceDisplay.style.display = "flex";
  } else {
    distanceDisplay.style.display = "none";
  }
}

export function showConfirmDeliveryModal(show) {
  const confirmDeliveryModal = document.getElementById(
    "confirm-delivery-modal"
  );
  confirmDeliveryModal.style.display = show ? "block" : "none";
}

export function showDynamicIsland(show, order) {
  const dynamicIsland = document.getElementById("dynamic-island");
  const dynamicIslandContent = document.getElementById(
    "dynamic-island-content"
  );
  if (show) {
    dynamicIslandContent.innerHTML = `<p><strong>Cliente:</strong> ${order.nomeCliente}</p><p><strong>Endereço:</strong> ${order.endereco}</p>`;
    dynamicIsland.style.display = "flex";
  } else {
    dynamicIsland.style.display = "none";
  }
}

export function updateButtonsForNavigation(isNavigating, activeOrderId) {
  const allRouteButtons = document.querySelectorAll(".route-button");
  allRouteButtons.forEach((button) => {
    const card = button.closest(".order-card");
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
