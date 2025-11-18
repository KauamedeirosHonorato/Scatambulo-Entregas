import React from 'react';
import { useDelivery } from '../../contexts/DeliveryContext';
import { MapPin, User, Package } from 'lucide-react';

function OrderCard({ order, orderId }) {
    const { startDelivery } = useDelivery();

    return (
        <div className="bg-white/80 backdrop-blur-sm p-4 rounded-xl mb-3 border border-gray-200 shadow-md transition-shadow hover:shadow-lg">
            <div className="flex justify-between items-start">
                <div>
                    <h3 className="font-bold text-lg text-black">Pedido #{orderId.substring(orderId.length - 5)}</h3>
                    <div className="flex items-center text-gray-600 mt-2">
                        <User size={16} className="mr-2" />
                        <span>{order.cliente?.nome || 'Nome não informado'}</span>
                    </div>
                    <div className="flex items-center text-gray-600 mt-1">
                        <MapPin size={16} className="mr-2" />
                        <span>{order.cliente?.endereco || 'Endereço não informado'}</span>
                    </div>
                </div>
                <div className="text-right flex-shrink-0 ml-4">
                    <span className="text-sm text-gray-500">Total</span>
                    <p className="font-bold text-xl text-black">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.total || 0)}
                    </p>
                </div>
            </div>
            <button 
                onClick={() => startDelivery(orderId, order)}
                className="mt-4 px-4 py-3 bg-gold text-black font-bold rounded-lg w-full hover:bg-gold-dark transition-all duration-200 shadow-sm hover:shadow-md"
            >
                Iniciar Entrega
            </button>
        </div>
    );
}

export default function OrderList({ orders }) {
  const orderIds = Object.keys(orders);

  return (
    <div className="w-full max-w-2xl mx-auto">
        <h2 className="text-3xl font-bold mb-4 text-black">Pedidos Prontos</h2>
        {orderIds.length > 0 ? (
          orderIds.map(id => <OrderCard key={id} orderId={id} order={orders[id]} />)
        ) : (
          <div className="bg-white/80 backdrop-blur-sm p-6 rounded-xl text-center text-gray-500 border border-gray-200">
            <Package size={32} className="mx-auto mb-2" />
            <p>Nenhum pedido pronto no momento.</p>
          </div>
        )}
    </div>
  );
}
