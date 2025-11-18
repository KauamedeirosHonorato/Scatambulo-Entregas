import React, { useState } from "react";
import MapComponent from "../map/MapComponent";
import { Map, Minimize2, Maximize2 } from "lucide-react";

export default function MapModal() {
  // Estado para controlar a visibilidade
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div
      className={`
        fixed bottom-4 right-4 z-50 
        transition-all duration-300 ease-in-out
        ${isExpanded ? "h-72 w-96 max-w-[calc(100vw-2rem)]" : "h-12 w-auto"} 
      `}
    >
      <div className="h-full w-full bg-white rounded-xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden">
        {/* Header clicável para alternar o estado */}
        <div
          className="bg-gray-50 px-4 py-2 flex items-center justify-between border-b border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-2">
            <Map size={16} className="text-gray-500" />
            <h3 className="text-black font-semibold text-sm">
              Mapa em Tempo Real
            </h3>
          </div>

          {/* Botão de Toggle */}
          <button className="text-gray-400 hover:text-gray-600 transition-colors">
            {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>

        {/* Conteúdo do Mapa */}
        <div className={`flex-grow relative ${!isExpanded && "hidden"}`}>
          {/* Renderizamos condicionalmente para economizar recursos quando minimizado */}
          {isExpanded && <MapComponent />}
        </div>
      </div>
    </div>
  );
}
