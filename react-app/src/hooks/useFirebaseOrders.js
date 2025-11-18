import { useEffect, useRef } from "react";
import { ref, onValue, update } from "../services/firebase";
import { useDelivery } from "../contexts/DeliveryContext";
import { db } from "../services/firebase";
import { geocodeAddress } from "../utils/map";

const notificationSound = new Audio("/audio/NotificacaoPedidoEntregue.mp3");

export function useFirebaseOrders() {
  const { setReadyOrders, setActiveDelivery } = useDelivery();

  // Refs para manter o controle sem causar re-renderizações ou reiniciar o efeito
  const isFirstLoad = useRef(true);
  const processingOrderId = useRef(null); // Evita chamadas duplicadas de geocoding para o mesmo ID

  useEffect(() => {
    const pedidosRef = ref(db, "pedidos/");

    const unsubscribe = onValue(pedidosRef, async (snapshot) => {
      const pedidos = snapshot.val() || {};

      // --- 1. Lógica de Pedidos Prontos e Notificação ---
      const ready = Object.fromEntries(
        Object.entries(pedidos).filter(
          ([, p]) => p.status === "pronto_para_entrega"
        )
      );

      setReadyOrders((prev) => {
        const prevSize = Object.keys(prev).length;
        const newSize = Object.keys(ready).length;

        // Toca o som apenas se a quantidade aumentou e NÃO é o primeiro carregamento
        if (newSize > prevSize && !isFirstLoad.current) {
          notificationSound
            .play()
            .catch((err) =>
              console.warn("Áudio bloqueado pelo navegador:", err)
            );
        }
        return ready;
      });

      // --- 2. Lógica da Entrega Ativa e Geocodificação ---
      const activeOrderEntry = Object.entries(pedidos).find(
        ([, pedido]) => pedido.status === "em_entrega"
      );

      if (activeOrderEntry) {
        const [orderId, orderData] = activeOrderEntry;

        // Verifica se precisamos de coordenadas
        const hasCoords = orderData.cliente.lat && orderData.cliente.lon;

        if (!hasCoords) {
          // Evita loop: Se já estamos processando esse ID, não faz nada
          if (processingOrderId.current === orderId) return;

          console.log(`Geocodificando pedido ${orderId}...`);
          processingOrderId.current = orderId; // Marca como processando

          const fullAddress = `${orderData.cliente.endereco}, ${orderData.cliente.bairro}, ${orderData.cliente.cidade}`;

          geocodeAddress(fullAddress).then((coords) => {
            if (coords && !coords.error) {
              // Atualiza APENAS o Firebase.
              // O listener vai disparar de novo automaticamente com os dados novos.
              update(ref(db, `pedidos/${orderId}/cliente`), coords).then(() => {
                processingOrderId.current = null; // Libera para próximos processamentos
              });
            } else {
              console.error("Falha na geocodificação:", coords?.error);
              // Se falhar, definimos o estado local mesmo sem coordenadas para não travar o app
              setActiveDelivery({ orderId, ...orderData });
              processingOrderId.current = null;
            }
          });
        } else {
          // Se já tem coordenadas, atualiza o estado local normalmente
          setActiveDelivery({ orderId, ...orderData });
        }
      } else {
        // Nenhuma entrega ativa encontrada
        setActiveDelivery(null);
      }

      // Marca que o primeiro carregamento já ocorreu
      isFirstLoad.current = false;
    });

    return () => unsubscribe();
  }, [setReadyOrders, setActiveDelivery]);
  // Dependências estáveis. Removemos 'activeDelivery' para evitar o loop infinito.
}
