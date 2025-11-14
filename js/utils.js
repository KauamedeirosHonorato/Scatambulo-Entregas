/**
 * Converte um endereço em coordenadas usando a API Nominatim.
 */
export async function geocodeAddress(address) {
  const addressForQuery = address.split(", CEP:")[0]; // Remove a parte do CEP para melhorar a busca
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        addressForQuery
      )}`
    );
    const data = await response.json();
    if (data && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
    }
  } catch (error) {
    console.error("Erro de geocodificação:", error);
  }
  return null;
}

/**
 * Obtém detalhes da rota (distância, duração e geometria) usando a API OSRM.
 */
export async function getRouteDetails(startCoords, endCoords) {
  const url = `https://router.project-osrm.org/route/v1/driving/${startCoords.longitude},${startCoords.latitude};${endCoords.lon},${endCoords.lat}?overview=full&geometries=geojson`;
  try {
    const response = await fetch(url);
    const data = await response.json();
    if (data.code === "Ok" && data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      const geometry = route.geometry; // Geometria da rota para desenhar no mapa
      const distance = (route.distance / 1000).toFixed(1); // Distância em km
      const duration = Math.round(route.duration / 60); // Duração em minutos
      return { distance, duration, geometry };
    }
  } catch (error) {
    console.error("Erro ao obter rota:", error);
  }
  return null;
}

/**
 * Calcula a distância entre duas coordenadas usando a fórmula de Haversine.
 */
export function calcularDistancia(lat1, lon1, lat2, lon2) {
  const R = 6371; // Raio da Terra em km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Retorna em km
}

/**
 * Calcula a velocidade em km/h entre dois pontos com timestamp.
 * @param {object} newLoc - Nova localização { latitude, longitude, timestamp }
 * @param {object} oldLoc - Antiga localização { latitude, longitude, timestamp }
 * @returns {number} Velocidade em km/h, ou 0 se não houver oldLoc.
 */
export function calculateSpeed(newLoc, oldLoc) {
  if (!oldLoc || !newLoc || !newLoc.timestamp || !oldLoc.timestamp) return 0;

  const dist = calcularDistancia(
    oldLoc.latitude,
    oldLoc.longitude,
    newLoc.latitude,
    newLoc.longitude
  );
  const timeDiffHours = (newLoc.timestamp - oldLoc.timestamp) / 3600000; // Diferença de tempo em horas

  if (timeDiffHours === 0) return 0; // Evita divisão por zero

  return (dist / timeDiffHours).toFixed(1); // km/h
}
