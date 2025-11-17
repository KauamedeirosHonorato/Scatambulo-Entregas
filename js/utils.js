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
    } else {
      console.warn("Geocoding returned no results for address:", address);
      return { error: "No geocoding results" };
    }
  } catch (error) {
    console.error("Erro de geocodificação:", error);
    return { error: error.message };
  }
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
    } else {
      console.warn("Route details returned no valid routes:", data);
      return { error: "No valid route found" };
    }
  } catch (error) {
    console.error("Erro ao obter rota:", error);
    return { error: error.message };
  }
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

  return parseFloat((dist / timeDiffHours).toFixed(1)); // km/h
}

/**
 * Analisa uma mensagem de texto do WhatsApp para extrair detalhes do pedido.
 * @param {string} text - A mensagem do WhatsApp.
 * @returns {object} Um objeto com os detalhes do pedido.
 */
export function parseWhatsappMessage(text) {
  const normalizedText = text.replace(/\r/g, "").trim();
  const lines = normalizedText.split("\n").map((l) => l.trim()).filter(Boolean);

  const phone = extractPhoneNumber(normalizedText);
  const name = extractClientName(normalizedText, lines);
  const address = extractAddress(normalizedText);
  const items = extractItems(normalizedText, lines);

  return {
    cliente: { nome: name, telefone: phone, enderecoRaw: address },
    itens,
    raw: text,
  };
}

function extractPhoneNumber(text) {
  const phoneMatch = text.match(/(\+?\d{2}\s?)?(\(?\d{2}\)?\s?)?9?\d{4}-?\d{4}/);
  return phoneMatch ? phoneMatch[0] : null;
}

function extractClientName(text, lines) {
  const nameMatch = text.match(/nome[:\-]\s*([A-Za-zÀ-ú ]{2,40})/i);
  return nameMatch ? nameMatch[1].trim() : lines[0] || "Cliente";
}

function extractAddress(text) {
  const addrMatch = text.match(
    /(rua|av|avenida|rodovia|rod|travessa)\s+([^\n,]+)/i
  );
  return addrMatch ? addrMatch[0] : null;
}

function extractItems(text, lines) {
  let items = [];
  
  // Tenta pegar itens com "x" ou "-"
  lines.forEach((l) => {
    const m = l.match(/^(\d+)\s?[x×]\s?(.+)/i) || l.match(/^-\s*(.+)/);
    if (m) {
      const qty = m[1] ? parseInt(m[1]) : 1;
      const nomeItem = m[2] || m[1];
      items.push({ nome: nomeItem.trim(), qty, price: 0 });
    }
  });

  // Se não houver itens, tenta pegar depois de "pedido:" ou "itens:"
  if (items.length === 0) {
    const itensBlock = text.split(/pedido:|itens:|pedido -/i)[1];
    if (itensBlock) {
      itensBlock.split(/[,\n;]/).forEach((part) => {
        const m = part.trim().match(/^(\d+)?\s*(.+)/);
        if (m && m[2])
          items.push({ nome: m[2].trim(), qty: m[1] ? parseInt(m[1]) : 1, price: 0 });
      });
    }
  }
  
  return items;
}
