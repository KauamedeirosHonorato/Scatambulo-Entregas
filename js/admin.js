// js/admin.js - Refatorado para MapLibre GL JS

import {
  db,
  ref,
  get,
  listenToPedidos,
  listenToEntregadorLocation,
  updateOrderStatus,
  clearDeliveredOrders,
  resetAllActiveDeliveries,
  clearAllOrders, // Adicionada a importação que faltava
} from "./firebase.js";
import { parseWhatsappMessage, geocodeAddress, printViaIframe } from "./utils.js";
import { loadComponents } from "./componentLoader.js";
import * as Map from "./map.js"; // UI.showToast será usado aqui
import * as UI from "./ui.js";
import {
  handleNewOrderSubmit,
  handleReadMessageSubmit,
  handleCepInput,
} from "./ui.js";
import { showPrintPreviewModal } from './modal-print-preview.js';

let map;
let entregadorLocation = null;
let activeDelivery = null;
let clientCoords = null;
let isFollowingEntregador = true;
// mirror removed: admin will use the shared Map module to display deliverer

const deliveryCompletedSound = new Audio(
  "audio/NotificacaoPedidoEntregue.mp3"
);
let knownOrderStatuses = {};
let isFirstLoad = true;
let userInteracted = false;

window.addEventListener("load", () => {
  // ======= 1. Validação de Usuário =======
  const currentUser = JSON.parse(localStorage.getItem("currentUser"));
  if (!currentUser || currentUser.panel !== "admin.html") {
    window.location.href = "index.html";
    return;
  }

  // Inicia a aplicação
  initializeApp();

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

  // ======= 3. Inicialização =======
  async function initializeApp() {
    map = await Map.initializeMap("map", undefined, undefined, true); // Inicia em modo satélite

    // Adiciona listeners para os controles do mapa (satélite e 3D)
    const satBtn = document.getElementById("satellite-toggle");
    const toggle3dBtn = document.getElementById("toggle-3d");
    let satelliteOn = false;
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

    // Listeners específicos do mapa que não estão no ui.js
    // Moved here to ensure 'map' is initialized
    map.on("dragstart", () => {
      isFollowingEntregador = false;
      Map.setFollowMode(false);
      document
        .getElementById("follow-entregador-button")
        ?.classList.remove("active");
    });
    document
      .getElementById("follow-entregador-button")
      ?.addEventListener("click", handleToggleFollow);

    // Espera o carregamento dos componentes (modais) antes de configurar os listeners
    await loadComponents("#modal-container", [
      // Carrega o modal de impressão de todas as etiquetas especificamente para o admin
      "components/modal-print-all.html",
      "components/modal-print-preview.html",
    ]);

    // Agora que os modais existem, podemos configurar todos os listeners
    setupUIEventListeners();
    listenToFirebaseChanges();
  }

  // ======= 4. Event Listeners =======
  function setupUIEventListeners() {
    const newOrderModal = document.getElementById("novo-pedido-modal");
    const readMessageModal = document.getElementById("read-message-modal");

    // UI.setupEventListeners lida com todos os botões e formulários
    UI.setupEventListeners(
      // Callbacks de botões do Header e Ações
      () => {
        localStorage.removeItem("currentUser");
        window.location.href = "index.html";
      }, // onLogout
      () => newOrderModal.classList.add("active"), // onNewOrder
      printAllEmPreparoLabels, // onPrintAll
      () => readMessageModal.classList.add("active"), // onReadMessage
      handleClearDeliveredOrders, // onClearDelivered
      handleResetActiveDeliveries, // onResetActiveDeliveries
      handleClearAllOrders, // onClearAllOrders

      // Callbacks de Formulários
      handleNewOrderSubmit, // onNewOrderSubmit
      handleReadMessageSubmit, // onReadMessageSubmit
      handleCepInput // onCepInput
    );

    // Listeners específicos do mapa que não estão no ui.js
    map.on("dragstart", () => {
      isFollowingEntregador = false;
      Map.setFollowMode(false);
      document
        .getElementById("follow-entregador-button")
        ?.classList.remove("active");
    });
    document
      .getElementById("follow-entregador-button")
      ?.addEventListener("click", handleToggleFollow);
  }

  async function handleClearDeliveredOrders() {
    try {
      const clearedCount = await clearDeliveredOrders();
      if (clearedCount > 0) {
        UI.showToast(
          `${clearedCount} pedido(s) entregue(s) removido(s) com sucesso.`,
          "success"
        );
      } else {
        UI.showToast("Não há pedidos entregues para remover.", "info");
      }
    } catch (error) {
      console.error("Erro ao limpar pedidos entregues:", error);
      UI.showToast("Erro ao limpar os pedidos.", "error");
    }
  }

  async function handleResetActiveDeliveries() {
    const performReset = async () => {
      try {
        document
          .getElementById("generic-confirm-modal")
          .classList.remove("active"); // Corrigido para usar o ID do modal genérico

        const resetCount = await resetAllActiveDeliveries();
        if (resetCount > 0) {
          UI.showToast(
            `${resetCount} entrega(s) ativa(s) foram resetadas.`,
            "success"
          );
        } else {
          UI.showToast(
            "Nenhuma entrega ativa encontrada para resetar.",
            "info"
          );
        }
      } catch (error) {
        UI.showToast("Ocorreu um erro ao resetar as entregas.", "error");
      }
    };

    UI.showConfirmModal(
      "Tem certeza que deseja resetar todas as entregas em andamento? Esta ação não pode ser desfeita.",
      performReset,
      "Sim, Resetar",
      "btn-danger"
    );
  }

  async function handleClearAllOrders() {
    const performClear = async () => {
      try {
        document
          .getElementById("generic-confirm-modal")
          .classList.remove("active");

        const clearedCount = await clearAllOrders(); // Assume que esta função existe em firebase.js
        if (clearedCount > 0) {
          UI.showToast(
            `${clearedCount} pedido(s) foram removidos permanentemente.`,
            "success"
          );
        } else {
          UI.showToast("Não há pedidos para remover.", "info");
        }
      } catch (error) {
        console.error("Erro ao limpar todos os pedidos:", error);
        UI.showToast("Ocorreu um erro ao limpar todos os pedidos.", "error");
      }
    };

    UI.showConfirmModal(
      "ATENÇÃO: Tem certeza que deseja limpar TODOS os pedidos? Esta ação é IRREVERSÍVEL.",
      performClear,
      "Sim, Limpar TUDO",
      "btn-danger"
    );
  }

  // ======= 5. Lógica de Firebase e Mapa =======
  function showIdleEntregadorOnMap() {
    activeDelivery = null;
    clientCoords = null;
    Map.clearActiveRoute(); // Usa a nova função de limpeza segura

    // Garante que o marcador do entregador esteja visível e centralizado
    if (entregadorLocation) {
      Map.updateDeliveryMarkerOnMap(entregadorLocation);
      Map.panMapTo(entregadorLocation); // Centraliza o mapa no entregador
    }
    updateOverlayInfo(); // Limpa o overlay de informações
  }

  function listenToFirebaseChanges() {
    // Ouvir Pedidos
    listenToPedidos(async (pedidos) => {
      handlePedidosUpdate(pedidos);

      const activeOrderEntry = Object.entries(pedidos).find(
        ([, p]) => p.status === "em_entrega"
      );

      if (activeOrderEntry) {
        const [orderId, orderData] = activeOrderEntry;
        activeDelivery = { id: orderId, ...orderData };

        // Geocodifica o endereço do cliente se ainda não tivermos as coordenadas
        if (
          !clientCoords ||
          activeDelivery.id !== (activeDelivery.oldId || null)
        ) {
          const geocodeResult = await geocodeAddress(orderData.endereco);
          if (geocodeResult && !geocodeResult.error) {
            clientCoords = geocodeResult;
          }
        }
        activeDelivery.oldId = activeDelivery.id;

        Map.updateClientMarkerOnMap(clientCoords);
        if (orderData.entrega && orderData.entrega.geometria) {
          Map.drawMainRoute(orderData.entrega.geometria);
        } else if (entregadorLocation && clientCoords) {
          // Se não houver geometria armazenada, solicita rota ao OSRM e desenha
          await Map.requestRoute(entregadorLocation, clientCoords);
        }
        updateMapFocus();
        updateOverlayInfo();
      } else {
        showIdleEntregadorOnMap();
      }
    });

    // Ouvir Localização do Entregador
    listenToEntregadorLocation(async (location) => {
      entregadorLocation = location;
      Map.updateDeliveryMarkerOnMap(location);
      updateMapFocus();
      updateOverlayInfo();
    });
  }

  function handlePedidosUpdate(pedidos) {
    // Lógica para detectar novos pedidos e piscar o contador
    if (!isFirstLoad) {
      const newPendingOrders = Object.keys(pedidos).filter(
        (id) => !knownOrderStatuses[id] && pedidos[id].status === "pendente"
      );
      if (newPendingOrders.length > 0) {
        UI.blinkPendingCounter();
      }
    }
    if (!isFirstLoad) {
      for (const pedidoId in pedidos) {
        if (
          knownOrderStatuses[pedidoId] &&
          knownOrderStatuses[pedidoId] !== pedidos[pedidoId].status &&
          pedidos[pedidoId].status === "entregue"
        ) {
          tryPlaySound(deliveryCompletedSound);
        }
      }
    }
    knownOrderStatuses = Object.fromEntries(
      Object.entries(pedidos).map(([id, p]) => [id, p.status])
    );
    isFirstLoad = false;

    // A renderização pode ser pesada, então usamos um pequeno timeout
    // para garantir que a animação de loading apareça primeiro.
    setTimeout(() => {
      UI.renderBoard(pedidos, handleUpdateOrderStatus, UI.printLabel, handlePrintPdf);

      // Atualiza o badge do botão de impressão
      const pedidosEmPreparoCount = Object.values(pedidos).filter(
        (p) => p.status === "em_preparo"
      ).length;
      UI.updatePrintButtonBadge(pedidosEmPreparoCount);
    }, 50); // Um pequeno delay para garantir que o DOM atualize
  }

  function handlePrintPdf(pedido, pedidoId) {
    const orderData = { ...pedido, id: pedidoId };
    showPrintPreviewModal(orderData);
  }

  async function handleUpdateOrderStatus(pedidoId, newStatus) {
    try {
      await updateOrderStatus(pedidoId, newStatus);
      // Ao marcar entregue, limpa visualmente qualquer rota/cliente residual
      if (newStatus === "entregue") {
        try {
          if (Map.forceClearAllRoutes) Map.forceClearAllRoutes();
          else Map.clearMap();
          Map.updateClientMarkerOnMap(null);
          Map.setFollowMode(true);
          if (entregadorLocation)
            Map.updateDeliveryMarkerOnMap(entregadorLocation);
          updateOverlayInfo();
        } catch (e) {
          console.warn("Erro ao limpar mapa após entrega (admin):", e);
        }
      }
    } catch (e) {
      console.error("Falha ao atualizar status do pedido:", e);
      UI.showToast("Erro ao atualizar status do pedido.", "error");
    }
  }

  function updateMapFocus() {
    if (isFollowingEntregador && entregadorLocation) {
      Map.updateCameraForLocation(entregadorLocation);
    } else if (entregadorLocation && clientCoords) {
      Map.fitMapToBounds(entregadorLocation, clientCoords);
    } else if (entregadorLocation) {
      Map.panMapTo(entregadorLocation);
    }
  }

  function updateOverlayInfo() {
    if (!activeDelivery || !entregadorLocation) {
      UI.updateAdminMapInfo(null);
      return;
    }
    const entregaData = activeDelivery.entrega;
    if (entregaData) {
      const currentSpeed = entregaData.velocidade || 0;
      UI.updateAdminMapInfo(activeDelivery, entregaData, currentSpeed);
    }
  }

// Helper function to generate a single printable page for an order
function generatePrintPageForOrder(order, orderId) {
    return new Promise(resolve => {
        const trackingUrl = `https://scatambulo-entregas-iivh.vercel.app/rastreio.html?id=${orderId.toLowerCase()}`;
        let qrImgTag = '<p>Erro ao gerar QR Code</p>';

        try {
            const qr = qrcode(0, 'M');
            qr.addData(trackingUrl);
            qr.make();
            qrImgTag = qr.createImgTag(5, 4); 
        } catch (e) {
            console.error(`Erro ao gerar QR Code para o pedido ${orderId}:`, e);
        }

        const content = `
            <div style="font-family: Arial, sans-serif; padding: 20px; font-size: 16px; width: 210mm; height: 297mm; box-sizing: border-box; page-break-after: always;">
                <h2>Angela Confeitaria v2</h2>
                <p><strong>NUMERO DO PEDIDO:</strong> ${orderId}</p>
                <p><strong>CLIENTE:</strong> ${order.nomeCliente || ''}</p>
                <p><strong>ENDERECO:</strong> ${order.rua || ''}, ${order.numero || ''}, ${order.bairro || ''} - ${order.cidade || ''} - CEP: ${order.cep || ''}</p>
                <p><strong>COMPLEMENTO:</strong> ${order.complemento || ''}</p>
                <p><strong>SABOR:</strong> ${order.nomeBolo || ''}</p>
                <p><strong>STATUS:</strong> ${(order.status || '').toUpperCase()}</p>
                <p>Obrigado pela preferência!</p>
                <div style="margin-top: 15px;">
                    <strong>QRCODE DE RASTREIO:</strong>
                    <div style="margin-top: 5px;">${qrImgTag}</div>
                </div>
                <p style="margin-top: 20px; font-size: 13px;">
                    ${new Date().toLocaleString("pt-BR")}
                </p>
            </div>
        `;
        resolve(content);
    });
}


  async function printAllEmPreparoLabels() {
    // 1. Close mobile menu if open
    const mobileNav = document.querySelector(".mobile-nav");
    const hamburgerMenu = document.querySelector(".hamburger-menu");
    if (mobileNav && mobileNav.classList.contains("open")) {
      mobileNav.classList.remove("open");
    }
    if (hamburgerMenu && hamburgerMenu.classList.contains("open")) {
      hamburgerMenu.classList.remove("open");
    }
    
    // 2. Get Modal Elements
    const modal = document.getElementById("print-all-labels-modal");
    const messageEl = document.getElementById("print-all-message");
    const confirmBtn = document.getElementById("print-all-confirm-btn");
    const cancelBtn = document.getElementById("print-all-cancel-btn");
    const closeButton = modal.querySelector(".close-button");

    if (!modal || !messageEl || !confirmBtn || !cancelBtn || !closeButton) {
        UI.showToast("Erro ao encontrar elementos do modal de impressão.", "error");
        return;
    }

    // 3. Setup Modal Controls
    const openModal = () => modal.classList.add("active");
    const closeModal = () => modal.classList.remove("active");

    cancelBtn.onclick = closeModal;
    closeButton.onclick = closeModal;
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    confirmBtn.disabled = true;

    try {
        // 4. Fetch and Filter Data
        const snapshot = await get(ref(db, "pedidos"));
        const pedidos = snapshot.val() || {};
        const pedidosEmPreparo = Object.entries(pedidos)
            .filter(([, p]) => p.status && p.status.trim().toLowerCase() === "em_preparo")
            .sort(([, a], [, b]) => (a.timestamp || 0) - (b.timestamp || 0));

        // 5. Update Modal UI based on data
        if (pedidosEmPreparo.length === 0) {
            messageEl.textContent = 'Não há pedidos "Em Preparo" para imprimir.';
        } else {
            messageEl.textContent = `${pedidosEmPreparo.length} pedido(s) "Em Preparo" encontrado(s). Pronto para imprimir?`;
            confirmBtn.disabled = false;
        }

        openModal();

        // 6. Set up Print Confirmation Action
        confirmBtn.onclick = async () => {
            const originalBtnHTML = confirmBtn.innerHTML;
            confirmBtn.innerHTML = `<i class="ph ph-spinner ph-spin"></i> Gerando...`;
            confirmBtn.disabled = true;

            try {
                // Ensure QR code library is loaded
                await new Promise(resolve => UI.loadQrCodeLibrary(resolve));

                let allPagesHtml = '';
                for (const [id, pedido] of pedidosEmPreparo) {
                    const pageHtml = await generatePrintPageForOrder(pedido, id);
                    allPagesHtml += pageHtml;
                }
                
                const finalHtml = `
                    <html>
                        <head>
                            <title>Etiquetas de Pedidos</title>
                            <style>
                                @media print {
                                    body { margin: 0; }
                                    .print-page { 
                                        page-break-after: always; 
                                        width: 210mm;
                                        height: 297mm;
                                    }
                                }
                            </style>
                        </head>
                        <body>
                            ${allPagesHtml}
                        </body>
                    </html>
                `;

                printViaIframe(finalHtml);

            } catch (printError) {
                console.error("Erro ao gerar documento para impressão:", printError);
                UI.showToast("Falha ao gerar documento para impressão.", "error");
            } finally {
                // Restore button and close modal
                confirmBtn.innerHTML = originalBtnHTML;
                confirmBtn.disabled = false;
                closeModal();
            }
        };

    } catch (error) {
        console.error("Erro ao preparar etiquetas para impressão:", error);
        UI.showToast("Erro ao buscar pedidos para impressão.", "error");
        closeModal();
    }
  }
});
