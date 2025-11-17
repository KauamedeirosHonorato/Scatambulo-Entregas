import { geocodeAddress, getRouteDetails, calculateSpeed } from "./utils.js";

let map;
let deliveryMarker; // Marcador do entregador
let routeLayer;
let clientMarker; // Marcador do cliente
let routeRecalculationInterval = null;

export function initMap(elementId) {
  // Coordenadas de São Paulo como centro inicial
  map = L.map(elementId).setView([-23.5505, -46.6333], 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
  return map;
}

/**
 * Atualiza ou cria o marcador do entregador no mapa.
 */
export function updateDeliveryMarkerOnMap(location) {
  if (location && map) {
    const { latitude, longitude } = location;
    const latLng = [latitude, longitude];

    if (deliveryMarker) {
      deliveryMarker.setLatLng(latLng);
      if (typeof heading === 'number' && !isNaN(heading)) {
        if (deliveryMarker._icon) {
          const currentTransform = deliveryMarker._icon.style.transform;
          const translateMatch = currentTransform.match(/translate3d\(([^)]+)\)/);
          if (translateMatch) {
            deliveryMarker._icon.style.transform = `${translateMatch[0]} rotate(${heading}deg)`;
          } else {
            deliveryMarker._icon.style.transform = `rotate(${heading}deg)`;
          }
        }
      }
    } else {
      deliveryMarker = L.marker(latLng, {
        icon: L.icon({
          iconUrl: "/CarroIcone/Versa2025.png",
          iconSize: [70, 70],
          iconAnchor: [35, 55],
        }),
      }).addTo(map);
      if (typeof heading === 'number' && !isNaN(heading) && deliveryMarker._icon) {
        const currentTransform = deliveryMarker._icon.style.transform;
        const translateMatch = currentTransform.match(/translate3d\(([^)]+)\)/);
        if (translateMatch) {
          deliveryMarker._icon.style.transform = `${translateMatch[0]} rotate(${heading}deg)`;
        } else {
          deliveryMarker._icon.style.transform = `rotate(${heading}deg)`;
        }
      }
    }
    return deliveryMarker;
  }
  return null;
}

/**
 * Atualiza ou cria o marcador do cliente no mapa.
 */
export function updateClientMarkerOnMap(coords) {
  if (clientMarker) map.removeLayer(clientMarker);
  if (coords) {
    const clientLatLng = [coords.lat, coords.lon];
    clientMarker = L.marker(clientLatLng, {
      icon: L.icon({
        iconUrl: "/CarroIcone/cliente.png",
        iconSize: [50, 50],
        iconAnchor: [25, 50],
      }),
    }).addTo(map);
  }
}

/**
 * Ajusta o zoom do mapa para mostrar tanto o entregador quanto o cliente.
 */
export function fitMapToBounds(deliveryLocation, clientCoords) {
  if (deliveryLocation && clientCoords) {
    const deliveryLatLng = [
      deliveryLocation.latitude,
      deliveryLocation.longitude,
    ];
    const clientLatLng = [clientCoords.lat, clientCoords.lon];
    const bounds = L.latLngBounds([deliveryLatLng, clientLatLng]);
    map.fitBounds(bounds.pad(0.2));
  } else if (deliveryLocation) {
    map.setView([deliveryLocation.latitude, deliveryLocation.longitude], 15);
  }
}

/**
 * Desenha a geometria de uma rota no mapa.
 */
export function drawRouteOnMap(geometry) {
  if (routeLayer) {
    map.removeLayer(routeLayer);
  }
  if (geometry) {
    routeLayer = L.geoJSON(geometry, {
      style: { color: "#007bff", weight: 5 },
    }).addTo(map);
  }
}

/**
 * Limpa a rota desenhada do mapa.
 */
export function clearRouteFromMap() {
  if (routeLayer) {
    map.removeLayer(routeLayer);
    routeLayer = null;
  }
}

/**
 * Adiciona marcadores de início e fim da rota (função que estava faltando).
 */
export function addRouteMarkers(startCoords, endCoords) {
  // A lógica de marcadores já é tratada por updateDeliveryMarkerOnMap e updateClientMarkerOnMap
  // Esta função pode ser usada para lógicas adicionais se necessário.
}

/**
 * Inicia o processo de navegação, desenhando a rota e atualizando-a periodicamente.
 * @param {object} startCoords - Coordenadas do entregador.
 * @param {object} endCoords - Coordenadas do cliente.
 * @param {(details: object) => void} onRouteUpdate - Callback chamado com os detalhes da rota.
 */
export function startNavigation(startCoords, endCoords, onRouteUpdate) {
  if (routeRecalculationInterval) clearInterval(routeRecalculationInterval);

  const calculateAndDraw = async () => {
    const routeDetails = await getRouteDetails(startCoords, endCoords);

    clearRouteFromMap();

    if (routeDetails) {
      drawRouteOnMap(routeDetails.geometry);
      addRouteMarkers(startCoords, endCoords);

      // Chama o callback com os detalhes para que a UI e o Firebase possam ser atualizados
      if (onRouteUpdate) {
        onRouteUpdate(routeDetails);
      }
    } else {
      // Informa que não foi possível obter a rota
      if (onRouteUpdate) {
        onRouteUpdate(null);
      }
    }
  };

  calculateAndDraw(); // Executa imediatamente
  routeRecalculationInterval = setInterval(calculateAndDraw, 15000); // E depois a cada 15 segundos
}

/**
 * Para a navegação, limpando o intervalo de atualização e a rota do mapa.
 */
export function stopNavigation() {
  if (routeRecalculationInterval) {
    clearInterval(routeRecalculationInterval);
    routeRecalculationInterval = null;
  }
  clearRouteFromMap();
  // Opcional: limpar marcador do cliente se a navegação for cancelada
  // updateClientMarkerOnMap(null);
}

/**
 * Move o centro do mapa para a localização especificada.
 * @param {object} location - Objeto com latitude e longitude.
 */
export function panMapTo(location) {
  if (location && map) {
    map.panTo([location.latitude, location.longitude]);
  }
}
