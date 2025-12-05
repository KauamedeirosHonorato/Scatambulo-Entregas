import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  update,
  onValue,
  push,
  child,
  get,
  runTransaction,
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
export { db, ref, set, update, onValue, push, child, get, storage, storageRef, runTransaction };

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

// Observa notificações de chat para um usuário específico
export function listenToChatNotifications(userId, callback) {
  const notificationRef = ref(db, `chat_notifications/${userId}`);
  onValue(notificationRef, (snapshot) => {
    const notificationData = snapshot.val() || {};
    const payload = {
      hasUnread: notificationData.unread === true,
      lastConversationId: notificationData.last_unread_from || null,
    };
    callback(payload);
  });
}

/**
 * Listens for unread message counts for all conversations of a user.
 * @param {string} userId 
 * @param {(counts: object) => void} callback 
 * @returns {import("firebase/database").Unsubscribe} The unsubscribe function.
 */
export function listenToConversationUnreadCounts(userId, callback) {
  const conversationsRef = ref(db, `chat_notifications/${userId}/conversations`);
  return onValue(conversationsRef, (snapshot) => {
    const counts = snapshot.val() || {};
    callback(counts);
  });
}

/**
 * Marks a specific conversation as read for a user.
 * @param {string} userId 
 * @param {string} conversationId 
 * @returns {Promise<void>}
 */
export async function markConversationAsRead(userId, conversationId) {
  const conversationNotificationRef = ref(db, `chat_notifications/${userId}/conversations/${conversationId}`);
  // Setting to null removes the node, effectively marking it as read.
  await set(conversationNotificationRef, null);
}

/**
 * Uploads an image to Firebase Storage for the chat.
 * @param {File} file The image file to upload.
 * @returns {Promise<string>} A promise that resolves with the download URL of the uploaded image.
 */
export async function uploadChatImage(file) {
  if (!file) throw new Error("No file provided for upload.");
  const filePath = `chat_images/${Date.now()}_${file.name}`;
  const fileRef = storageRef(storage, filePath);

  await uploadBytes(fileRef, file);
  const downloadUrl = await getDownloadURL(fileRef);
  return downloadUrl;
}

/**
 * Generates a consistent conversation ID from two user IDs.
 * @param {string} userId1 
 * @param {string} userId2 
 * @returns {string} The conversation ID.
 */
export function getConversationId(userId1, userId2) {
  return [userId1, userId2].sort().join('_');
}

/**
 * Sends a message to a conversation and notifies the recipient.
 * @param {string} conversationId 
 * @param {string} senderId 
 * @param {string} content 
 * @param {'text' | 'image'} [type='text'] The type of message.
 * @param {object | null} [replyTo=null] - Information about the message being replied to.
 * @returns {Promise<void>}
 */
export async function sendMessage(conversationId, senderId, content, type = 'text', replyTo = null) {
  const message = {
    senderId,
    content,
    timestamp: Date.now(),
    type, // Add message type
    ...(replyTo && { replyTo }), // Add replyTo if it exists
  };

  // 1. Push the message to the conversation
  const messagesRef = ref(db, `chat/conversations/${conversationId}/messages`);
  await push(messagesRef, message);

  // 2. Notify the recipient
  const participants = conversationId.split('_');
  const recipientId = participants.find(p => p !== senderId);
  
  if (recipientId) {
    const notificationRef = ref(db, `chat_notifications/${recipientId}/unread`);
    await set(notificationRef, true);

    // Também armazena o ID da conversa da qual a última mensagem veio
    const lastUnreadFromRef = ref(db, `chat_notifications/${recipientId}/last_unread_from`);
    await set(lastUnreadFromRef, conversationId);

    // Increment per-conversation unread count using a transaction
    const conversationNotificationRef = ref(db, `chat_notifications/${recipientId}/conversations/${conversationId}/unread_count`);
    await runTransaction(conversationNotificationRef, (currentCount) => {
      return (currentCount || 0) + 1;
    });
  }
}

/**
 * Deletes a message by updating its content and type.
 * @param {string} conversationId
 * @param {string} messageId
 * @returns {Promise<void>}
 */
export async function deleteMessage(conversationId, messageId) {
  const messageRef = ref(db, `chat/conversations/${conversationId}/messages/${messageId}`);
  await update(messageRef, {
    content: 'Mensagem apagada',
    type: 'deleted',
  });
}

/**
 * Edits the content of a message.
 * @param {string} conversationId
 * @param {string} messageId
 * @param {string} newContent
 * @returns {Promise<void>}
 */
export async function editMessage(conversationId, messageId, newContent) {
  const messageRef = ref(db, `chat/conversations/${conversationId}/messages/${messageId}`);
  await update(messageRef, {
    content: newContent,
    edited: true,
  });
}

/**
 * Sets the typing status of a user in a conversation.
 * @param {string} conversationId 
 * @param {string} userId 
 * @param {boolean} isTyping 
 * @returns {Promise<void>}
 */
export async function setTypingStatus(conversationId, userId, isTyping) {
  const typingRef = ref(db, `chat/typing_status/${conversationId}/${userId}`);
  // Set to true if typing, remove the node if not typing to keep the DB clean.
  await set(typingRef, isTyping ? true : null);
}

/**
 * Listens for typing status changes in a conversation.
 * @param {string} conversationId 
 * @param {(typingUsers: object) => void} callback 
 * @returns {import("firebase/database").Unsubscribe} The unsubscribe function.
 */
export function listenToTypingStatus(conversationId, callback) {
  const typingRef = ref(db, `chat/typing_status/${conversationId}`);
  return onValue(typingRef, (snapshot) => {
    const typingUsers = snapshot.val() || {};
    callback(typingUsers);
  });
}

/**
 * Toggles a reaction for a user on a specific message.
 * @param {string} conversationId
 * @param {string} messageId
 * @param {string} userId
 * @param {string} emoji
 * @returns {Promise<void>}
 */
export async function toggleReaction(conversationId, messageId, userId, emoji) {
  const reactionRef = ref(db, `chat/conversations/${conversationId}/messages/${messageId}/reactions/${emoji}/${userId}`);
  
  return runTransaction(reactionRef, (currentData) => {
    if (currentData === null) {
      return true; // Add reaction
    } else {
      return null; // Remove reaction
    }
  });
}

/**
 * Clears all messages from a specific conversation.
 * @param {string} conversationId The ID of the conversation to clear.
 * @returns {Promise<void>}
 */
export async function clearConversation(conversationId) {
  const messagesRef = ref(db, `chat/conversations/${conversationId}/messages`);
  await set(messagesRef, null);
}

/**
 * Listens for new messages in a conversation.
 * @param {string} conversationId 
 * @param {(messages: object) => void} callback 
 * @returns {import("firebase/database").Unsubscribe} The unsubscribe function.
 */
export function listenToConversation(conversationId, callback) {
  const messagesRef = ref(db, `chat/conversations/${conversationId}/messages`);
  return onValue(messagesRef, (snapshot) => {
    const messages = snapshot.val() || {};
    callback(messages);
  });
}

/**
 * Marks a user's chat notification as read.
 * @param {string} userId 
 * @returns {Promise<void>}
 */
export async function markChatAsRead(userId) {
  const notificationRef = ref(db, `chat_notifications/${userId}/unread`);
  await set(notificationRef, false);
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
