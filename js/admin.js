import {
  listenToPedidos,
  listenToEntregadorLocation,
  createNewOrder,
  updateOrderStatus,
  clearDeliveredOrders,
  getPedido,
  updatePedido,
} from "./firebase.js";
import { geocodeAddress, getRouteDetails, calculateSpeed, parseWhatsappMessage } from "./utils.js";
import { loadComponents } from "./componentLoader.js";
import * as Map from "./map.js";
import * as UI from "./ui.js";

document.addEventListener("DOMContentLoaded", () => {
  const currentUser = JSON.parse(localStorage.getItem("currentUser"));
  if (!currentUser || currentUser.panel !== "admin.html") {
    window.location.href = "index.html";
    return;
  }

  let entregadorLocation = null;
  let activeDeliveryOrder = null;
  let activeDeliveryClientCoords = null;
  let closestOrder = null;
  const deliveryCompletedSound = new Audio("audio/NotificacaoPedidoEntregue.mp3");
  let knownOrderStatuses = {};
  let isFirstLoad = true;

  loadComponents(
    "#modal-container",
    ["components/modal-new-order.html", "components/modal-read-message.html"],
    () => {
      Map.initMap("map");
      setupUIEventListeners();
      listenToFirebaseChanges();
    }
  );

  function setupUIEventListeners() {
    UI.setupEventListeners(
      () => {
        localStorage.removeItem("currentUser");
        window.location.href = "index.html";
      },
      () => {}, // onNewOrder (handled by modal)
      printAllEmPreparoLabels,
      () => {}, // onReadMessage (handled by modal)
      clearDeliveredOrders,
      handleNewOrderSubmit,
      handleReadMessageSubmit,
      handleCepBlur
    );
  }

  function listenToFirebaseChanges() {
    listenToPedidos((pedidos) => {
      if (!isFirstLoad) {
        for (const pedidoId in pedidos) {
          const oldStatus = knownOrderStatuses[pedidoId];
          const newStatus = pedidos[pedidoId].status;
          if (oldStatus && (newStatus === "entregue" || newStatus === "em_preparo") && oldStatus !== newStatus) {
            deliveryCompletedSound.play().catch(console.warn);
          }
        }
      }
      knownOrderStatuses = Object.fromEntries(
        Object.entries(pedidos).map(([id, pedido]) => [id, pedido.status])
      );
      isFirstLoad = false;
      UI.renderBoard(pedidos, updateOrderStatus, UI.printLabel);
      findActiveAndClosestOrders(pedidos);
    });

    listenToEntregadorLocation((location) => {
      entregadorLocation = location;
      Map.updateDeliveryMarkerOnMap(entregadorLocation);
      updateMapFocus();
    });
  }

  async function findActiveAndClosestOrders(pedidos) {
    activeDeliveryOrder = null;
    activeDeliveryClientCoords = null;

    const activeOrderEntry = Object.entries(pedidos).find(
      ([, pedido]) => pedido.status === "em_entrega"
    );

    if (activeOrderEntry) {
      activeDeliveryOrder = { id: activeOrderEntry[0], ...activeOrderEntry[1] };
      activeDeliveryClientCoords = await geocodeAddress(activeDeliveryOrder.endereco);
      updateMapForActiveDelivery();
    } else {
      // If no active delivery, ensure client marker and route are cleared
      Map.updateClientMarkerOnMap(null);
      Map.clearRouteFromMap();
    }
    updateMapFocus();
  }

  async function findAndHighlightClosest(pedidos) {
    if (!entregadorLocation) return;

    const readyOrders = Object.entries(pedidos).filter(
      ([, pedido]) => pedido.status === "pronto_para_entrega"
    );

    let minDistance = Infinity;
    closestOrder = null;

    for (const [pedidoId, pedido] of readyOrders) {
      const pedidoCoords = await geocodeAddress(pedido.endereco);
      if (pedidoCoords) {
        const dist = calculateDistance(
          entregadorLocation.latitude,
          entregadorLocation.longitude,
          pedidoCoords.lat,
          pedidoCoords.lon
        );
        if (dist < minDistance) {
          minDistance = dist;
          closestOrder = {
            id: pedidoId,
            distance: dist,
            clientName: pedido.nomeCliente,
            coords: pedidoCoords,
          };
        }
      }
    }
    UI.highlightClosestOrder(closestOrder);
  }

  function updateMapFocus() {
    if (activeDeliveryOrder && activeDeliveryClientCoords) {
      Map.fitMapToBounds(entregadorLocation, activeDeliveryClientCoords);
      Map.updateClientMarkerOnMap(activeDeliveryClientCoords);
    } else if (entregadorLocation) {
        Map.fitMapToBounds(entregadorLocation, null);
        Map.updateClientMarkerOnMap(null);
    }
  }

  async function updateMapForActiveDelivery() {
    if (
      !activeDeliveryOrder ||
      !activeDeliveryClientCoords ||
      !entregadorLocation
    )
      return;

    // Pega os detalhes da entrega (incluindo a rota) que o entregador salvou no Firebase.
    const fullActiveDeliveryOrder = await getPedido(activeDeliveryOrder.id);
    const entregaData = fullActiveDeliveryOrder.entrega;

    if (entregaData) {
      const currentSpeed = calculateSpeed(
        entregadorLocation,
        entregaData.lastEntregadorCoords
      );

      // Atualiza apenas a velocidade no Firebase, pois a rota já foi salva pelo entregador.
      await updatePedido(activeDeliveryOrder.id, {
        "entrega/velocidade": parseFloat(currentSpeed),
      });

      // Usa os dados da entrega para atualizar a UI e desenhar a rota.
      UI.updateAdminMapInfo(activeDeliveryOrder, entregaData, currentSpeed);
      Map.drawRouteOnMap(entregaData.geometria);
    } else {
      UI.updateAdminMapInfo(null);
      Map.clearRouteFromMap();
    }
  }

  function handleNewOrderSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const nomeBolo = form.querySelector("#cakeName").value;
    const nomeCliente = form.querySelector("#clientName").value;
    const clientEmail = form.querySelector("#clientEmail").value; // Get client email
    const cep = form.querySelector("#cep").value;
    const rua = form.querySelector("#rua").value;
    const bairro = form.querySelector("#bairro").value;
    const numero = form.querySelector("#numero").value;
    const complemento = form.querySelector("#complemento").value;
    const whatsapp = form.querySelector("#whatsapp").value;
    const endereco = `${rua}, ${numero}, ${bairro}, CEP: ${cep}`;

    createNewOrder({
      nomeCliente,
      clientEmail, // Pass client email
      endereco,
      nomeBolo,
      cep,
      rua,
      bairro,
      numero,
      complemento,
      whatsapp,
    });
    form.reset();
    document.getElementById("new-order-modal").style.display = "none";
  }

  function handleReadMessageSubmit(e) {
    e.preventDefault();
    const messageText = document.getElementById("message-text").value;
    const parsedData = parseWhatsappMessage(messageText);
    
    const orderData = {
        clientName: parsedData.cliente.nome,
        cakeName: parsedData.itens.length > 0 ? parsedData.itens[0].nome : "",
        whatsapp: parsedData.cliente.telefone,
        rua: parsedData.cliente.enderecoRaw,
    };

    UI.fillOrderForm(orderData);
    
    document.getElementById("read-message-modal").style.display = "none";
    document.getElementById("new-order-modal").style.display = "block";
  }

  async function handleCepBlur(e) {
    const cep = e.target.value.replace(/\D/g, "");
    if (cep.length === 8) {
      try {
        const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await response.json();
        if (!data.erro) {
          document.getElementById("rua").value = data.logradouro;
          document.getElementById("bairro").value = data.bairro;
        }
      } catch (error) {
        console.error("Erro ao buscar CEP:", error);
      }
    }
  }

  async function printAllEmPreparoLabels() {
    listenToPedidos((pedidos) => {
        let printedCount = 0;
        for (const pedidoId in pedidos) {
            if (pedidos[pedidoId].status === "em_preparo") {
                UI.printLabel(pedidos[pedidoId], pedidoId);
                printedCount++;
            }
        }
        if (printedCount === 0) {
            alert("Não há pedidos em preparo para imprimir etiquetas.");
        }
    });
  }
});