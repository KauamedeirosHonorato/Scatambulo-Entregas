import { db, ref, onValue, update, push } from "./firebase.js";

document.addEventListener("DOMContentLoaded", () => {
  // Proteção de rota: verifica se o usuário logado é a Sofia
  const currentUser = JSON.parse(localStorage.getItem("currentUser"));
  if (!currentUser || currentUser.panel !== "confeiteira.html") {
    window.location.href = "index.html";
    return;
  }

  // --- Seleção dos Elementos do DOM ---
  const logoutButton = document.getElementById("logout-button");
  const kanbanBoard = document.getElementById("kanban-board");
  const newOrderModal = document.getElementById("new-order-modal");
  const readMessageModal = document.getElementById("read-message-modal");
  const newOrderBtn = document.getElementById("new-order-button");
  const readMessageBtn = document.getElementById("read-message-button");
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
  const newOrderSound = new Audio(
    "https://cdn.freesound.org/previews/219/219244_401265-lq.mp3"
  ); // Som para novo pedido
  let knownOrderIds = new Set(); // Rastreia pedidos para notificação
  let isFirstLoad = true; // Evita notificações na carga inicial

  let map; // Variável para o mapa Leaflet
  let deliveryPersonMarker; // Marcador para a localização do entregador
  const deliveryPersonStatus = document.getElementById("delivery-person-status");

  // --- INICIALIZAÇÃO ---
  setupEventListeners();
  listenToFirebase();
  initMap();
  listenToDeliveryPersonLocation();

  /**
   * Inicializa o mapa Leaflet.
   */
  function initMap() {
    const mapElement = document.getElementById("map");
    if (!mapElement) return;

    map = L.map(mapElement).setView([-23.5505, -46.6333], 13); // Ponto inicial (São Paulo)
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
  }

  /**
   * Ouve a localização do entregador no Firebase e atualiza o mapa.
   */
  function listenToDeliveryPersonLocation() {
    const locationRef = ref(db, "localizacao/entregador");
    onValue(locationRef, (snapshot) => {
      const location = snapshot.val();
      if (location && location.latitude && location.longitude) {
        const latLng = [location.latitude, location.longitude];
        if (!deliveryPersonMarker) {
          deliveryPersonMarker = L.marker(latLng, {
            icon: L.icon({
              iconUrl: "/CarroIcone/Versa2025.png", // Usar o mesmo ícone do entregador
              iconSize: [70, 70],
              iconAnchor: [35, 55],
            }),
          }).addTo(map);
          map.setView(latLng, 15); // Centraliza o mapa na primeira localização
        } else {
          deliveryPersonMarker.setLatLng(latLng);
        }
        deliveryPersonStatus.textContent = `Entregador localizado em: ${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`;
      } else {
        if (deliveryPersonMarker) {
          map.removeLayer(deliveryPersonMarker);
          deliveryPersonMarker = null;
        }
        deliveryPersonStatus.textContent = "Aguardando localização do entregador...";
      }
    });
  }

  /**
   * Configura os ouvintes de eventos para a página.
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
    closeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        newOrderModal.style.display = "none";
        readMessageModal.style.display = "none";
      });
    });

    window.addEventListener("click", (event) => {
      if (event.target === newOrderModal) newOrderModal.style.display = "none";
      if (event.target === readMessageModal)
        readMessageModal.style.display = "none";
    });

    const cepInput = document.getElementById("cep");
    cepInput.addEventListener("blur", async () => {
      const cep = cepInput.value.replace(/\D/g, "");
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
  }

  /**
   * Ouve as alterações nos pedidos do Firebase e renderiza o quadro.
   */
  function listenToFirebase() {
    const pedidosRef = ref(db, "pedidos/");
    onValue(pedidosRef, (snapshot) => {
      const pedidos = snapshot.val() || {};
      const currentPendingOrderIds = new Set();

      // Lógica para notificação sonora
      for (const pedidoId in pedidos) {
        if (pedidos[pedidoId].status === "pendente") {
          currentPendingOrderIds.add(pedidoId);
          // Se o pedido pendente não era conhecido e não é a primeira carga, notifica.
          if (!isFirstLoad && !knownOrderIds.has(pedidoId)) {
            newOrderSound.play().catch((error) => {
              console.warn(
                "Não foi possível tocar o som de notificação:",
                error
              );
            });
          }
        }
      }

      // Atualiza o conjunto de IDs conhecidos e marca que a primeira carga terminou
      knownOrderIds = currentPendingOrderIds;
      if (isFirstLoad) {
        isFirstLoad = false;
      }

      renderBoard(pedidos);
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
   * Renderiza o quadro Kanban com as colunas relevantes para a confeiteira.
   * @param {object} pedidos - O objeto de pedidos do Firebase.
   */
  function renderBoard(pedidos) {
    kanbanBoard.innerHTML = "";
    const statuses = [
      { id: "pendente", title: "Pendente" },
      { id: "em_preparo", title: "Em Preparo" },
      { id: "feito", title: "Feito" },
    ];

    statuses.forEach((statusInfo) => {
      const column = document.createElement("div");
      column.className = "kanban-column";
      column.dataset.status = statusInfo.id;
      column.innerHTML = `<h3>${statusInfo.title}</h3>`;
      kanbanBoard.appendChild(column);
    });

    Object.entries(pedidos).forEach(([pedidoId, pedido]) => {
      // A confeiteira só vê os pedidos até o status "feito"
      if (statuses.some((s) => s.id === pedido.status)) {
        const column = kanbanBoard.querySelector(
          `.kanban-column[data-status="${pedido.status}"]`
        );
        if (column) {
          const card = createOrderCard(pedidoId, pedido);
          column.appendChild(card);
        }
      }
    });
  }

  /**
   * Cria um card de pedido com ações para a confeiteira.
   * @param {string} pedidoId - A chave do pedido no Firebase.
   * @param {object} pedido - Os dados do pedido.
   */
  function createOrderCard(pedidoId, pedido) {
    const card = document.createElement("div");
    card.className = "order-card";
    card.innerHTML = `<h4>${pedido.nomeBolo}</h4><p>${pedido.nomeCliente}</p>`;

    const actions = document.createElement("div");
    actions.className = "order-actions";

    if (pedido.status === "pendente") {
      const btnPreparo = document.createElement("button");
      btnPreparo.textContent = "Iniciar Preparo";
      btnPreparo.onclick = () => updateStatus(pedidoId, "em_preparo");
      actions.appendChild(btnPreparo);
    } else if (pedido.status === "em_preparo") {
      const btnFeito = document.createElement("button");
      btnFeito.textContent = "Marcar como Feito";
      btnFeito.onclick = () => updateStatus(pedidoId, "feito");
      actions.appendChild(btnFeito);

      const btnImprimir = document.createElement("button");
      btnImprimir.textContent = "Imprimir Etiqueta";
      btnImprimir.className = "btn-secondary"; // Usar um estilo secundário
      btnImprimir.onclick = () => printLabel(pedido);
      actions.appendChild(btnImprimir);
    }

    card.appendChild(actions);
    return card;
  }

  /**
   * Gera e imprime uma etiqueta/nota para o pedido.
   * @param {object} pedido - Os dados do pedido a ser impresso.
   */
  function printLabel(pedido) {
    const printContent = `
      <div style="font-family: 'Poppins', sans-serif; padding: 20px; border: 1px solid #ccc; width: 300px;">
        <h3 style="text-align: center; margin-bottom: 15px;">Pedido Scatambulo</h3>
        <p><strong>Bolo:</strong> ${pedido.nomeBolo}</p>
        <p><strong>Cliente:</strong> ${pedido.nomeCliente}</p>
        <p><strong>Endereço:</strong> ${pedido.endereco}</p>
        <p><strong>Número:</strong> ${pedido.numero}</p>
        ${pedido.complemento ? `<p><strong>Complemento:</strong> ${pedido.complemento}</p>` : ''}
        <p><strong>WhatsApp:</strong> ${pedido.whatsapp}</p>
        <p style="margin-top: 20px; text-align: center; font-size: 0.8em;">Obrigado pela preferência!</p>
      </div>
    `;

    const printWindow = window.open('', '_blank');
    printWindow.document.write('<html><head><title>Etiqueta do Pedido</title>');
    printWindow.document.write('<style>');
    printWindow.document.write(`
      body { font-family: 'Poppins', sans-serif; margin: 0; padding: 0; }
      div { box-sizing: border-box; }
      @media print {
        body { margin: 0; }
        div { page-break-after: always; }
      }
    `);
    printWindow.document.write('</style></head><body>');
    printWindow.document.write(printContent);
    printWindow.document.write('</body></html>');
    printWindow.document.close();
    printWindow.print();
  }

  function updateStatus(pedidoId, newStatus) {
    const updates = {};
    updates[`/pedidos/${pedidoId}/status`] = newStatus;
    update(ref(db), updates).catch((err) =>
      console.error("Erro ao atualizar status:", err)
    );
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

    messageText.value = "";
    readMessageModal.style.display = "none";
    newOrderModal.style.display = "block";
  }
});
