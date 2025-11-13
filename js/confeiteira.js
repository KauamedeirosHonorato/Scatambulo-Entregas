import { db, ref, onValue, update } from './firebase.js';

document.addEventListener('DOMContentLoaded', () => {
    // Proteção de rota: verifica se o usuário logado é a Sofia
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    if (!currentUser || currentUser.panel !== 'confeiteira.html') {
        window.location.href = 'index.html';
        return;
    }

    // --- Seleção dos Elementos do DOM ---
    const logoutButton = document.getElementById('logout-button');
    const kanbanBoard = document.getElementById('kanban-board');

    // --- INICIALIZAÇÃO ---
    setupEventListeners();
    listenToFirebase();

    /**
     * Configura os ouvintes de eventos para a página.
     */
    function setupEventListeners() {
        logoutButton.addEventListener('click', () => {
            localStorage.removeItem('currentUser');
            window.location.href = 'index.html';
        });
    }

    /**
     * Ouve as alterações nos pedidos do Firebase e renderiza o quadro.
     */
    function listenToFirebase() {
        const pedidosRef = ref(db, 'pedidos/');
        onValue(pedidosRef, (snapshot) => {
            const pedidos = snapshot.val();
            renderBoard(pedidos || {});
        });
    }

    /**
     * Renderiza o quadro Kanban com as colunas relevantes para a confeiteira.
     * @param {object} pedidos - O objeto de pedidos do Firebase.
     */
    function renderBoard(pedidos) {
        kanbanBoard.innerHTML = '';
        const statuses = [
            { id: 'pendente', title: 'Pendente' },
            { id: 'em_preparo', title: 'Em Preparo' },
            { id: 'feito', title: 'Feito' }
        ];

        statuses.forEach(statusInfo => {
            const column = document.createElement('div');
            column.className = 'kanban-column';
            column.dataset.status = statusInfo.id;
            column.innerHTML = `<h3>${statusInfo.title}</h3>`;
            kanbanBoard.appendChild(column);
        });

        Object.entries(pedidos).forEach(([pedidoId, pedido]) => {
            // A confeiteira só vê os pedidos até o status "feito"
            if (statuses.some(s => s.id === pedido.status)) {
                const column = kanbanBoard.querySelector(`.kanban-column[data-status="${pedido.status}"]`);
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
        const card = document.createElement('div');
        card.className = 'order-card';
        card.innerHTML = `<h4>${pedido.nomeBolo}</h4><p>${pedido.nomeCliente}</p>`;

        const actions = document.createElement('div');
        actions.className = 'order-actions';

        if (pedido.status === 'pendente') {
            const btnPreparo = document.createElement('button');
            btnPreparo.textContent = 'Iniciar Preparo';
            btnPreparo.onclick = () => updateStatus(pedidoId, 'em_preparo');
            actions.appendChild(btnPreparo);
        } else if (pedido.status === 'em_preparo') {
            const btnFeito = document.createElement('button');
            btnFeito.textContent = 'Marcar como Feito';
            btnFeito.onclick = () => updateStatus(pedidoId, 'feito');
            actions.appendChild(btnFeito);
        }

        card.appendChild(actions);
        return card;
    }

    function updateStatus(pedidoId, newStatus) {
        const updates = {};
        updates[`/pedidos/${pedidoId}/status`] = newStatus;
        update(ref(db), updates).catch(err => console.error("Erro ao atualizar status:", err));
    }
});