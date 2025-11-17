import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getDatabase, ref, set, update, onValue, push, child, get } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyAdxw1I-E-esZVGfhoop-yehIo1TN3jztc",
  authDomain: "scatambulo-d7cf2.firebaseapp.com",
  projectId: "scatambulo-d7cf2",
  storageBucket: "scatambulo-d7cf2.firebasestorage.app",
  messagingSenderId: "793542611290",
  appId: "1:793542611290:web:2ff447165151dc92d6a363",
  measurementId: "G-CVH2148FPB",
  databaseURL: "https://scatambulo-d7cf2-default-rtdb.firebaseio.com/"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export { db, ref, set, update, onValue, push, child, get };

export function listenToPedidos(callback) {
  const pedidosRef = ref(db, "pedidos/");
  onValue(pedidosRef, (snapshot) => {
    const pedidos = snapshot.val() || {};
    callback(pedidos);
  });
}

export function listenToEntregadorLocation(callback) {
  const locationRef = ref(db, "localizacao/entregador");
  onValue(locationRef, (snapshot) => {
    const entregadorLocation = snapshot.val();
    callback(entregadorLocation);
  });
}

export async function createNewOrder(orderData) {
  const newPedidoRef = push(ref(db, "pedidos"));
  const newPedidoId = newPedidoRef.key;
  const updates = {};
  updates[newPedidoId] = {
    ...orderData,
    status: "pendente",
  };
  await update(ref(db, "pedidos"), updates);

  // Send email notification for new order
  const user_email = orderData.clientEmail;
  const user_name = orderData.nomeCliente;
  if (user_email && user_name) {
    await sendEmailNotification(newPedidoId, user_email, user_name, "pendente");
  } else {
    console.warn('Missing user_email or user_name for new order:', newPedidoId, 'Email notification skipped.');
  }
  return newPedidoId;
}

async function sendEmailNotification(pedidoId, userEmail, userName, status) {
  try {
    const response = await fetch('http://localhost:3000/notify-order-status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        orderId: pedidoId,
        userEmail: userEmail,
        userName: userName,
        status: status,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Failed to send email notification:', errorData.message);
      throw new Error(errorData.message); // Re-throw for better error handling upstream
    } else {
      console.log('Email notification sent successfully for order:', pedidoId, 'status:', status);
    }
  } catch (error) {
    console.error('Error sending email notification:', error);
    throw error; // Re-throw the error
  }
}

export async function updateOrderStatus(pedidoId, newStatus) {
  // Fetch order details first to ensure we have clientEmail and nomeCliente
  const pedido = await getPedido(pedidoId);

  if (!pedido) {
    console.warn('Order not found for ID:', pedidoId, 'Status update and email notification skipped.');
    return;
  }

  const updates = {};
  updates[`/pedidos/${pedidoId}/status`] = newStatus;
  await update(ref(db), updates); // Wait for Firebase update to complete

  const user_email = pedido.clientEmail;
  const user_name = pedido.nomeCliente;

  if (user_email && user_name) {
    await sendEmailNotification(pedidoId, user_email, user_name, newStatus);
  } else {
    console.warn('Missing user_email or user_name for order:', pedidoId, 'Email notification skipped.');
  }
}

export async function clearDeliveredOrders() {
    const pedidosRef = ref(db, "pedidos");
    const snapshot = await get(pedidosRef);
    if (snapshot.exists()) {
        const pedidos = snapshot.val();
        const updates = {};
        let hasDeliveredOrders = false;

        for (const pedidoId in pedidos) {
            if (pedidos[pedidoId].status === "entregue") {
                updates[`/pedidos/${pedidoId}`] = null;
                hasDeliveredOrders = true;
            }
        }

        if (hasDeliveredOrders) {
            if (confirm("Tem certeza que deseja apagar permanentemente todos os pedidos entregues?")) {
                await update(ref(db), updates);
                alert("Pedidos entregues foram removidos com sucesso.");
            }
        } else {
            alert("Não há pedidos entregues para remover.");
        }
    }
}

export async function getPedido(pedidoId){
    const snapshot = await get(child(ref(db), `pedidos/${pedidoId}`));
    return snapshot.val();
}

export function updatePedido(pedidoId, data){
    return update(ref(db, `pedidos/${pedidoId}`), data);
}

