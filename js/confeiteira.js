
import {
  db,
  ref,
  listenToPedidos,
  updateOrderStatus,
  listenToEntregadorLocation,
  getAllOrders,
} from "./firebase.js";
import * as UI from "./ui-confeiteira.js";
import * as CommonUI from "./ui.js"; // Para showToast, showModal, etc.
import { parseWhatsappMessage, debounce, geocodeAddress } from "./utils.js";
import {
  handleNewOrderSubmit,
  handleCepInput,
} from "./ui.js";
import { loadComponents } from "./componentLoader.js";
import { showPrintPreviewModal } from "./modal-print-preview.js";
import * as Map from "./map.js";

document.addEventListener("DOMContentLoaded", () => {
  // ======= 1. Validação de Usuário =======
  const currentUser = JSON.parse(localStorage.getItem("currentUser"));
  if (!currentUser || currentUser.panel !== "confeiteira.html") {
    window.location.href = "index.html";
    return;
  }

  // ======= 2. Estado Global =======
  const newOrderSound = new Audio("audio/NotificacaoPedidoNovo.mp3");
  const deliveryCompleteSound = new Audio(
    "audio/NotificacaoPedidoEntregue.mp3"
  );
  let knownOrderIds = new Set();
  let knownDeliveredOrderIds = new Set();
  let isFirstLoad = true;
  let userInteracted = false;
  let map;
  let entregadorLocation = null;
  let activeDelivery = null;
  let clientCoords = null;
  let isFollowingEntregador = true;

  // ======= 3. Inicialização =======
  initializeApp();

  function tryPlaySound(audio) {
    if (!audio) return;
    if (userInteracted) {
      audio.play().catch(() => {});
      return;
    }

    // If the user hasn't interacted yet, schedule play on first interaction
    const handler = () => {
      try {
        audio.play().catch(() => {});
      } catch (e) {
        /* ignore */
      }
      userInteracted = true;
      window.removeEventListener("click", handler);
      window.removeEventListener("touchstart", handler);
      window.removeEventListener("keydown", handler);
    };

    window.addEventListener("click", handler, { once: true });
    window.addEventListener("touchstart", handler, { once: true });
    window.addEventListener("keydown", handler, { once: true });
  }

  async function initializeApp() {
    // 3.1. Carregar Modais e Componentes
    await loadComponents("#modal-container", [
      "components/modal-print-all.html",
      "components/modal-print-preview.html",
      "components/modal-order-history.html",
      "components/chat-window.html",
    ]);

    // 3.2. Inicializar o Mapa
    map = await Map.initializeMap("map", undefined, undefined, true);
    setupMapEventListeners();

    // 3.3. Configurar Listeners de UI
    setupUIEventListeners();

    // 3.4. Iniciar Listeners do Firebase
    listenToFirebaseChanges();
    
    
  }

  function setupMapEventListeners() {
    if (!map) return;

    const satBtn = document.getElementById("satellite-toggle");
    const toggle3dBtn = document.getElementById("toggle-3d");
    const followBtn = document.getElementById("follow-entregador-button");

    let satelliteOn = true; // Começa em modo satélite
    let threeDOn = false;

    if (satBtn) {
      satBtn.addEventListener("click", () => {
        satelliteOn = !satelliteOn;
        Map.setSatelliteMode(satelliteOn);
        satBtn.classList.toggle("active", satelliteOn);
      });
    }
    if (toggle3dBtn) {
      toggle3dBtn.addEventListener("click", () => {
        threeDOn = !threeDOn;
        Map.set3DMode(threeDOn);
        toggle3dBtn.classList.toggle("active", threeDOn);
      });
    }
    if (followBtn) followBtn.addEventListener("click", handleToggleFollow);

    map.on("dragstart", () => {
      isFollowingEntregador = false;
      Map.setFollowMode(false);
      followBtn?.classList.remove("active");
    });
  }

  function handleReadMessage() {
    const readModal = document.getElementById("modal-read-message");
    if (readModal) {
      readModal.classList.add("active");
      setTimeout(() => {
        const ta = document.getElementById("message-text");
        if (ta) ta.focus();
      }, 50);
    } else {
      console.warn("Modal de leitura de mensagem não encontrado.");
    }
  }

  // ======= 4. Event Listeners UI =======
  function setupUIEventListeners() {
    UI.setupEventListeners(
      () => {
        localStorage.removeItem("currentUser");
        window.location.href = "index.html";
      },
      // onNewOrder: Callback para o clique do botão "Novo Pedido"
      () => {
        handleNewOrder(); // Prepara o modal (limpa formulário)
        document.getElementById("novo-pedido-modal").classList.add("active"); // Abre o modal
      },
      handleReadMessage,
      null, // onPrintAll (not used in confeiteira)
      null, // onClearDelivered
      null, // onResetActiveDeliveries
      null, // onClearAllOrders
      showOrderHistoryModal, // onHistory
      handleNewOrderSubmit, // onNewOrderSubmit (important placement)
      handleCepInput // onCepInput
    );

    // Listener para o clique no marcador do cliente no mapa
    document.addEventListener("client-marker-click", (e) => {
      const order = e.detail.order;
      if (order) {
        showPrintPreviewModal(order);
      }
    });
  }

  // ======= 5. Event Listeners Firebase =======
  function listenToFirebaseChanges() {
    listenToPedidos(handlePedidosUpdate, handleError); // Agora também lida com o mapa
    listenToEntregadorLocation(handleEntregadorLocationUpdate, handleError);
  }

  async function handlePedidosUpdate(pedidos) {
    // 5.1. Notificações
    processNotifications(pedidos);

    // 5.2. Renderizar Kanban
    UI.renderBoard(pedidos, updatePedidoStatus, UI.printLabel, handlePrintPdf);

    // 5.3. Lógica do Mapa
    const activeOrderEntry = Object.entries(pedidos).find(
      ([, p]) => p.status === "em_entrega"
    );

    if (activeOrderEntry) {
      const [orderId, orderData] = activeOrderEntry;
      activeDelivery = { id: orderId, ...orderData };

      // Geocodifica o endereço do cliente se for uma nova entrega
      if (!clientCoords || activeDelivery.id !== (activeDelivery.oldId || null)) {
        const geocodeResult = await geocodeAddress(orderData.endereco);
        if (geocodeResult && !geocodeResult.error) {
          clientCoords = geocodeResult;
        } else {
          clientCoords = null; // Limpa se o geocode falhar
        }
        activeDelivery.oldId = activeDelivery.id;
      }

      Map.updateClientMarkerOnMap(clientCoords, activeDelivery);

      // Desenha a rota se já existir no pedido, senão, requisita uma nova
      if (orderData.entrega && orderData.entrega.geometria) {
        Map.drawMainRoute(orderData.entrega.geometria);
      } else if (entregadorLocation && clientCoords) {
        await Map.requestRoute(entregadorLocation, clientCoords);
      }

      updateMapFocus();
      updateOverlayInfo();
    } else {
      // Se não houver entrega ativa, limpa o mapa
      activeDelivery = null;
      clientCoords = null;
      Map.clearActiveRoute();

      // Mantém o marcador do entregador e centraliza nele
      if (entregadorLocation) {
        Map.updateDeliveryMarkerOnMap(entregadorLocation);
        Map.panMapTo(entregadorLocation);
      }
      updateOverlayInfo(); // Limpa as informações do overlay
    }
  }

  function handleError(error) {
    console.error("Firebase Error:", error);
    CommonUI.showPersistentError(
      "Erro de Conexão com o Firebase. Recarregue a página.",
      "Recarregar",
      () => window.location.reload()
    );
  }

  function handleEntregadorLocationUpdate(location) {
    entregadorLocation = location;
    Map.updateDeliveryMarkerOnMap(location);
    updateMapFocus();
    updateOverlayInfo();
  }

  // ======= 6. Ações de Pedido (Confeiteira) =======

  async function updatePedidoStatus(pedidoId, newStatus) {
    // A confeiteira não precisa de confirmação para seus status
    try {
      await updateOrderStatus(pedidoId, newStatus);
      CommonUI.showToast(
        `Pedido #${pedidoId
          .substring(0, 5)
          .toUpperCase()} atualizado para ${newStatus.replace("_", " ")}!`,
        "success"
      );
    } catch (e) {
      console.error("Erro ao atualizar status:", e);
      CommonUI.showToast("Erro ao atualizar status do pedido.", "error");
    }
  }

  function handlePrintPdf(pedido, pedidoId) {
    const orderData = { ...pedido, id: pedidoId };
    showPrintPreviewModal(orderData);
  }

  // ======= Funções de Controle do Mapa =======

  function handleToggleFollow() {
    isFollowingEntregador = !isFollowingEntregador;
    Map.setFollowMode(isFollowingEntregador);

    const followBtn = document.getElementById("follow-entregador-button");
    if (followBtn) {
      followBtn.classList.toggle("active", isFollowingEntregador);
    }

    if (isFollowingEntregador && entregadorLocation) {
      Map.updateCameraForLocation(entregadorLocation);
    }
  }

  function updateMapFocus() {
    if (isFollowingEntregador && entregadorLocation) {
      Map.updateCameraForLocation(entregadorLocation);
    } else if (entregadorLocation && clientCoords) {
      // Se não estiver seguindo, ajusta o mapa para mostrar entregador e cliente
      Map.fitMapToBounds(entregadorLocation, clientCoords);
    } else if (entregadorLocation) {
      // Se só tiver o entregador, centraliza nele
      Map.panMapTo(entregadorLocation);
    }
  }

  function updateOverlayInfo() {
    // Reutiliza a função de UI do admin para atualizar o overlay do mapa
    if (!activeDelivery || !entregadorLocation) {
      CommonUI.updateAdminMapInfo(null);
      return;
    }

    const entregaData = activeDelivery.entrega || {}; // Garante que o objeto exista, mesmo que vazio
    const currentSpeed = entregadorLocation.speed || 0; // Pega a velocidade da localização do entregador
    CommonUI.updateAdminMapInfo(activeDelivery, entregaData, currentSpeed);
  }

  async function showOrderHistoryModal() {
    const modal = document.getElementById("order-history-modal");
    const container = document.getElementById("history-list-container");
    const searchInput = document.getElementById("history-search-input");
    const closeButton = modal.querySelector(".close-button");
    const modalBody = modal.querySelector(".modal-body");

    if (!modal || !container || !searchInput || !closeButton || !modalBody) {
      CommonUI.showToast("Erro ao encontrar elementos do modal de histórico.", "error");
      return;
    }

    let allOrders = []; // Cache for all orders
    let filteredOrders = [];
    let currentPage = 1;
    const ordersPerPage = 10;

    // Create pagination container
    let paginationContainer = document.getElementById('history-pagination-container');
    if (!paginationContainer) {
        paginationContainer = document.createElement('div');
        paginationContainer.id = 'history-pagination-container';
        paginationContainer.style.textAlign = 'center';
        paginationContainer.style.marginTop = '15px';
        modalBody.appendChild(paginationContainer);
    }

    const openModal = () => modal.classList.add("active");
    const closeModal = () => modal.classList.remove("active");

    closeButton.onclick = closeModal;
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    const renderHistoryList = () => {
        container.innerHTML = "";
        
        const startIndex = (currentPage - 1) * ordersPerPage;
        const endIndex = startIndex + ordersPerPage;
        const paginatedOrders = filteredOrders.slice(startIndex, endIndex);

        if (paginatedOrders.length === 0) {
            container.innerHTML = "<p>Nenhum pedido encontrado.</p>";
            return;
        }

        paginatedOrders.forEach(([id, order]) => {
            const item = document.createElement("div");
            item.className = "history-item";
            const orderDate = new Date(order.timestamp).toLocaleDateString('pt-BR');
            const statusText = (order.status || "pendente").replace(/_/g, " ");

            item.innerHTML = `
                <div class="history-item-info">
                    <strong>${order.nomeCliente || 'Cliente não informado'}</strong>
                    <span>ID: ${id} - ${orderDate}</span>
                </div>
                <div class="history-item-status">
                    <span class="status-pill status-${order.status || 'pendente'}">${statusText}</span>
                </div>
            `;
            container.appendChild(item);
        });
    };

    const renderPagination = () => {
        paginationContainer.innerHTML = "";
        const totalPages = Math.ceil(filteredOrders.length / ordersPerPage);

        if (totalPages <= 1 || filteredOrders.length < 20) {
            return;
        }

        // Previous button
        const prevButton = document.createElement('button');
        prevButton.textContent = 'Anterior';
        prevButton.className = 'btn-secondary';
        prevButton.disabled = currentPage === 1;
        prevButton.onclick = () => {
            if (currentPage > 1) {
                currentPage--;
                renderHistoryList();
                renderPagination();
            }
        };
        paginationContainer.appendChild(prevButton);

        // Page numbers
        for (let i = 1; i <= totalPages; i++) {
            const pageButton = document.createElement('button');
            pageButton.textContent = i;
            pageButton.className = 'btn-secondary';
            if (i === currentPage) {
                pageButton.classList.add('active-page');
            }
            pageButton.disabled = i === currentPage;
            pageButton.onclick = () => {
                currentPage = i;
                renderHistoryList();
                renderPagination();
            };
            paginationContainer.appendChild(pageButton);
        }

        // Next button
        const nextButton = document.createElement('button');
        nextButton.textContent = 'Próximo';
        nextButton.className = 'btn-secondary';
        nextButton.disabled = currentPage === totalPages;
        nextButton.onclick = () => {
            if (currentPage < totalPages) {
                currentPage++;
                renderHistoryList();
                renderPagination();
            }
        };
        paginationContainer.appendChild(nextButton);
    };
    
    const filterAndRender = async (filter = "") => {
        const lowerCaseFilter = filter.toLowerCase();
        filteredOrders = allOrders.filter(([id, order]) => {
            return (
                id.toLowerCase().includes(lowerCaseFilter) ||
                (order.nomeCliente && order.nomeCliente.toLowerCase().includes(lowerCaseFilter)) ||
                (order.nomeBolo && order.nomeBolo.toLowerCase().includes(lowerCaseFilter)) ||
                (order.status && order.status.toLowerCase().includes(lowerCaseFilter))
            );
        });
        currentPage = 1;
        renderHistoryList();
        renderPagination();

        searchInput.addEventListener("input", debounce((e) => {
            filterAndRender(e.target.value);
        }, 300));

        openModal();
        container.innerHTML = "<p>Carregando histórico...</p>";

        try {
            const orders = await getAllOrders();
            allOrders = Object.entries(orders || {}).sort(([, a], [, b]) => (b.timestamp || 0) - (a.timestamp || 0));
            filterAndRender("");
        } catch (error) {
            console.error("Erro ao carregar histórico de pedidos:", error);
            container.innerHTML = "<p>Erro ao carregar o histórico. Tente novamente mais tarde.</p>";
            CommonUI.showToast("Erro ao carregar o histórico.", "error");
        }
    };
    if (isFirstLoad) {
      knownOrderIds = new Set(
        Object.keys(pedidos).filter((id) => pedidos[id].status === "pendente")
      );
      knownDeliveredOrderIds = new Set(
        Object.keys(pedidos).filter((id) => pedidos[id].status === "entregue")
      );
      isFirstLoad = false;
      return;
    }

    // Notificação de novos pedidos (pendentes)
    const newPendingOrders = Object.keys(pedidos).filter(
      (id) => pedidos[id].status === "pendente" && !knownOrderIds.has(id)
    );
    if (newPendingOrders.length > 0) {
      tryPlaySound(newOrderSound);
      newPendingOrders.forEach((id) => {
        knownOrderIds.add(id);
        CommonUI.showToast(
          `Novo Pedido Pendente! #${id.substring(0, 5).toUpperCase()}`,
          "info"
        );
      });
    }

    // Notificação de pedidos entregues (para limpar o board visualmente)
    const newDeliveredOrders = Object.keys(pedidos).filter(
      (id) =>
        pedidos[id].status === "entregue" && !knownDeliveredOrderIds.has(id)
    );
    if (newDeliveredOrders.length > 0) {
      tryPlaySound(deliveryCompleteSound);
      newDeliveredOrders.forEach((id) => {
        knownDeliveredOrderIds.add(id);
        CommonUI.showToast(
          `Entrega Concluída! Pedido #${id.substring(0, 5).toUpperCase()}`,
          "success"
        );
      });
    }
  }

  // ======= 7. Ações de Formulário =======

  function handleNewOrder() {
    // Ação ao abrir o modal (limpar o formulário)
    const form = document.getElementById("novo-pedido-form");
    if (form) {
      form.reset();
    }
    const errorEl = document.getElementById("pedido-error");
    if (errorEl) {
      errorEl.textContent = "";
    }
  }
});
