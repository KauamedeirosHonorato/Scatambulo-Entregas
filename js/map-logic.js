import * as Map from "./map.js";
import { geocodeAddress } from "./utils.js";

let state = {
  entregadorLocation: null,
  previousEntregadorLocation: null, // &lt;--- NOVO: Armazena o histórico
  activeDelivery: null,
};

/**
 * Inicializa o mapa.
 */
export function initializeMapWithLocation(mapId) {
  Map.initializeMap(mapId); // Updated call
  Map.invalidateMapSize();
}

/**
 * Atualiza a localização do entregador no estado e no mapa.
 */
export function updateEntregadorLocation(location) {
  // &lt;--- ATUALIZAÇÃO: Salva o anterior antes de atualizar o atual
  state.previousEntregadorLocation = state.entregadorLocation;
  state.entregadorLocation = location;

  if (location) {
    Map.updateDeliveryMarkerOnMap(location);
  }
  updateMapFocus();
}

/**
 * Processa a lista de pedidos para encontrar a entrega ativa e atualizar o mapa.
 * Esta é a função principal chamada pelos painéis Admin e Confeiteira.
 */
export async function processActiveDelivery(pedidos) {
  // 1. Encontra o pedido com status 'em_entrega'
  // 1. Tenta encontrar o pedido com status 'em_entrega'
  const activeOrderEntry = Object.entries(pedidos).find(
    ([, pedido]) => pedido.status === "em_entrega"
  );

  if (activeOrderEntry) {
    const [orderId, orderData] = activeOrderEntry;

    // Se é uma nova entrega ou a primeira vez detectando
    if (!state.activeDelivery || state.activeDelivery.id !== orderId) {
      state.activeDelivery = { id: orderId, ...orderData };

      // Busca coordenadas do cliente
      const geocodeResult = await geocodeAddress(orderData.endereco);
      if (geocodeResult && !geocodeResult.error) {
        state.activeDelivery.clientCoords = geocodeResult;
      }
    } else {
      // Apenas atualiza dados (velocidade, etc) mantendo as coords existentes
      state.activeDelivery = { ...state.activeDelivery, ...orderData };
    }

    // Atualiza visual do cliente
    if (state.activeDelivery.clientCoords) {
      Map.updateClientMarkerOnMap(state.activeDelivery.clientCoords);
    }

    // Desenha a rota SE ela existir no firebase
    if (orderData.entrega && orderData.entrega.geometria) {
      Map.drawRouteOnMap(orderData.entrega.geometria);
    }
  } else {
    if (state.activeDelivery) {
      console.log("MapLogic: Limpeza forçada.");
      state.activeDelivery = null;
      Map.clearMap(); // Updated call
      Map.updateClientMarkerOnMap(null);
    }
  }

  updateMapFocus();
}

/**
 * Ajusta o foco do mapa:
 * - Se tem entrega ativa: Foca em Entregador + Cliente
 * - Se não tem: Foca só no Entregador
 */
function updateMapFocus() {
  if (
    state.activeDelivery &&
    state.activeDelivery.clientCoords &&
    state.entregadorLocation
  ) {
    Map.fitMapToBounds(
      state.entregadorLocation,
      state.activeDelivery.clientCoords
    );
  } else if (state.entregadorLocation) {
    Map.fitMapToBounds(state.entregadorLocation, null);
  }
}

export function getActiveDelivery() {
  return state.activeDelivery;
}

export function getEntregadorLocation() {
  return state.entregadorLocation;
}

// &lt;--- NOVO: Função que faltava e causava o erro
export function getPreviousEntregadorLocation() {
  return state.previousEntregadorLocation;
}
