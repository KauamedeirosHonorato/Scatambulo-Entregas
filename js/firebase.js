import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  update,
  onValue,
  push,
  child,
  get,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

// Configuração do Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAdxw1I-E-esZVGfhoop-yehIo1TN3jztc",
  authDomain: "scatambulo-d7cf2.firebaseapp.com",
  projectId: "scatambulo-d7cf2",
  storageBucket: "scatambulo-d7cf2.firebasestorage.app",
  messagingSenderId: "793542611290",
  appId: "1:793542611290:web:2ff447165151dc92d6a363",
  measurementId: "G-CVH2148FPB",
  databaseURL: "https://scatambulo-d7cf2-default-rtdb.firebaseio.com/",
};

// Inicializa o app e banco
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Exporta funções do Firebase para os outros módulos
export { db, ref, set, update, onValue, push, child, get };

// ===== Funções customizadas =====

// Observa todos os pedidos em tempo real
export function listenToPedidos(callback) {
  const pedidosRef = ref(db, "pedidos/");
  onValue(pedidosRef, (snapshot) => {
    const pedidos = snapshot.val() || {};
    callback(pedidos);
  });
}

// Observa localização do entregador
export function listenToEntregadorLocation(callback) {
  const locationRef = ref(db, "localizacao/entregador");
  onValue(locationRef, (snapshot) => {
    const entregadorLocation = snapshot.val();
    callback(entregadorLocation);
  });
}

// Cria um novo pedido
function generateOrderId() {
  const randomPart = Math.floor(100000 + Math.random() * 900000); // Gera 6 dígitos
  return `SC${randomPart}`;
}

export function createNewOrder(orderData) {
  const orderId = generateOrderId().toLowerCase(); // Gera e já converte para minúsculas
  const newPedidoRef = ref(db, `pedidos/${orderId}`);
  const orderPayload = {
    ...orderData,
    id: orderId, // Garante que o ID salvo no objeto também esteja em minúsculas
    status: "pendente",
    timestamp: Date.now(), // CORRIGIDO: Usa 'timestamp' para consistência com a ordenação da UI
  };

  return set(newPedidoRef, orderPayload);
}

// Limpa todos os pedidos
export async function clearAllOrders() {
  const pedidosRef = ref(db, "pedidos");
  const snapshot = await get(pedidosRef);
  let count = 0;

  if (snapshot.exists()) {
    count = Object.keys(snapshot.val()).length;
  }

  if (count > 0) {
    await set(pedidosRef, null);
    console.log(`${count} pedido(s) foram removidos.`);
  }
  return count; // Retorna o número de pedidos que foram removidos
}

// Atualiza o status de um pedido
export async function updateOrderStatus(pedidoId, newStatus) {
  try {
    await update(ref(db), { [`/pedidos/${pedidoId}/status`]: newStatus });
    console.log(`Firebase: Pedido ${pedidoId} atualizado para '${newStatus}'.`);
  } catch (error) {
    console.error(`Erro ao atualizar status do pedido ${pedidoId}:`, error);
    throw error;
  }
}

// Reseta todas as entregas ativas
export async function resetAllActiveDeliveries() {
  try {
    const snapshot = await get(ref(db, "pedidos"));
    if (!snapshot.exists()) {
      console.log("Não há pedidos para resetar.");
      return;
    }

    const pedidos = snapshot.val();
    const updates = {};
    let resetCount = 0;

    Object.entries(pedidos).forEach(([id, pedido]) => {
      if (pedido.status === "em_entrega") {
        updates[`/pedidos/${id}/status`] = "pronto_para_entrega";
        updates[`/pedidos/${id}/entrega`] = null;
        updates[`/entregas_ativas/${id}`] = null;
        resetCount++;
      }
    });

    if (resetCount > 0) {
      await update(ref(db), updates);
      return resetCount;
    }
    return 0;
  } catch (error) {
    console.error("Erro ao resetar entregas ativas:", error);
    throw error;
  }
}

// Limpa pedidos entregues
export async function clearDeliveredOrders() {
  try {
    const snapshot = await get(ref(db, "pedidos"));
    if (!snapshot.exists()) {
      console.log("Não há pedidos para limpar (snapshot não existe).");
      return 0; // CORREÇÃO: Retorna 0 em vez de undefined.
    }

    const pedidos = snapshot.val();
    const updates = {};

    Object.entries(pedidos).forEach(([id, pedido]) => {
      if (pedido.status === "entregue") updates[`/pedidos/${id}`] = null;
    });

    if (Object.keys(updates).length > 0) {
      await update(ref(db), updates);
      console.log(
        `${
          Object.keys(updates).length
        } pedidos entregues removidos com sucesso.`
      );
      return Object.keys(updates).length; // Retorna a contagem
    } else {
      console.log("Não há pedidos entregues para remover.");
      return 0; // Retorna 0 se nada foi removido
    }
  } catch (error) {
    console.error("Erro ao limpar pedidos entregues:", error);
    throw error;
  }
}

// Retorna um pedido específico
export async function getPedido(pedidoId) {
  try {
    const snapshot = await get(child(ref(db), `pedidos/${pedidoId}`));
    return snapshot.val();
  } catch (error) {
    console.error(`Erro ao buscar pedido ${pedidoId}:`, error);
    throw error;
  }
}

// Atualiza dados de um pedido (sem modificar status automaticamente)
export function updatePedido(pedidoId, data) {
  try {
    return update(ref(db, `pedidos/${pedidoId}`), data);
  } catch (error) {
    console.error(`Erro ao atualizar pedido ${pedidoId}:`, data, error);
    throw error;
  }
}
