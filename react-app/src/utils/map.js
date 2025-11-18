/**
 * Converte um endereço de texto em coordenadas geográficas.
 * @param {string} address - O endereço a ser geocodificado.
 * @returns {Promise<object>} Objeto com {lat, lon} ou {error}.
 */
export async function geocodeAddress(address) {
  if (!address) {
    return { error: "Endereço não fornecido." };
  }

  // Função auxiliar interna para realizar a busca
  const doSearch = async (query) => {
    // Adiciona ", Brasil" apenas se não houver menção explícita para evitar buscas globais erradas
    const searchQuery = query.toLowerCase().includes("brasil")
      ? query
      : `${query}, Brasil`;

    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      searchQuery
    )}&limit=1`;

    try {
      const response = await fetch(url, {
        headers: {
          // O User-Agent é OBRIGATÓRIO para o Nominatim não bloquear sua requisição
          "User-Agent": "AngelaEncomendas/1.0",
        },
      });

      if (!response.ok) return null;

      const data = await response.json();
      if (data && data.length > 0) {
        return {
          lat: parseFloat(data[0].lat),
          lon: parseFloat(data[0].lon),
        };
      }
      return null;
    } catch (error) {
      console.error("Erro na requisição ao Nominatim:", error);
      return null;
    }
  };

  // 1. Tenta buscar pelo endereço completo fornecido
  let result = await doSearch(address);
  if (result) return result;

  // 2. Fallback: Se falhar, tenta extrair e buscar apenas pelo CEP
  const cepMatch = address.match(/\d{5}-?\d{3}/);
  if (cepMatch) {
    console.warn("Endereço exato não encontrado. Buscando pelo CEP...");
    result = await doSearch(cepMatch[0]);
    if (result) return result;
  }

  return { error: "Endereço não encontrado no mapa." };
}

/**
 * Obtém detalhes da rota entre dois pontos.
 * @param {object} startCoords - {lat, lon}
 * @param {object} endCoords - {lat, lon}
 * @returns {Promise<object>} Detalhes da rota ou {error}.
 */
export async function getRouteDetails(startCoords, endCoords) {
  // Verificação robusta de propriedades
  if (
    !startCoords?.lat ||
    !startCoords?.lon ||
    !endCoords?.lat ||
    !endCoords?.lon
  ) {
    return { error: "Coordenadas inválidas ou ausentes." };
  }

  // Nota: A ordem no OSRM é longitude,latitude
  const startStr = `${startCoords.lon},${startCoords.lat}`;
  const endStr = `${endCoords.lon},${endCoords.lat}`;

  const url = `https://router.project-osrm.org/route/v1/driving/${startStr};${endStr}?overview=full&geometries=geojson`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.code === "Ok" && data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      return {
        geometry: route.geometry,
        distance: (route.distance / 1000).toFixed(1), // Metros para Km
        duration: Math.round(route.duration / 60), // Segundos para Minutos
      };
    } else {
      return { error: "Não foi possível calcular a rota." };
    }
  } catch (error) {
    console.error("Erro ao obter rota:", error);
    return { error: "Falha ao contatar o serviço de rotas." };
  }
}
