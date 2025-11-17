import * as Map from "./map.js";
// Removed: import * as UI from "./ui-confeiteira.js";
import { geocodeAddress } from "./utils.js";

let state = {
  entregadorLocation: null,
  previousEntregadorLocation: null, // Track previous location for speed calculation
  activeDelivery: null, // { id, ...pedido, clientCoords }
};

/**
 * Inicializa o mapa e os listeners de localização.
 * @param {string} mapId - O ID do elemento do mapa.
 * @param {function} onLocationUpdate - Callback para quando a localização do entregador é atualizada.
 */
export function initializeMapWithLocation(mapId, onLocationUpdate) {
  Map.initMap(mapId);
  Map.invalidateMapSize();

  // O listener do Firebase para a localização do entregador deve chamar `updateEntregadorLocation`.
}

/**
 * Atualiza a localização do entregador no estado e no mapa.
 * @param {object} location - O novo objeto de localização do entregador.
 */
export function updateEntregadorLocation(location) {
  if (!location) return;
  state.previousEntregadorLocation = state.entregadorLocation; // Store current as previous
  state.entregadorLocation = location; // Update current

  Map.updateDeliveryMarkerOnMap(location);

  // Se não houver entrega ativa, foca no entregador.
  if (!state.activeDelivery) {
    Map.fitMapToBounds(state.entregadorLocation, null);
  }
}

/**
 * Define a entrega ativa no estado global.
 * @param {object | null} delivery - O objeto de entrega ativa ou null para limpar.
 */
export function setActiveDelivery(delivery) {
  state.activeDelivery = delivery;
}

/**
 * Retorna a entrega ativa.
 */
export function getActiveDelivery() {
  return state.activeDelivery;
}

/**
 * Retorna a localização do entregador.
 */
export function getEntregadorLocation() {
  return state.entregadorLocation;
}

/**
 * Retorna a localização anterior do entregador.
 */
export function getPreviousEntregadorLocation() {
  return state.previousEntregadorLocation;
}
