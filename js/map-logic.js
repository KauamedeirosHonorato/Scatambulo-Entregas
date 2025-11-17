import * as Map from "./map.js";
import * as UI from "./ui-confeiteira.js";
import { geocodeAddress } from "./utils.js";

let state = {
  entregadorLocation: null,
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
  state.entregadorLocation = location;
  Map.updateDeliveryMarkerOnMap(location);

  // Se não houver entrega ativa, foca no entregador.
  if (!state.activeDelivery) {
    Map.fitMapToBounds(state.entregadorLocation, null);
  }
}

/**
 * Processa a lista de pedidos para encontrar a entrega ativa.
 * @param {object} pedidos - O objeto de todos os pedidos do Firebase.
 */
export async function processActiveDelivery(pedidos) {
  // Remove debugging logs
  // console.log("MapLogic: processActiveDelivery called.");
  // console.log("MapLogic: Incoming 'pedidos' object:", pedidos);

  const activeOrderEntry = Object.entries(pedidos).find(
    ([, pedido]) => pedido.status === "em_entrega"
  );
  // console.log("MapLogic: Result of activeOrderEntry find:", activeOrderEntry);

  // --- Robustness Check / Failsafe ---
  // If we currently have an active delivery in our state, but it's no longer 'em_entrega' in Firebase,
  // or if the active delivery ID doesn't match the one found, clear it.
  if (state.activeDelivery) {
    const currentActivePedidoInFirebase = pedidos[state.activeDelivery.id];
    if (!currentActivePedidoInFirebase || currentActivePedidoInFirebase.status !== "em_entrega") {
      // console.log("MapLogic: Failsafe triggered - activeDelivery in state is out of sync with Firebase. Clearing map.");
      clearActiveDelivery();
      UI.updateButtonsForNavigation(false);
      updateMapFocus(); // Re-focus map after clearing
      return; // Exit early as map is now cleared
    }
  }
  // --- End Robustness Check ---

  if (activeOrderEntry) {
    // console.log("MapLogic: Active delivery found (status 'em_entrega').");
    const [orderId, orderData] = activeOrderEntry;

    // Se a entrega ativa mudou ou é a primeira vez que encontramos uma
    if (!state.activeDelivery || state.activeDelivery.id !== orderId) {
      state.activeDelivery = { id: orderId, ...orderData };
      const geocodeResult = await geocodeAddress(orderData.endereco);

      if (geocodeResult && !geocodeResult.error) {
        state.activeDelivery.clientCoords = geocodeResult;
      } else {
        console.error(
          "Falha ao geocodificar endereço da entrega ativa:",
          geocodeResult?.error
        );
        state.activeDelivery.clientCoords = null;
      }
    }

    // Garante que o marcador do cliente seja exibido se as coordenadas existirem
    if (state.activeDelivery.clientCoords) {
      Map.updateClientMarkerOnMap(state.activeDelivery.clientCoords);

      // Inicia ou atualiza a navegação
      if (state.entregadorLocation) {
        Map.startNavigation(
          () => state.entregadorLocation, // getStartCoords
          state.activeDelivery.clientCoords, // endCoords
          (routeDetails) => {
            // onRouteUpdate callback
            if (routeDetails) {
              state.activeDelivery.entrega = {
                ...state.activeDelivery.entrega,
                geometria: routeDetails.geometry,
                distancia: routeDetails.distance,
                tempoEstimado: routeDetails.duration,
              };
            } else {
              // Limpa os detalhes da rota se não for possível obter
              state.activeDelivery.entrega = {
                ...state.activeDelivery.entrega,
                geometria: null,
                distancia: null,
                tempoEstimado: null,
              };
            }
          }
        );
        UI.updateButtonsForNavigation(true); // Ativa botões de navegação
      }
    }
  } else {
    // console.log("MapLogic: No active delivery found (status 'em_entrega'). Clearing map.");
    // Se não há mais entrega ativa, limpa o estado e o mapa.
    clearActiveDelivery();
    UI.updateButtonsForNavigation(false); // Desativa botões de navegação
  }

  updateMapFocus();
}

/**
 * Limpa os dados da entrega ativa e reseta o mapa.
 */
export function clearActiveDelivery() {
  // console.log("MapLogic: clearActiveDelivery called.");
  state.activeDelivery = null;
  Map.clearOrderFromMap(); // Usa a nova função de limpeza completa
  UI.updateButtonsForNavigation(false); // Desativa botões de navegação
}

/**
 * Ajusta o foco do mapa com base no estado atual (entrega ativa ou apenas entregador).
 */
export function updateMapFocus() {
  if (state.activeDelivery && state.activeDelivery.clientCoords) {
    Map.fitMapToBounds(
      state.entregadorLocation,
      state.activeDelivery.clientCoords
    );
  } else if (state.entregadorLocation) {
    Map.fitMapToBounds(state.entregadorLocation, null);
  }
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
