import React from "react";
import { useDelivery } from "../../contexts/DeliveryContext";
import { MapPin, Phone, Check, X, Navigation } from "lucide-react";

export default function DynamicIsland() {
  const { activeDelivery, cancelNavigation, promptFinishDelivery } =
    useDelivery();

  if (!activeDelivery) return null;

  const { orderId, cliente } = activeDelivery;

  return (
    // Mudei para 'fixed' para acompanhar o scroll e adicionei 'top-4' para dar o efeito flutuante
    <div className="fixed top-4 left-0 right-0 z-40 px-4 flex justify-center pointer-events-none">
      {/* pointer-events-auto reabilita cliques apenas no card, permitindo clicar no mapa atrás dele nas laterais */}
      <div className="pointer-events-auto w-full max-w-lg bg-gray-900/90 backdrop-blur-lg text-white rounded-3xl shadow-2xl border border-gray-700/50 p-1 transition-all duration-300 animate-in slide-in-from-top-4">
        <div className="px-4 py-3">
          <div className="flex justify-between items-start">
            {/* Informações do Pedido */}
            <div className="flex items-start gap-3">
              <div className="bg-green-500/20 p-2 rounded-full mt-1">
                <Navigation
                  size={18}
                  className="text-green-400 animate-pulse"
                />
              </div>
              <div>
                <p className="text-xs text-green-400 font-bold uppercase tracking-wider mb-0.5">
                  Em Rota
                </p>
                <p className="text-lg font-bold leading-tight">
                  Pedido #{orderId.substring(orderId.length - 5)}
                </p>
                <div className="flex items-center text-gray-300 text-sm mt-1">
                  <MapPin
                    size={14}
                    className="mr-1 flex-shrink-0 text-gray-400"
                  />
                  <span className="truncate max-w-[180px]">
                    {cliente?.endereco || "Endereço não informado"}
                  </span>
                </div>
              </div>
            </div>

            {/* Botões de Ação */}
            <div className="flex items-center gap-2 pl-2">
              <button
                onClick={() => promptFinishDelivery(orderId)}
                className="p-3 bg-emerald-600 rounded-2xl hover:bg-emerald-500 transition-colors shadow-lg shadow-emerald-900/20 group"
                title="Concluir Entrega"
              >
                <Check
                  size={20}
                  className="text-white group-hover:scale-110 transition-transform"
                />
              </button>

              <button
                onClick={cancelNavigation}
                className="p-3 bg-gray-700 rounded-2xl hover:bg-red-600 transition-colors group"
                title="Cancelar Rota"
              >
                <X
                  size={20}
                  className="text-gray-300 group-hover:text-white transition-colors"
                />
              </button>
            </div>
          </div>

          {/* Rodapé Opcional: Telefone */}
          {cliente?.telefone && (
            <div className="mt-3 pt-2 border-t border-gray-700/50 flex justify-center">
              <a
                href={`tel:${cliente.telefone}`}
                className="flex items-center gap-2 text-sm text-cyan-400 hover:text-cyan-300 transition-colors py-1 px-3 rounded-full hover:bg-gray-800"
              >
                <Phone size={14} />
                <span>Ligar para Cliente: {cliente.telefone}</span>
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
