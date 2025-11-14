import { db, ref, onValue, push, update, get, child, set } from './firebase.js';

document.addEventListener('DOMContentLoaded', () => {
    // Proteção de rota
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    if (!currentUser || !currentUser.username || currentUser.panel !== 'admin.html') {
        window.location.href = 'index.html';
        return;
    }

    // --- Seleção dos Elementos do DOM ---
    const logoutButton = document.getElementById('logout-button');
    const kanbanBoard = document.getElementById('kanban-board');
    const newOrderModal = document.getElementById('new-order-modal');
    const readMessageModal = document.getElementById('read-message-modal');
    const newOrderBtn = document.getElementById('new-order-button');
    const readMessageBtn = document.getElementById('read-message-button');
    const clearDeliveredBtn = document.getElementById("clear-delivered-button");
    const closeButtons = document.querySelectorAll(".close-button");
    const readMessageForm = document.getElementById("read-message-form");
    const messageText = document.getElementById("message-text");
    const newOrderForm = document.getElementById("new-order-form");
    const fields = {
      cakeName: document.getElementById("cakeName"),
      clientName: document.getElementById("clientName"),
      cep: document.getElementById("cep"),
      rua: document.getElementById("rua"),
      bairro: document.getElementById("bairro"),
      numero: document.getElementById("numero"),
      complemento: document.getElementById("complemento"),
      whatsapp: document.getElementById("whatsapp"),
    };

    // Variáveis do Mapa e Localização
    let map;
    let deliveryMarker;
    let entregadorLocation = null;
    let closestOrderCoords = null;
    let closestOrder = null;

    // --- INICIALIZAÇÃO ---
    initMap();
    setupEventListeners();
    listenToFirebase();

    /**
     * Configura os ouvintes de eventos para botões e formulários.
     */
    function setupEventListeners() {
      logoutButton.addEventListener("click", () => {
        localStorage.removeItem("currentUser");
        window.location.href = "index.html";
      });

      // --- Lógica para Abrir e Fechar Modais ---
      newOrderBtn.addEventListener("click", () => {
        newOrderModal.style.display = "block";
      });
      readMessageBtn.addEventListener("click", () => {
        readMessageModal.style.display = "block";
      });
      clearDeliveredBtn.addEventListener("click", () => {
        clearDeliveredOrders();
      });

      closeButtons.forEach((button) => {
        button.addEventListener("click", () => {
          newOrderModal.style.display = "none";
          readMessageModal.style.display = "none";
        });
      });

      window.addEventListener("click", (event) => {
        if (event.target === newOrderModal)
          newOrderModal.style.display = "none";
        if (event.target === readMessageModal)
          readMessageModal.style.display = "none";
      });

      const cepInput = document.getElementById("cep");
      cepInput.addEventListener("blur", async () => {
        const cep = cepInput.value.replace(/\D/g, "");
        if (cep.length === 8) {
          try {
            const response = await fetch(
              `https://viacep.com.br/ws/${cep}/json/`
            );
            const data = await response.json();
            if (!data.erro) {
              document.getElementById("rua").value = data.logradouro;
              document.getElementById("bairro").value = data.bairro;
            }
          } catch (error) {
            console.error("Erro ao buscar CEP:", error);
          }
        }
      });

      newOrderForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const nomeBolo = fields.cakeName.value;
        const nomeCliente = fields.clientName.value;
        const cep = fields.cep.value;
        const rua = fields.rua.value;
        const bairro = fields.bairro.value;
        const numero = fields.numero.value;
        const complemento = fields.complemento.value;
        const whatsapp = fields.whatsapp.value;
        const endereco = `${rua}, ${numero}, ${bairro}, CEP: ${cep}`;

        createNewOrder(
          nomeCliente,
          endereco,
          nomeBolo,
          cep,
          rua,
          bairro,
          numero,
          complemento,
          whatsapp
        );
        newOrderForm.reset();
        newOrderModal.style.display = "none";
      });

      readMessageForm.addEventListener("submit", (event) => {
        event.preventDefault();
        extractDataFromMessage();
      });

      // Opcional: Limpar formulário de novo pedido ao fechar o modal
      const newOrderModalCloseBtn =
        newOrderModal.querySelector(".close-button");
      newOrderModalCloseBtn.addEventListener("click", () => {
        newOrderForm.reset();
      });
    }

    /**
     * Inicializa o mapa Leaflet.
     */
    function initMap() {
      map = L.map("map").setView([-23.5505, -46.6333], 12);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);
    }

    /**
     * Configura os listeners do Firebase para pedidos e localização.
     */
    function listenToFirebase() {
      const pedidosRef = ref(db, "pedidos/");
      onValue(pedidosRef, (snapshot) => {
        const pedidos = snapshot.val();
        renderBoard(pedidos || {});
      });

      const locationRef = ref(db, "localizacao/entregador");
      onValue(locationRef, (snapshot) => {
        entregadorLocation = snapshot.val();
        updateDeliveryMarker();
      });
    }

    /**
     * Cria um novo pedido no Firebase.
     */
    function createNewOrder(
      nomeCliente,
      endereco,
      nomeBolo,
      cep,
      rua,
      bairro,
      numero,
      complemento,
      whatsapp
    ) {
      const newPedidoRef = push(ref(db, "pedidos"));
      const updates = {};
      updates[newPedidoRef.key] = {
        nomeCliente,
        endereco,
        nomeBolo,
        cep,
        rua,
        bairro,
        numero,
        complemento,
        whatsapp,
        status: "pendente", // Status inicial
      };
      update(ref(db, "pedidos"), updates).catch((err) =>
        console.error("Erro ao criar pedido:", err)
      );
    }

    /**
     * Renderiza o quadro Kanban com todos os pedidos.
     */
    function renderBoard(pedidos) {
      kanbanBoard.innerHTML = "";
      const statuses = [
        { id: "pendente", title: "Pendente" },
        { id: "em_preparo", title: "Em Preparo" },
        { id: "feito", title: "Feito" },
        { id: "pronto_para_entrega", title: "Pronto para Entrega" },
        { id: "entregue", title: "Entregue" },
      ];

      statuses.forEach((statusInfo) => {
        const column = document.createElement("div");
        column.className = "kanban-column";
        column.dataset.status = statusInfo.id;
        column.innerHTML = `<h3>${statusInfo.title}</h3>`;
        kanbanBoard.appendChild(column);
      });

      Object.entries(pedidos).forEach(([pedidoId, pedido]) => {
        const column = kanbanBoard.querySelector(
          `.kanban-column[data-status="${pedido.status}"]`
        );
        if (column) {
          const card = createOrderCard(pedidoId, pedido);
          column.appendChild(card);
        }
      });

      findAndHighlightClosest();
    }

    /**
     * Cria um card de pedido para o quadro.
     */
    function createOrderCard(pedidoId, pedido) {
      const card = document.createElement("div");
      card.className = "order-card";
      card.id = `pedido-${pedidoId}`;
      card.innerHTML = `<h4>${pedido.nomeBolo || "Bolo"}</h4><p>${
        pedido.nomeCliente
      }</p><p>${pedido.endereco}</p><div class="distance"></div>`;

      const actions = document.createElement("div");
      actions.className = "order-actions";

      if (pedido.status === "pendente") {
        const btnPreparo = document.createElement("button");
        btnPreparo.textContent = "Iniciar Preparo";
        btnPreparo.className = "btn-secondary";
        btnPreparo.onclick = () => updateStatus(pedidoId, "em_preparo");
        actions.appendChild(btnPreparo);
      } else if (pedido.status === "em_preparo") {
        const btnFeito = document.createElement("button");
        btnFeito.textContent = "Marcar como Feito";
        btnFeito.className = "btn-secondary";
        btnFeito.onclick = () => updateStatus(pedidoId, "feito");
        actions.appendChild(btnFeito);
      }

      if (pedido.status === "feito") {
        const btnPronto = document.createElement("button");
        btnPronto.textContent = "Pronto para Entrega";
        btnPronto.className = "btn-primary";
        btnPronto.onclick = () => updateStatus(pedidoId, "pronto_para_entrega");
        actions.appendChild(btnPronto);
      }

      if (pedido.status === "pronto_para_entrega") {
        const btnEntregue = document.createElement("button");
        btnEntregue.textContent = "Marcar como Entregue";
        btnEntregue.className = "btn-sucesso";
        btnEntregue.onclick = () => updateStatus(pedidoId, "entregue");
        actions.appendChild(btnEntregue);
      }

      card.appendChild(actions);
      return card;
    }

    /**
     * Atualiza o status de um pedido no Firebase.
     */
    function updateStatus(pedidoId, newStatus) {
      const updates = {};
      updates[`/pedidos/${pedidoId}/status`] = newStatus;
      update(ref(db), updates).catch((err) =>
        console.error("Erro ao atualizar status:", err)
      );
    }

    let clientMarker; 

    /**
     * Atualiza a posição do marcador do entregador no mapa.
     */
    function updateDeliveryMarker() {
      if (entregadorLocation && map) {
        const { latitude, longitude } = entregadorLocation;
        const latLng = [latitude, longitude];

        // Atualiza ou cria o marcador do entregador
        if (deliveryMarker) {
          deliveryMarker.setLatLng(latLng);
        } else {
          deliveryMarker = L.marker(latLng, {
            icon: L.icon({
              iconUrl: "./CarroIcone/Versa2025.png",
              iconSize: [70, 70],
              iconAnchor: [35, 55],
            }),
          }).addTo(map);
        }

        // Limpa o marcador do cliente anterior
        if (clientMarker) {
          map.removeLayer(clientMarker);
          clientMarker = null;
        }

        // Se houver um pedido mais próximo, adiciona um marcador para ele
        if (closestOrderCoords) {
          const clientLatLng = [closestOrderCoords.lat, closestOrderCoords.lon];
          clientMarker = L.marker(clientLatLng, {
            icon: L.icon({
              iconUrl: "./CarroIcone/cliente.png",
              iconSize: [50, 50],
              iconAnchor: [25, 50],
            }),
          }).addTo(map);

          // Ajusta o mapa para mostrar ambos os marcadores
          const bounds = L.latLngBounds([latLng, clientLatLng]);
          map.fitBounds(bounds.pad(0.1)); // .pad(0.1) adiciona um pouco de preenchimento
        } else {
          // Se não houver pedido próximo, apenas centraliza no entregador
          map.setView(latLng, 15);
        }
      }
    }

    /**
     * Calcula a distância entre duas coordenadas usando a fórmula de Haversine.
     */
    function calcularDistancia(lat1, lon1, lat2, lon2) {
      const R = 6371; // Raio da Terra em km
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLon = ((lon2 - lon1) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
          Math.cos((lat2 * Math.PI) / 180) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c; // Retorna em km
    }

    /**
     * Converte um endereço em coordenadas usando a API Nominatim.
     */
    async function geocodeAddress(address) {
      const addressForQuery = address.split(", CEP:")[0]; // Remove a parte do CEP para melhorar a busca
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
            addressForQuery
          )}`
        );
        const data = await response.json();
        if (data && data.length > 0) {
          return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
        }
      } catch (error) {
        console.error("Erro de geocodificação:", error);
      }
      return null;
    }

    /**
     * Encontra o pedido "Pronto para Entrega" mais próximo e o destaca.
     */
    async function findAndHighlightClosest() {
      if (!entregadorLocation) return;

      const readyOrdersColumn = kanbanBoard.querySelector(
        '.kanban-column[data-status="pronto_para_entrega"]'
      );
      if (!readyOrdersColumn) return;

      const orderCards = readyOrdersColumn.querySelectorAll(".order-card");
      const columnTitle = readyOrdersColumn.querySelector("h3");
      closestOrder = null; // Reset before recalculating
      let minDistance = Infinity;

      // Usando for...of para permitir await dentro do loop
      for (const card of orderCards) {
        card.classList.remove("closest-delivery"); // Limpa destaque anterior
        const pedidoId = card.id.replace("pedido-", "");
        const pedidoSnapshot = await get(child(ref(db), `pedidos/${pedidoId}`));

        if (pedidoSnapshot.exists()) {
          const pedido = pedidoSnapshot.val();
          const pedidoCoords = await geocodeAddress(pedido.endereco);

          const distanceSpan = card.querySelector(".distance");
          if (pedidoCoords) {
            const dist = calcularDistancia(
              entregadorLocation.latitude,
              entregadorLocation.longitude,
              pedidoCoords.lat,
              pedidoCoords.lon
            );
            distanceSpan.textContent = `${dist.toFixed(1)} km`;
            if (dist < minDistance) {
              minDistance = dist;
              closestOrder = {
                id: pedidoId,
                distance: dist,
                clientName: pedido.nomeCliente,
                coords: pedidoCoords,
              };
            }
          } else {
            distanceSpan.textContent = "Endereço inválido";
          }
        }
      }

      if (closestOrder) {
        const closestCard = document.getElementById(
          `pedido-${closestOrder.id}`
        );
        if (closestCard) {
          closestCard.classList.add("closest-delivery");
          columnTitle.textContent = `Próximo: ${
            closestOrder.clientName
          } (${closestOrder.distance.toFixed(1)} km)`;
        }
        closestOrderCoords = closestOrder.coords;
      } else {
        columnTitle.textContent = "Pronto para Entrega"; // Reseta o título se não houver pedidos
        closestOrderCoords = null;
      }
    }

    /**
     * Extrai dados da mensagem e preenche o formulário de novo pedido.
     */
    function extractDataFromMessage() {
      const text = messageText.value.replace(/\*/g, ""); // Remove asteriscos para facilitar a extração

      // Padrões de Regex para o novo formato de mensagem
      const patterns = {
        cakeName: /-- ITENS DO PEDIDO ---\s*-\s*(.*?)\s*Total dos Itens:/i,
        clientName: /Nome:\s*(.*?)\s*Vela de brinde/i,
        cep: /CEP:\s*(\d{8})/i,
        rua: /Endereço:\s*(.*?),/i,
        numero: /Nº\s*(\w+)/i,
        bairro: /Bairro:\s*(.*?)\s*Cidade:/i,
      };

      const extractValue = (pattern) => {
        const match = text.match(pattern);
        return match && match[1] ? match[1].trim() : "";
      };

      const extractedData = {
        cakeName: extractValue(patterns.cakeName),
        clientName: extractValue(patterns.clientName),
        cep: extractValue(patterns.cep),
        rua: extractValue(patterns.rua) || extractValue(/Endereço:\s*(.*)/i), // Caso não tenha vírgula
        bairro: extractValue(patterns.bairro),
        numero: extractValue(patterns.numero),
        complemento: "", // O novo formato não inclui complemento
        whatsapp: "", // O novo formato não inclui WhatsApp
      };

      // Validação básica para garantir que os campos essenciais foram extraídos
      if (
        !extractedData.clientName ||
        !extractedData.cakeName ||
        !extractedData.rua
      ) {
        alert(
          "Não foi possível extrair os dados do pedido. Verifique se a mensagem está no formato correto."
        );
        return;
      }

      // Preenche os campos do formulário de novo pedido
      for (const key in fields) {
        if (
          Object.prototype.hasOwnProperty.call(fields, key) &&
          extractedData[key]
        ) {
          fields[key].value = extractedData[key];
        }
      }

      // Limpa o campo e fecha o modal
      messageText.value = "";
      readMessageModal.style.display = "none";

      // Abre o modal de novo pedido para revisão
      newOrderModal.style.display = "block";
    }

    /**
     * Remove todos os pedidos com status 'entregue' do Firebase.
     */
    async function clearDeliveredOrders() {
      const pedidosRef = ref(db, "pedidos");
      try {
        const snapshot = await get(pedidosRef);
        if (snapshot.exists()) {
          const pedidos = snapshot.val();
          const updates = {};
          let hasDeliveredOrders = false;

          for (const pedidoId in pedidos) {
            if (pedidos[pedidoId].status === "entregue") {
              updates[`/pedidos/${pedidoId}`] = null; // Marcar para exclusão
              hasDeliveredOrders = true;
            }
          }

          if (hasDeliveredOrders) {
            if (
              confirm(
                "Tem certeza que deseja apagar permanentemente todos os pedidos entregues?"
              )
            ) {
              await update(ref(db), updates);
              alert("Pedidos entregues foram removidos com sucesso.");
            }
          } else {
            alert("Não há pedidos entregues para remover.");
          }
        }
      } catch (error) {
        console.error("Erro ao remover pedidos entregues:", error);
        alert("Ocorreu um erro ao tentar remover os pedidos.");
      }
    }
});