import {
  listenToPedidos,
  listenToEntregadorLocation,
  createNewOrder,
  updateOrderStatus,
} from "./firebase.js";
import { geocodeAddress } from "./utils.js";
import { loadComponents } from "./componentLoader.js";
import * as Map from "./map.js";
import * as UI from "./ui-confeiteira.js";

document.addEventListener("DOMContentLoaded", () => {
  const currentUser = JSON.parse(localStorage.getItem("currentUser"));
  if (!currentUser || currentUser.panel !== "confeiteira.html") {
    window.location.href = "index.html";
    return;
  }

  let activeDeliveryOrder = null;
  const newOrderSound = new Audio("https://cdn.freesound.org/previews/219/219244_401265-lq.mp3");
  const deliveryCompleteSound = new Audio("audio/NotificacaoPedidoEntregue.mp3");
  let knownOrderIds = new Set();
  let knownDeliveredOrderIds = new Set();
  let isFirstLoad = true;

  loadComponents(
    "#modal-container",
    ["components/modal-new-order.html", "components/modal-read-message.html"],
    () => {
      Map.initMap("map");
      UI.setupEventListeners(
        () => {
          localStorage.removeItem("currentUser");
          window.location.href = "index.html";
        },
        handleNewOrderSubmit,
        handleReadMessageSubmit,
        handleCepBlur
      );
      listenToFirebaseChanges();
    }
  );

  function listenToFirebaseChanges() {
    listenToPedidos((pedidos) => {
      const currentPendingOrderIds = new Set();
      const currentDeliveredOrderIds = new Set();

      for (const pedidoId in pedidos) {
        if (pedidos[pedidoId].status === "pendente") {
          currentPendingOrderIds.add(pedidoId);
          if (!isFirstLoad && !knownOrderIds.has(pedidoId)) {
            newOrderSound.play().catch(console.warn);
          }
        }
        if (pedidos[pedidoId].status === "entregue") {
          currentDeliveredOrderIds.add(pedidoId);
          if (!isFirstLoad && !knownDeliveredOrderIds.has(pedidoId)) {
            deliveryCompleteSound.play().catch(console.warn);
          }
        }
      }

      knownOrderIds = currentPendingOrderIds;
      knownDeliveredOrderIds = currentDeliveredOrderIds;
      isFirstLoad = false;

      UI.renderBoard(pedidos, updateOrderStatus, UI.printLabel);
      
      const activeOrderEntry = Object.entries(pedidos).find(([, pedido]) => pedido.status === "em_entrega");
      if (activeOrderEntry) {
        activeDeliveryOrder = { id: activeOrderEntry[0], ...activeOrderEntry[1] };
        updateMapForActiveDelivery();
      } else {
        activeDeliveryOrder = null;
        UI.clearConfeiteiraMapInfo();
        Map.clearRouteFromMap();
      }
    });

    listenToEntregadorLocation((location) => {
        Map.updateDeliveryMarkerOnMap(location);
        if(location){
            UI.updateDeliveryPersonStatus(`Entregador localizado em: ${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`);
        } else {
            UI.updateDeliveryPersonStatus("Aguardando localização do entregador...");
        }
    });
  }

  async function updateMapForActiveDelivery() {
    if (!activeDeliveryOrder) return;
    
    const clientCoords = await geocodeAddress(activeDeliveryOrder.endereco);
    if(clientCoords){
        Map.updateClientMarkerOnMap(clientCoords);
        UI.updateConfeiteiraMapInfo(activeDeliveryOrder);
        if(activeDeliveryOrder.entrega?.geometria){
            Map.drawRouteOnMap(activeDeliveryOrder.entrega.geometria);
        }
    }
  }

  function handleNewOrderSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const nomeBolo = form.querySelector("#cakeName").value;
    const nomeCliente = form.querySelector("#clientName").value;
    const cep = form.querySelector("#cep").value;
    const rua = form.querySelector("#rua").value;
    const bairro = form.querySelector("#bairro").value;
    const numero = form.querySelector("#numero").value;
    const complemento = form.querySelector("#complemento").value;
    const whatsapp = form.querySelector("#whatsapp").value;
    const endereco = `${rua}, ${numero}, ${bairro}, CEP: ${cep}`;

    createNewOrder({
      nomeCliente,
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
});
