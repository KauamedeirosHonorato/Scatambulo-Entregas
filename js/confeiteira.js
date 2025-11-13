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

  // --- INICIALIZAÇÃO ---
  setupEventListeners();
  listenToFirebase();

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
      const pedidos = snapshot.val();
      renderBoard(pedidos || {});
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
    }

    card.appendChild(actions);
    return card;
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
