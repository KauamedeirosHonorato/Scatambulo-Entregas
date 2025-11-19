import { geocodeAddress, getRouteDetails, calculateSpeed } from "./utils.js";

let map;
let deliveryMarker; // Marcador do entregador
let routeLayer;
let clientMarker; // Marcador do cliente
let routeRecalculationInterval = null;

export function initializeMap(elementId) {
  // Renamed from initMap
  // Evita reinicializar o mapa se ele já existe (causa comum de bugs visuais)
  if (map) {
    return map;
  }

  // Coordenadas de São Paulo como centro inicial
  map = L.map(elementId).setView([-23.4273, -51.9375], 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; &lt;a href="https://www.openstreetmap.org/copyright"&gt;OpenStreetMap&lt;/a&gt; contributors',
  }).addTo(map);
  return map;
}

/**
 * Atualiza ou cria o marcador do entregador no mapa.
 */
export function updateDeliveryMarkerOnMap(location) {
  if (location && map) {
    const { latitude, longitude, heading } = location;
    const latLng = [latitude, longitude];

    if (deliveryMarker) {
      deliveryMarker.setLatLng(latLng);
      if (
        typeof heading === "number" &&
        !isNaN(heading) &&
        deliveryMarker._icon
      ) {
        deliveryMarker._icon.style.transform = `rotate(${heading}deg)`;
      }
    } else {
      deliveryMarker = L.marker(latLng, {
        icon: L.icon({
          iconUrl: "/CarroIcone/Versa2025.png",
          iconSize: [70, 70],
          iconAnchor: [35, 55],
        }),
      }).addTo(map);
      // Aplica rotação inicial se disponível
      if (
        typeof heading === "number" &&
        !isNaN(heading) &&
        deliveryMarker._icon
      ) {
        deliveryMarker._icon.style.transform = `rotate(${heading}deg)`;
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
  if (coords) {
    const clientLatLng = [coords.lat, coords.lon];
    if (clientMarker) {
      clientMarker.setLatLng(clientLatLng);
    } else {
      clientMarker = L.marker(clientLatLng, {
        icon: L.icon({
          iconUrl: "/CarroIcone/cliente.png",
          iconSize: [50, 50],
          iconAnchor: [25, 50],
        }),
      }).addTo(map);
    }
  } else {
    // Se coords for null, remove o marcador
    if (clientMarker) {
      map.removeLayer(clientMarker);
      clientMarker = null;
    }
  }
}

/**
 * Ajusta o zoom do mapa para mostrar tanto o entregador quanto o cliente.
 */
export function fitMapToBounds(deliveryLocation, clientCoords) {
  if (!map) return; // Segurança extra

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
  // Sempre limpa a rota anterior antes de desenhar a nova
  clearRouteFromMap();

  if (geometry) {
    routeLayer = L.geoJSON(geometry, {
      style: { color: "#007bff", weight: 5 },
    }).addTo(map);
  }
}

export function clearRouteFromMap() {
  if (routeLayer && map) {
    map.removeLayer(routeLayer);
  }
  routeLayer = null;
}

/**
 * Adiciona marcadores de início e fim da rota (função que estava faltando).

export function addRouteMarkers(startCoords, endCoords) {
  // A lógica de marcadores já é tratada por updateDeliveryMarkerOnMap e updateClientMarkerOnMap
  // Esta função pode ser usada para lógicas adicionais se necessário.
}

/**
 * Inicia o processo de navegação, desenhando a rota e atualizando-a periodicamente.
 * @param {() => object} getStartCoords - Uma função que retorna as coordenadas atuais do entregador.
 * @param {object} endCoords - Coordenadas do cliente.
 * @param {(details: object) => void} onRouteUpdate - Callback chamado com os detalhes da rota.
 */
export function startNavigation(getStartCoords, endCoords, onRouteUpdate) {
  if (routeRecalculationInterval) clearInterval(routeRecalculationInterval);

  const calculateAndDraw = async () => {
    const currentStartCoords = getStartCoords();
    if (!currentStartCoords) return;

    const routeDetails = await getRouteDetails(currentStartCoords, endCoords);

    // Nota: drawRouteOnMap já chama clearRouteFromMap internamente
    if (routeDetails) {
      drawRouteOnMap(routeDetails.geometry);
      if (onRouteUpdate) onRouteUpdate(routeDetails);
    } else {
      if (onRouteUpdate) onRouteUpdate(routeDetails);
    }
  };

  calculateAndDraw();
  routeRecalculationInterval = setInterval(calculateAndDraw, 15000);
}

/**
 * Para a navegação, limpando o intervalo de atualização e a rota do mapa.
 */
export function stopNavigation() {
  clearMap(); // Use the new comprehensive clear function
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

/**
 * Força o mapa a recalcular seu tamanho e renderizar novamente.
 * Útil quando o contêiner do mapa muda de tamanho ou visibilidade.
 */
export function invalidateMapSize() {
  if (map) {
    map.invalidateSize();
  }
}

/**
 * Limpa todos os elementos relacionados a um pedido do mapa (rota, marcador do cliente)
 * e para o intervalo de recalculo da rota. O marcador do entregador permanece.
 */
export function clearMap() {
  // Renamed from clearOrderFromMap
  // 1. Remove a Rota
  clearRouteFromMap();

  // 2. Remove o Marcador do Cliente
  if (clientMarker && map) {
    map.removeLayer(clientMarker);
  }
  clientMarker = null;

  // 3. Para o intervalo de recálculo
  if (routeRecalculationInterval) {
    clearInterval(routeRecalculationInterval);
    routeRecalculationInterval = null;
  }
}
