import React from 'react';
import { useDelivery } from '../../contexts/DeliveryContext';

export default function ConfirmModal() {
  const { isConfirmModalOpen, orderToConfirm, finishDelivery, setConfirmModalOpen } = useDelivery();

  if (!isConfirmModalOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-pearl p-8 rounded-xl shadow-2xl text-center max-w-sm w-full border border-gray-200">
        <h2 className="text-2xl font-bold text-black mb-4">Confirmar Entrega?</h2>
        <p className="mb-8 text-gray-700">
          Confirma que o pedido #{orderToConfirm?.substring(0, 5)} foi entregue com sucesso?
        </p>
        <div className="flex justify-center gap-4">
          <button 
            onClick={() => setConfirmModalOpen(false)} 
            className="px-8 py-3 bg-gray-200 text-black font-semibold rounded-lg hover:bg-gray-300 transition-colors"
          >
            Não
          </button>
          <button 
            onClick={() => finishDelivery(orderToConfirm)} 
            className="px-8 py-3 bg-gold text-black font-semibold rounded-lg hover:bg-gold-dark transition-colors shadow-md"
          >
            Sim
          </button>
        </div>
      </div>
    </div>
  );
}