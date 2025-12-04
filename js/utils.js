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
 * @returns {object} Os dados do pedido (cliente, items, raw).
 */
export function parseWhatsappMessage(text) {
  if (!text) return {};

  // Função para extrair valor de uma linha com base em um prefixo (ex: "Nome: ...")
  const extractValue = (prefix) => {
    const regex = new RegExp(`^${prefix}\\s*(.+)`, "im");
    const match = text.match(regex);
    return match ? match[1].trim() : "";
  };

  // Extrai os dados usando a função auxiliar
  const nomeCliente = extractValue("Nome:");
  const cep = extractValue("CEP:");
  const enderecoCompleto = extractValue("Endereço:");
  const bairro = extractValue("Bairro:");
  const cidade = extractValue("Cidade:");
  let dataEntrega = extractValue("Data de entrega:");
  const horarioEntrega = extractValue("Horário para entrega:");

  // Converte a data para o formato YYYY-MM-DD, se ela existir
  if (dataEntrega) {
    const parts = dataEntrega.split("/");
    if (parts.length === 3) {
      // Formato: DD/MM/YYYY -> YYYY-MM-DD
      dataEntrega = `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
  }

  // Extrai os itens do pedido
  const itemsSectionMatch = text.match(
    /--- ITENS DO PEDIDO ---\s*([\s\S]*?)\s*---/
  );
  let nomeBolo = "Item não extraído";
  if (itemsSectionMatch && itemsSectionMatch[1]) {
    const itemsText = itemsSectionMatch[1];
    const itemLines = itemsText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("-"));
    if (itemLines.length > 0) {
      // Pega o nome do primeiro item, removendo o traço inicial e detalhes em parênteses
      nomeBolo = itemLines[0]
        .replace(/^-/, "")
        .replace(/\(.*\)/, "")
        .trim();
    }
  }

  // Separa a rua e o número do endereço completo
  let rua = enderecoCompleto;
  let numero = "";
  const numeroMatch = enderecoCompleto.match(
    /(,?\s*(?:Nº|N|Numero|Número)\s*\.?\s*)(\d+.*)/i
  );
  if (numeroMatch) {
    rua = enderecoCompleto
      .substring(0, numeroMatch.index)
      .replace(/,$/, "")
      .trim();
    numero = numeroMatch[2].trim();
  }

  // Retorna um objeto plano, compatível com a função `fillOrderForm`
  return {
    nomeCliente,
    cep,
    rua,
    numero,
    bairro,
    cidade,
    nomeBolo, // Mapeado para o campo 'item' no formulário
    dataEntrega,
    horarioEntrega,
  };
}

function extractPhoneNumber(text) {
  // Regex para (XX) 9XXXX-XXXX ou XX 9XXXX-XXXX ou +XX XX XXXXX-XXXX, etc.
  const phoneMatch = text.match(
    /(\+?\d{2}\s?)?(\(?\d{2}\)?\s?)?9?\d{4}-?\d{4}/
  );
  return phoneMatch ? phoneMatch[0] : null;
}

function extractClientName(text, lines) {
  // Tenta extrair nome se houver um prefixo "Nome:" ou "Cliente:"
  const nameMatch = text.match(/nome[:\\-]\\s*([A-Za-zÀ-ú ]{2,40})/i);
  if (nameMatch) return nameMatch[1].trim();

  // Se não encontrar, assume que a primeira linha é o nome, a menos que pareça um item de pedido
  if (lines.length > 0) {
    const firstLine = lines[0].trim();
    if (
      !firstLine.match(/^(\d+)\s?[x×]/i) && // Não começa com quantidade x
      !firstLine.match(/^-\s*/) // Não começa com traço
    ) {
      return firstLine;
    }
  }

  return "Cliente";
}

function extractAddress(text, lines) {
  // Regex para Rua, Av, Avenida, Rodovia, etc. (mais específico)
  const addrMatch = text.match(
    /(rua|av|avenida|rodovia|rod|travessa|endereco)[:\\s]+([^\\n]+)/i
  );
  if (addrMatch) return addrMatch[2].trim();

  // Fallback: Procura por uma linha que contenha uma palavra-chave de endereço
  const addressKeywords = /(rua|av|avenida|rodovia|travessa|cep)/i;
  const addressLine = lines.find((l) => addressKeywords.test(l));

  return addressLine ? addressLine.trim() : null;
}

function extractItems(text, lines) {
  let items = [];

  // Tenta pegar itens com "x" ou "-"
  lines.forEach((l) => {
    // 1x Bolo de Morango
    const m1 = l.match(/^(\\d+)\\s?[x×]\\s?(.+)/i);
    // - Bolo de Morango
    const m2 = l.match(/^-\\s*(.+)/);

    if (m1) {
      const qty = parseInt(m1[1]);
      const nomeItem = m1[2].trim();
      items.push({ nome: nomeItem, qty, price: 0 });
    } else if (m2) {
      const nomeItem = m2[1].trim();
      items.push({ nome: nomeItem, qty: 1, price: 0 });
    }
  });

  // Se não encontrar itens, pode ser que a mensagem seja apenas um bolo
  if (items.length === 0 && lines.length > 0) {
    const isCake = lines.some((l) => /bolo|torta|doce/i.test(l));
    if (isCake) {
      items.push({
        nome: lines.find((l) => /bolo|torta|doce/i.test(l)).trim(),
        qty: 1,
        price: 0,
      });
    }
  }

  return items.filter((item) => item.nome); // Remove itens vazios
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
