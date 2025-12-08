import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  update,
  onValue,
  off,
  push,
  child,
  get,
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-storage.js";

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
const storage = getStorage(app);

// Exporta funções do Firebase para os outros módulos
export { db, ref, set, update, onValue, off, push, child, get };

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

// Retorna todos os pedidos
export async function getAllOrders() {
  try {
    const snapshot = await get(ref(db, "pedidos"));
    return snapshot.val() || {};
  } catch (error) {
    console.error("Erro ao buscar todos os pedidos:", error);
    throw error;
  }
}

// ===== Chat-related functions =====

export function getConversationId(userA, userB) {
  if (!userA || !userB) return null;
  // deterministic id regardless of order
  return [userA, userB].sort().join('_');
}

export async function sendMessage(conversationId, senderId, content, type = 'text', replyInfo = null) {
  if (!conversationId || !senderId) throw new Error('Invalid params for sendMessage');
  const messagesRef = ref(db, `chats/${conversationId}/messages`);
  const messagePayload = {
    senderId,
    content,
    type,
    timestamp: Date.now(),
    edited: false,
    replyTo: replyInfo || null,
    reactions: {},
  };

  const newMsgRef = await push(messagesRef, messagePayload);

  // notify the other participant(s)
  const participants = conversationId.split('_');
  participants.forEach(participant => {
    if (participant === senderId) return;
    // increment unread count for participant
    const unreadRef = ref(db, `conversations_unread/${participant}/${conversationId}`);
    get(unreadRef).then(snap => {
      const cur = snap.exists() ? (snap.val().unread_count || 0) : 0;
      set(unreadRef, { unread_count: cur + 1 });
    }).catch(() => {});

    // simple notification flag
    set(ref(db, `notifications/${participant}`), { hasUnread: true, lastConversationId: conversationId });
  });

  return newMsgRef.key;
}

export function listenToConversation(conversationId, callback) {
  const messagesRef = ref(db, `chats/${conversationId}/messages`);
  const wrapper = (snapshot) => callback(snapshot.val() || {});
  onValue(messagesRef, wrapper);
  return () => off(messagesRef, 'value', wrapper);
}

export function listenToTypingStatus(conversationId, callback) {
  const typingRef = ref(db, `typing/${conversationId}`);
  const wrapper = (snapshot) => callback(snapshot.val() || {});
  onValue(typingRef, wrapper);
  return () => off(typingRef, 'value', wrapper);
}

export function setTypingStatus(conversationId, userId, isTyping) {
  return set(ref(db, `typing/${conversationId}/${userId}`), !!isTyping);
}

export function deleteMessage(conversationId, messageId) {
  if (!conversationId || !messageId) return Promise.reject(new Error('Invalid params'));
  return update(ref(db, `chats/${conversationId}/messages/${messageId}`), { type: 'deleted', content: 'Mensagem apagada' });
}

export function editMessage(conversationId, messageId, newContent) {
  if (!conversationId || !messageId) return Promise.reject(new Error('Invalid params'));
  return update(ref(db, `chats/${conversationId}/messages/${messageId}`), { content: newContent, edited: true, editedAt: Date.now() });
}

export async function toggleReaction(conversationId, messageId, userId, emoji) {
  if (!conversationId || !messageId || !userId) throw new Error('Invalid params');
  const reactionRef = ref(db, `chats/${conversationId}/messages/${messageId}/reactions/${userId}`);
  const snap = await get(reactionRef);
  if (snap.exists()) {
    // remove reaction
    return set(reactionRef, null);
  } else {
    return set(reactionRef, emoji);
  }
}

export function listenToConversationUnreadCounts(username, callback) {
  const unreadRef = ref(db, `conversations_unread/${username}`);
  const wrapper = (snapshot) => callback(snapshot.val() || {});
  onValue(unreadRef, wrapper);
  return () => off(unreadRef, 'value', wrapper);
}

export function markConversationAsRead(username, conversationId) {
  if (!username || !conversationId) return Promise.reject(new Error('Invalid params'));
  return set(ref(db, `conversations_unread/${username}/${conversationId}`), { unread_count: 0 });
}

export function markChatAsRead(username) {
  if (!username) return Promise.reject(new Error('Invalid params'));
  // remove all unread counts and notifications for user
  set(ref(db, `conversations_unread/${username}`), null);
  return set(ref(db, `notifications/${username}`), { hasUnread: false });
}

export function listenToChatNotifications(username, callback) {
  const notifRef = ref(db, `notifications/${username}`);
  const wrapper = (snapshot) => callback(snapshot.val() || { hasUnread: false });
  onValue(notifRef, wrapper);
  return () => off(notifRef, 'value', wrapper);
}

export async function uploadChatImage(file) {
  if (!file) throw new Error('No file provided');
  try {
    // Create a storage path
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const path = `chat_images/${Date.now()}_${Math.floor(Math.random()*10000)}_${safeName}`;
    const sRef = storageRef(storage, path);
    const snapshot = await uploadBytes(sRef, file);
    const url = await getDownloadURL(snapshot.ref);
    return url;
  } catch (err) {
    console.error('uploadChatImage error:', err);
    // Fallback to blob URL so UX still works offline/dev
    try {
      return URL.createObjectURL(file);
    } catch (e) {
      throw err;
    }
  }
}

export function clearConversation(conversationId) {
  if (!conversationId) return Promise.reject(new Error('Invalid params'));
  // Remove all messages for conversation and reset unread flags for participants
  const messagesRef = ref(db, `chats/${conversationId}/messages`);
  const participants = conversationId.split('_');
  const updates = {};
  updates[`chats/${conversationId}/messages`] = null;
  participants.forEach(p => {
    updates[`conversations_unread/${p}/${conversationId}`] = { unread_count: 0 };
    updates[`notifications/${p}`] = { hasUnread: false };
  });
  return update(ref(db), updates);
}

// Marca mensagens como lidas (read) para o usuário que abriu a conversa.
export async function markMessagesRead(conversationId, username) {
  if (!conversationId || !username) return Promise.reject(new Error('Invalid params'));
  try {
    const messagesRef = ref(db, `chats/${conversationId}/messages`);
    const snap = await get(messagesRef);
    if (!snap.exists()) return 0;
    const messages = snap.val();
    const updates = {};
    Object.entries(messages).forEach(([msgId, msg]) => {
      if (msg.senderId && msg.senderId !== username && !msg.read) {
        updates[`chats/${conversationId}/messages/${msgId}/read`] = true;
        updates[`chats/${conversationId}/messages/${msgId}/readAt`] = Date.now();
      }
    });
    if (Object.keys(updates).length > 0) {
      await update(ref(db), updates);
      return Object.keys(updates).length;
    }
    return 0;
  } catch (err) {
    console.error('Erro ao marcar mensagens como lidas:', err);
    throw err;
  }
}

// Marca mensagens como entregues (delivered) para o usuário que abriu a conversa.
export async function markMessagesDelivered(conversationId, username) {
  if (!conversationId || !username) return Promise.reject(new Error('Invalid params'));
  try {
    const messagesRef = ref(db, `chats/${conversationId}/messages`);
    const snap = await get(messagesRef);
    if (!snap.exists()) return 0;
    const messages = snap.val();
    const updates = {};
    Object.entries(messages).forEach(([msgId, msg]) => {
      // Marca como entregue apenas mensagens que não foram enviadas pelo usuário atual
      if (msg.senderId && msg.senderId !== username && !msg.delivered) {
        updates[`chats/${conversationId}/messages/${msgId}/delivered`] = true;
        updates[`chats/${conversationId}/messages/${msgId}/deliveredAt`] = Date.now();
      }
    });
    if (Object.keys(updates).length > 0) {
      await update(ref(db), updates);
      return Object.keys(updates).length;
    }
    return 0;
  } catch (err) {
    console.error('Erro ao marcar mensagens como entregues:', err);
    throw err;
  }
}
