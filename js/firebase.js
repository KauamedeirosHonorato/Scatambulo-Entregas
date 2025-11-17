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

export function createNewOrder(orderData) {
  const newPedidoRef = push(ref(db, "pedidos"));
  const updates = {};
  updates[newPedidoRef.key] = {
    ...orderData,
    status: "pendente",
  };
  return update(ref(db, "pedidos"), updates);
}

export function updateOrderStatus(pedidoId, newStatus) {
  const updates = {};
  updates[`/pedidos/${pedidoId}/status`] = newStatus;
  return update(ref(db), updates);
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

