import {
  listenToPedidos,
  listenToEntregadorLocation,
  createNewOrder,
  updateOrderStatus,
} from "./firebase.js";
import { geocodeAddress, calculateSpeed } from "./utils.js";
import { loadComponents } from "./componentLoader.js";
import * as Map from "./map.js";
import * as UI from "./ui-confeiteira.js";

document.addEventListener("DOMContentLoaded", () => {
  let entregadorLocation = null;
  const currentUser = JSON.parse(localStorage.getItem("currentUser"));
  if (!currentUser || currentUser.panel !== "confeiteira.html") {
    window.location.href = "index.html";
    return;
  }

  // Define as colunas que este painel pode ver
  const visibleStatuses = [
    { id: "pendente", title: "Pendente" },
    { id: "em_preparo", title: "Em Preparo" },
    { id: "feito", title: "Feito" },
  ];

  let activeDeliveryOrder = null;
  const newOrderSound = new Audio("audio/NotificacaoPedidoNovo.mp3");
  const deliveryCompleteSound = new Audio(
    "audio/NotificacaoPedidoEntregue.mp3"
  );
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

      const activeOrderEntry = Object.entries(pedidos).find(
        ([, pedido]) => pedido.status === "em_entrega"
      );
      if (activeOrderEntry) {
        activeDeliveryOrder = {
          id: activeOrderEntry[0],
          ...activeOrderEntry[1],
        };
        updateMapForActiveDelivery();
      } else {
        updateMapFocus(); // Adicionado para focar no entregador se não houver entrega
        activeDeliveryOrder = null;
        UI.clearConfeiteiraMapInfo();
        Map.clearRouteFromMap();
      }
    });

    listenToEntregadorLocation((location) => {
      entregadorLocation = location;
      Map.updateDeliveryMarkerOnMap(location);
      if (location) {
        UI.updateDeliveryPersonStatus(
          `Entregador localizado em: ${location.latitude.toFixed(
            4
          )}, ${location.longitude.toFixed(4)}`
        );
      } else {
        UI.updateDeliveryPersonStatus(
          "Aguardando localização do entregador..."
        );
      }
      updateMapForActiveDelivery();
      updateMapFocus(); // Adicionado para focar o mapa a cada atualização de local
    });
  }

  async function updateMapForActiveDelivery() {
    if (!activeDeliveryOrder || !entregadorLocation) {
      UI.clearConfeiteiraMapInfo();
      return;
    }

    const clientCoords = await geocodeAddress(activeDeliveryOrder.endereco);
    if (clientCoords && !clientCoords.error) {
      activeDeliveryOrder.clientCoords = clientCoords; // Salva as coordenadas no objeto do pedido
      Map.updateClientMarkerOnMap(clientCoords);
      const entregaData = activeDeliveryOrder.entrega;

      if (entregaData) {
        const currentSpeed = calculateSpeed(
          entregadorLocation,
          entregaData.lastEntregadorCoords
        );
        UI.updateConfeiteiraMapInfo(
          activeDeliveryOrder,
          entregaData,
          currentSpeed
        );
        if (entregaData.geometria) Map.drawRouteOnMap(entregaData.geometria);
      }
    } else {
      console.error("Failed to geocode client address:", clientCoords ? clientCoords.error : "Unknown error");
      UI.clearConfeiteiraMapInfo();
      Map.clearRouteFromMap();
      Map.updateClientMarkerOnMap(null);
    }
  }

  function updateMapFocus() {
    if (activeDeliveryOrder && activeDeliveryOrder.clientCoords) {
      Map.fitMapToBounds(entregadorLocation, activeDeliveryOrder.clientCoords);
    } else if (entregadorLocation) {
      // Se não há entrega ativa, apenas centraliza no entregador
      Map.fitMapToBounds(entregadorLocation, null);
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
