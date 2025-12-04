/**
 * js/utils.js
 * Funções de utilidade para geocoding, cálculo de distância e parsing de mensagens.
 */

// URL padrão do servidor OSRM (Open Source Routing Machine)
const OSRM_SERVER_URL = "https://router.project-osrm.org/route/v1/driving/";

/**
 * Converte um endereço em coordenadas usando a API Nominatim.
 */
export async function geocodeAddress(address) {
  try {
    if (!address) return { error: "Endereço vazio" };

    // Remove prefixos como 'CEP:' para melhorar a busca
    let cleaned = address.replace(/cep[:\s]*/i, "").trim();
    // Se o usuário não especificou cidade, adiciona Maringá por padrão
    if (!/maring[aá]/i.test(cleaned)) {
      cleaned = `${cleaned}, Maringá, PR, Brasil`;
    }

    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      cleaned
    )}&limit=1&addressdetails=1&accept-language=pt-BR`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "EntregadorApp/1.0",
      },
    });

    const data = await response.json();

    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon),
        display_name: data[0].display_name,
        raw: data[0],
      };
    } else {
      return { error: "Endereço não encontrado", raw: data, query: cleaned };
    }
  } catch (error) {
    console.error("Erro no geocoding:", error);
    return { error: "Erro de conexão", rawError: String(error) };
  }
}

/**
 * Calcula a rota entre dois pontos usando OSRM.
 * @param {object} origin - {lon, lat}
 * @param {object} destination - {lon, lat}
 */
export async function getRoute(origin, destination) {
  const url = `${OSRM_SERVER_URL}${origin.lon},${origin.lat};${destination.lon},${destination.lat}?overview=full&geometries=geojson&steps=false`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.code === "Ok" && data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      return {
        distance: route.distance, // em metros
        duration: route.duration, // em segundos
        geometry: route.geometry,
      };
    } else {
      console.error("Erro ao obter rota:", data);
      return { error: "Não foi possível calcular a rota." };
    }
  } catch (error) {
    console.error("Erro na comunicação com o OSRM:", error);
    return { error: "Erro de rede ao calcular a rota." };
  }
}

/**
 * Converte distância de metros para km com 2 casas decimais.
 */
export function formatDistance(distanceInMeters) {
  return (distanceInMeters / 1000).toFixed(2);
}

/**
 * Calcula a velocidade em km/h com base na mudança de localização.
 * @param {object} loc1 - {lat, lon, timestamp}
 * @param {object} loc2 - {lat, lon, timestamp}
 * @returns {number} Velocidade em km/h.
 */
export function calculateSpeed(loc1, loc2) {
  if (!loc1 || !loc2) return 0;
  if (loc1.timestamp === loc2.timestamp) return 0;

  const distanceKm = calculateDistance(loc1, loc2); // Distância em km

  const timeDiffHours = (loc2.timestamp - loc1.timestamp) / (1000 * 60 * 60); // Diferença de tempo em horas

  if (timeDiffHours === 0) return 0;

  return Math.round(distanceKm / timeDiffHours);
}

/**
 * Calcula a distância Haversine entre dois pontos de GPS.
 * @param {object} loc1 - {lat, lon}
 * @param {object} loc2 - {lat, lon}
 * @returns {number} Distância em km.
 */
export function calculateDistance(loc1, loc2) {
  const R = 6371; // Raio da Terra em km
  const dLat = ((loc2.lat - loc1.lat) * Math.PI) / 180;
  const dLon = ((loc2.lon - loc1.lon) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((loc1.lat * Math.PI) / 180) *
      Math.cos((loc2.lat * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c; // Distância em km
  return distance;
}

/**
 * Analisa uma mensagem de WhatsApp para extrair dados de pedido.
 * Esta função foi refinada para ser mais robusta.
 * @param {string} text - O texto completo da mensagem.
 * @returns {object} Os dados do pedido.
 */
export function parseWhatsappMessage(text) {
  if (!text) return {};

  const extractedData = {};

  // Helper to extract a value based on a label
  const extractField = (labelText, targetKey, transform = (v) => v) => {
    const regex = new RegExp(`${labelText}:\\s*([^\\n\\r]*)`, 'im');
    const match = text.match(regex);
    if (match && match[1]) {
      extractedData[targetKey] = transform(match[1].trim());
    } else {
      extractedData[targetKey] = ''; // Ensure field always exists
    }
  };

  // Extract ITENS DO PEDIDO
  const itemsSectionMatch = text.match(/--- ITENS DO PEDIDO ---\s*([\s\S]*?)(?=\n---|\n\n|$)/im);
  if (itemsSectionMatch && itemsSectionMatch[1]) {
    const itemLines = itemsSectionMatch[1].split('\n').map(line => line.trim()).filter(line => line.length > 0);
    if (itemLines.length > 0) {
      // Assuming the first non-empty line after ITENS DO PEDIDO is the main item
      let firstItem = itemLines[0].replace(/^-/, '').trim();
      // Remove content in parentheses, e.g., "(Oval 1kg (sem custo))"
      firstItem = firstItem.replace(/\s*\(.*\)/g, '').trim();
      extractedData.nomeBolo = firstItem;
    } else {
      extractedData.nomeBolo = '';
    }
  } else {
    extractedData.nomeBolo = '';
  }

  // Extract DADOS PARA ENTREGA
  extractField('Nome', 'nomeCliente');
  extractField('Data de entrega', 'dataEntrega', (dateStr) => {
    // Convert DD/MM/YYYY to YYYY-MM-DD
    if (dateStr.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
      const [day, month, year] = dateStr.split('/');
      return `${year}-${month}-${day}`;
    }
    return dateStr;
  });
  extractField('Horário para entrega', 'horarioEntrega');
  extractField('CEP', 'cep');
  extractField('Endereço', 'enderecoCompleto');
  extractField('Bairro', 'bairro');
  extractField('Cidade', 'cidade');

  // Derive Rua and Número from Endereço
  let rua = extractedData.enderecoCompleto || '';
  let numero = '';

  // Try to extract a number from the end of the address string, preceded by common number indicators or just a space/comma
  const numeroRegex = /(?:,\s*|\s*)[Nn]º?\s*(\d+[a-zA-Z]?)\s*$/; // e.g., ", Nº 259" or " Nº259" or " 259" at the end
  const matchNumeroEnd = rua.match(numeroRegex);

  if (matchNumeroEnd) {
    numero = matchNumeroEnd[1].trim();
    rua = rua.substring(0, matchNumeroEnd.index).trim(); // Remove the number part from rua
    // Clean up trailing commas from rua if any
    if (rua.endsWith(',')) {
      rua = rua.slice(0, -1).trim();
    }
  }
  extractedData.rua = rua;
  extractedData.numero = numero;

  // Set default empty values for fields not found in the example
  extractedData.emailCliente = '';
  extractedData.whatsapp = ''; // Assuming WhatsApp number is not in this specific message format
  extractedData.estado = ''; // Not in message example
  extractedData.complemento = ''; // Not in message example

  // Clean up any extra properties
  delete extractedData.enderecoCompleto;

  return extractedData;
}

/**
 * Cria uma função "debounced" que atrasa a invocação de `func` até que `delay` milissegundos
 * tenham se passado desde a última vez que a função "debounced" foi invocada.
 * @param {Function} func A função para "debounce".
 * @param {number} delay O número de milissegundos para atrasar.
 * @returns {Function} Retorna a nova função "debounced".
 */
export function debounce(func, delay) {
  let timeout;
  return function (...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), delay);
  };
}

/**
 * Imprime o conteúdo HTML em um iframe oculto para não abrir nova janela.
 * @param {string} content - O HTML a ser impresso.
 */
export function printViaIframe(content) {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'absolute';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  doc.write(content);
  doc.close();

  // A slight delay is sometimes necessary for the document to be fully parsed in the iframe.
  setTimeout(() => {
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    
    // The timeout for removal is a workaround for some browsers where 
    // the print dialog blocks script execution.
    setTimeout(() => {
      document.body.removeChild(iframe);
    }, 500);
  }, 50);
}
