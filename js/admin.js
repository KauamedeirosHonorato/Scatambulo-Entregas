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
import { parseWhatsappMessage, geocodeAddress } from "./utils.js";
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
      "components/modal-print-all-em-preparo.html",
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
    const orderData = {
      id: pedidoId,
      customerName: pedido.nomeCliente,
      address: pedido.endereco,
      item: pedido.nomeBolo,
      status: pedido.status,
    };
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

  async function printAllEmPreparoLabels() {
    try {
      const snapshot = await get(ref(db, "pedidos"));
      const pedidos = snapshot.val() || {};
      const pedidosEmPreparo = Object.entries(pedidos).filter(
        ([, p]) => p.status === "em_preparo"
      );

      if (pedidosEmPreparo.length === 0) {
        UI.showToast("Não há pedidos em preparo para imprimir.", "info");
        return;
      }

      const printModal = document.getElementById("print-all-labels-modal");
      const labelsContainer = document.getElementById("print-labels-container");
      const printConfirmBtn = document.getElementById("print-all-confirm-btn");

      if (!printModal || !labelsContainer || !printConfirmBtn) {
        console.error("Modal de impressão não encontrado no DOM.");
        UI.showToast("Erro ao abrir modal de impressão.", "error");
        return;
      }

      // Gera o HTML para cada etiqueta de forma assíncrona (com QR Codes)
      const labelPromises = pedidosEmPreparo.map(([id, pedido]) =>
        UI.createLabelHTML(pedido, id)
      );
      const labelHtmls = await Promise.all(labelPromises);
      labelsContainer.innerHTML = labelHtmls.join("");

      // Adiciona a classe 'print-container' ao corpo do modal para a impressão
      const modalBody = labelsContainer; // O container das etiquetas é o que queremos imprimir

      const handlePrint = () => {
        document.body.classList.add("printing-active");
        window.print();
        document.body.classList.remove("printing-active");
      };

      printConfirmBtn.onclick = handlePrint; // Usamos .onclick para substituir qualquer listener anterior

      printModal.classList.add("active");
      // A função showPrintButtonSuccess() não foi encontrada no contexto,
      // mas se existir, pode ser chamada aqui.
      // Ex: UI.showPrintButtonSuccess();
    } catch (error) {
      console.error("Erro ao preparar etiquetas para impressão:", error);
      UI.showToast("Erro ao gerar etiquetas.", "error");
    }
  }
});
