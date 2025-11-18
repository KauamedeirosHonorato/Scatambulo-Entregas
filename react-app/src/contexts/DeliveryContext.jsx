import React, { createContext, useState, useContext, useCallback } from 'react';
import { update, ref } from '../services/firebase';
import { db } from '../services/firebase';

const DeliveryContext = createContext(null);

export function DeliveryProvider({ children }) {
  const [entregadorLocation, setEntregadorLocation] = useState(null);
  const [previousEntregadorLocation, setPreviousEntregadorLocation] = useState(null);
  const [activeDelivery, setActiveDelivery] = useState(null);
  const [readyOrders, setReadyOrders] = useState({});
  const [isConfirmModalOpen, setConfirmModalOpen] = useState(false);
  const [orderToConfirm, setOrderToConfirm] = useState(null);

  // Função para cancelar a navegação, recriando handleCancelNavigation
  const cancelNavigation = useCallback(async () => {
    if (!activeDelivery) return;

    if (window.confirm("Cancelar entrega?")) {
      const orderId = activeDelivery.orderId;
      // Muda o status de volta para 'pronto_para_entrega'
      await update(ref(db, `/pedidos/${orderId}`), {
        status: "pronto_para_entrega",
        entrega: null, // Limpa os dados da entrega
      });
      
      // Limpa o estado local
      setActiveDelivery(null);
    }
  }, [activeDelivery]);

  // Função para finalizar a entrega, recriando handleFinishDelivery
  const finishDelivery = useCallback(async (orderId) => {
    if (!orderId) return;
    
    await update(ref(db, `pedidos/${orderId}`), { status: "entregue" });
    
    // Tocar som e mostrar notificação (será feito no componente)
    
    setOrderToConfirm(null);
    setActiveDelivery(null);
    setConfirmModalOpen(false);
  }, []);

  // Função para iniciar uma entrega
  const startDelivery = useCallback(async (orderId, order) => {
    if (!entregadorLocation) {
      alert("Aguardando localização do entregador para iniciar a entrega.");
      return;
    }
    
    const deliveryData = {
      orderId,
      cliente: order.cliente,
      startTime: Date.now(),
      startLocation: {
        lat: entregadorLocation.latitude,
        lng: entregadorLocation.longitude,
      },
    };

    // Atualiza o status do pedido e cria a entrega ativa no Firebase
    await update(ref(db), {
      [`/pedidos/${orderId}/status`]: "em_entrega",
      [`/pedidos/${orderId}/entrega`]: deliveryData,
      [`/entregas_ativas/${orderId}`]: deliveryData,
    });

    // Define a entrega ativa no estado local
    setActiveDelivery(deliveryData);
  }, [entregadorLocation]);

  // Abre o modal de confirmação
  const promptFinishDelivery = useCallback((orderId) => {
    setOrderToConfirm(orderId);
    setConfirmModalOpen(true);
  }, []);

  const value = {
    entregadorLocation,
    setEntregadorLocation,
    previousEntregadorLocation,
    setPreviousEntregadorLocation,
    activeDelivery,
    setActiveDelivery,
    readyOrders,
    setReadyOrders,
    isConfirmModalOpen,
    setConfirmModalOpen,
    orderToConfirm,
    setOrderToConfirm,
    cancelNavigation,
    finishDelivery,
    startDelivery,
    promptFinishDelivery,
  };

  return (
    <DeliveryContext.Provider value={value}>
      {children}
    </DeliveryContext.Provider>
  );
}

// Hook para facilitar o uso do contexto nos componentes
export const useDelivery = () => useContext(DeliveryContext);
