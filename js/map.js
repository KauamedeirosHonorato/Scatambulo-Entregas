// js/map.js - Refatorado para MapLibre GL JS e com funcionalidade de tela cheia

let map;
let deliveryMarker;
let directions;
let clientMarker;
let mapStyleLoaded = false;
let mapOriginalStyle = null;
let satelliteMode = false;
let threeDEnabled = false;
let currentRouteGeometry = null;
let lastRouteOrigin = null;
let lastRouteDestination = null;
let destinationCoords = null; // Adicionado para armazenar as coordenadas do destino
let isInteractive = false; // Controla se o mapa pode ser manipulado pelo usuário
let followMode = true; // Controla o modo de seguimento da câmera

// Função utilitária para calcular a distância entre dois pontos (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // metros
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distância em metros
}

// Definição do estilo de satélite movida para o escopo global para fácil acesso.
const satelliteStyle = {
  version: 8,
  sources: {
    "sat-tiles": {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      attribution: "Esri World Imagery",
    },
  },
  layers: [
    {
      id: "sat-tiles",
      type: "raster",
      source: "sat-tiles",
      minzoom: 0,
      maxzoom: 19,
    },
  ],
};

const osmStyle = {
  version: 8,
  sources: {
    "raster-tiles": {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "&copy; OpenStreetMap Contributors",
    },
  },
  layers: [
    {
      id: "simple-tiles",
      type: "raster",
      source: "raster-tiles",
      minzoom: 0,
      maxzoom: 19,
    },
  ],
};

export async function initializeMap(
  elementId,
  center = [-51.9375, -23.4273],
  zoom = 15,
  initialSatelliteMode = false
) {
  try {
    if (map) return map;

    if (typeof maplibregl === "undefined") {
      console.error("Erro: A biblioteca MapLibre GL JS não foi carregada.");
      return;
    }

    // Decide qual estilo usar na inicialização
    const initialStyle = initialSatelliteMode ? satelliteStyle : osmStyle;

    map = new maplibregl.Map({
      interactive: true, // Inicia o mapa como interativo, a sobreposição controla o clique
      container: elementId,
      center: center,
      zoom: zoom,
      pitch: 0,
      style: initialStyle, // Usa o estilo decidido na criação
    });

    // Lógica para o overlay de interação e tela cheia
    const mapContainer = document.getElementById(elementId)?.parentElement;
    if (mapContainer) {
      // Adiciona um elemento de vídeo para a funcionalidade de tela cheia no iPhone
      const videoEl = document.createElement("video");
      videoEl.id = "iphone-fullscreen-video";
      videoEl.setAttribute("playsinline", ""); // Impede que o vídeo seja reproduzido em tela cheia automaticamente
      videoEl.style.display = "none"; // O vídeo não precisa ser visível
      mapContainer.appendChild(videoEl);

      const interactionOverlay = mapContainer.querySelector(
        ".map-interaction-overlay"
      );
      const loadingOverlay = mapContainer.querySelector(".map-loading-overlay");
      const fullscreenBtn = document.getElementById("map-fullscreen-btn");

      if (interactionOverlay && fullscreenBtn) {
        // Detecção mais robusta para iPhone/iPad/iPod
        const isIos =
          /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

        const handleIosFullscreen = () => {
          // Envolve a lógica em um try-catch para capturar exceções do DOM no iOS.
          try {
            // Verifica se o modo de tela cheia é suportado pelo elemento de vídeo
            if (videoEl.webkitSupportsFullscreen) {
              if (document.webkitFullscreenElement) {
                document.webkitExitFullscreen();
              } else {
                videoEl.webkitEnterFullscreen();
              }
            } else {
              // Fallback para o método padrão se a API de vídeo não for suportada
              toggleStandardFullscreen();
            }
          } catch (e) {
            console.error("Erro ao alternar tela cheia no iOS:", e);
            // Tenta o método padrão como último recurso em caso de erro
            toggleStandardFullscreen();
          }
        };

        const toggleStandardFullscreen = () => {
          const isFullscreen =
            document.fullscreenElement ||
            document.webkitFullscreenElement ||
            document.mozFullScreenElement ||
            document.msFullscreenElement;
    
          if (!isFullscreen) {
            if (mapContainer.requestFullscreen) mapContainer.requestFullscreen();
            else if (mapContainer.webkitRequestFullscreen)
              mapContainer.webkitRequestFullscreen(); // Safari
            else if (mapContainer.mozRequestFullScreen)
              mapContainer.mozRequestFullScreen(); // Firefox
            else if (mapContainer.msRequestFullscreen)
              mapContainer.msRequestFullscreen(); // IE/Edge
          } else {
            if (document.exitFullscreen) document.exitFullscreen();
            else if (document.webkitExitFullscreen)
              document.webkitExitFullscreen();
            else if (document.mozCancelFullScreen) document.mozCancelFullScreen();
            else if (document.msExitFullscreen) document.msExitFullscreen();
          }
        };

        const toggleFullscreen = isIos ? handleIosFullscreen : toggleStandardFullscreen;

        // Adiciona os listeners de forma segura
        if (fullscreenBtn) {
          fullscreenBtn.addEventListener("click", toggleFullscreen);
        }
        if (interactionOverlay) {
          interactionOverlay.addEventListener("click", toggleFullscreen);
        }

        // Handler para mudança de estado de tela cheia
        const onFullscreenChange = () => {
          let isFullscreen;
          if (isIos) {
            // Para iOS, verificamos o estado do elemento de vídeo
            isFullscreen = videoEl.webkitDisplayingFullscreen;
            // Adiciona/remove a classe de simulação para manter a estilização
            mapContainer.classList.toggle("fullscreen-iphone", isFullscreen);
          } else {
            // Para outros dispositivos, usamos a API padrão
            isFullscreen = !!(
              document.fullscreenElement ||
              document.webkitFullscreenElement ||
              document.mozFullScreenElement ||
              document.msFullscreenElement
            );
            // Adiciona ou remove uma classe genérica para estilização
            if (mapContainer) {
              mapContainer.classList.toggle("fullscreen", isFullscreen);
            }
          }

          const icon = fullscreenBtn.querySelector("i");

          // Atualiza a UI com base no estado de tela cheia
          if (isFullscreen) {
            // A interatividade agora é controlada pela sobreposição
            interactionOverlay.classList.add("hidden");
            if (icon) icon.className = "ph ph-arrows-in";
          } else {
            // A interatividade agora é controlada pela sobreposição
            interactionOverlay.classList.remove("hidden");
            if (icon) icon.className = "ph ph-arrows-out";
          }
          // Redimensiona o mapa em ambos os casos para garantir o ajuste correto
          map.resize();
        };

        // Adiciona listeners para os eventos de tela cheia
        document.addEventListener("fullscreenchange", onFullscreenChange);
        document.addEventListener("webkitfullscreenchange", onFullscreenChange);
        document.addEventListener("mozfullscreenchange", onFullscreenChange);
        document.addEventListener("MSFullscreenChange", onFullscreenChange);

        // Adiciona listeners específicos do WebKit para o elemento de vídeo no iOS
        videoEl.addEventListener("webkitbeginfullscreen", onFullscreenChange);
        videoEl.addEventListener("webkitendfullscreen", onFullscreenChange);
      }
    }

    const hideLoadingOverlay = () => {
      const loadingOverlay = document.querySelector(`#${elementId}`).parentElement.querySelector('.map-loading-overlay');
      if (loadingOverlay) {
        loadingOverlay.classList.remove("active");
      }
    };

    // Aguarda o carregamento do estilo antes de continuar
    await new Promise((resolve) => {
      map.once("load", () => {
        mapStyleLoaded = true;
        hideLoadingOverlay();
        console.log("Map style is loaded.");
        resolve();
      });
      if (map.isStyleLoaded()) {
        hideLoadingOverlay();
        resolve();
      }
    });

    // Create the main-route source and layer once after the style is loaded.
    // This implements the "create-once and setData" pattern to avoid creating
    // and removing layers repeatedly which causes ghost layers to persist.
    const ensureRouteSource = () => {
      try {
        if (!map.getSource("main-route")) {
          map.addSource("main-route", {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
          });
        }
        if (!map.getLayer("main-route-line")) {
          map.addLayer({
            id: "main-route-line",
            type: "line",
            source: "main-route",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: {
              "line-color": "#1b9af7",
              "line-width": 5,
              "line-opacity": 0.9,
            },
          });
        }

        // Adiciona a fonte e a camada de satélite, mas as mantém ocultas.
        if (!map.getSource("sat-tiles")) {
          map.addSource("sat-tiles", satelliteStyle.sources["sat-tiles"]);
        }
        if (!map.getLayer("sat-tiles")) {
          map.addLayer({
            id: "sat-tiles",
            type: "raster",
            source: "sat-tiles",
            layout: {
              visibility: "none", // Começa invisível
            },
          });
          // Move a camada de rota para cima da camada de satélite
          if (map.getLayer("main-route-line"))
            map.moveLayer("main-route-line", "sat-tiles");
        }
      } catch (e) {
        console.warn("initializeMap: não foi possível criar main-route:", e);
      }
    };

    if (map.isStyleLoaded()) {
      ensureRouteSource();
    } else {
      map.on("style.load", hideLoadingOverlay); // Garante que o overlay suma mesmo se o estilo for trocado
      map.on("style.load", ensureRouteSource);
    }

    // Instancia o plugin de direções somente depois do style carregar
    if (typeof MapLibreGlDirections !== "undefined") {
      try {
        directions = new MapLibreGlDirections(map, {
          api: "https://router.project-osrm.org/route/v1",
          profile: "driving",
          interactive: false,
          controls: { instructions: false, inputs: false },
        });
      } catch (e) {
        console.warn("Erro ao inicializar MapLibreGlDirections:", e);
      }
    } else {
      console.warn("Aviso: Plugin MapLibreGlDirections não carregado.");
    }

    // Tenta adicionar controles e camadas 3D caso possível
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(new maplibregl.ScaleControl(), "bottom-right");
    try {
      add3DBuildings();
    } catch (e) {
      console.warn("3D buildings não disponíveis:", e);
    }

    return map;
  } catch (error) {
    console.error("Erro fatal ao inicializar o mapa:", error);
    // You might want to show a user-facing error message here
    // For example: UI.showToast("Não foi possível carregar o mapa. Tente novamente.", "error");
    return null; // Ensure that 'map' is null if initialization fails
  }
}

export function updateDeliveryMarkerOnMap(location, destination) {
  if (!map) return;
  if (!location) {
    if (deliveryMarker) {
      deliveryMarker.remove();
      deliveryMarker = null;
    }
    return;
  }
  const latLng = [location.longitude, location.latitude];

  if (deliveryMarker) deliveryMarker.remove();

  const el = document.createElement("div");
  el.style.backgroundImage = "url('./CarroIcone/EntregadorDireita.png')";
  el.style.width = "60px";
  el.style.height = "60px";
  el.style.backgroundSize = "contain";
  el.style.backgroundRepeat = "no-repeat";

  if (location.heading) {
    // Ajusta a rotação. O ícone original aponta para a direita (90 graus).
    // O 'heading' do GPS é 0 para o Norte. Subtraímos 90 para alinhar o ícone.
    const rotation = location.heading - 90;
    el.style.transform = `rotate(${rotation}deg)`;
  }

  deliveryMarker = new maplibregl.Marker({ element: el })
    .setLngLat(latLng)
    .addTo(map);

  checkProximityToDestination(location);
}

let hasProximityAlertBeenShown = false;

function checkProximityToDestination(deliveryLocation) {
  if (!destinationCoords || !deliveryLocation || hasProximityAlertBeenShown)
    return;

  const distance = calculateDistance(
    deliveryLocation.latitude,
    deliveryLocation.longitude,
    destinationCoords.lat,
    destinationCoords.lon
  );

  if (distance <= 50) {
    // 50 metros
    // Dispara um evento personalizado em vez de um alert()
    const proximityEvent = new CustomEvent("proximity-alert", {
      detail: { distance: Math.round(distance) },
    });
    window.dispatchEvent(proximityEvent);
    hasProximityAlertBeenShown = true;
  }
}

export function resetProximityAlert() {
  hasProximityAlertBeenShown = false;
}

export function setFollowMode(enabled) {
  // This is a setter, not a getter
  followMode = !!enabled;
}

export function isFollowMode() {
  // This is the getter function
  return !!followMode;
}

function computeZoomFromSpeed(speed) {
  const speedKmh = (speed || 0) * 3.6;
  if (speedKmh < 5) return 18;
  if (speedKmh < 30) return 17;
  if (speedKmh < 50) return 16;
  return 15;
}

export function updateCameraForLocation(location) {
  if (!map || !location) return;
  try {
    const zoom = computeZoomFromSpeed(location.speed);
    const bearing = location.heading || map.getBearing();
    const pitch = threeDEnabled ? 60 : 45;

    map.easeTo({
      center: [location.longitude, location.latitude],
      bearing,
      zoom,
      pitch,
      duration: 800,
    });
  } catch (e) {
    console.warn("Erro ao atualizar câmera:", e);
  }
}

export function updateClientMarkerOnMap(coords, orderData = null) {
  if (!map) return;

  if (coords) {
    const clientLatLng = [coords.lon, coords.lat];
    if (clientMarker) clientMarker.remove();

    const el = document.createElement("div");
    el.style.backgroundImage = "url('./CarroIcone/cliente.png')";
    el.style.width = "40px";
    el.style.height = "40px";
    el.style.backgroundSize = "contain";
    el.style.cursor = "pointer";
    el.title = "Ver detalhes do pedido";

    clientMarker = new maplibregl.Marker({ element: el })
      .setLngLat(clientLatLng)
      .addTo(map);

    // Adiciona o listener de clique apenas se houver dados do pedido
    if (orderData) {
      el.addEventListener("click", (e) => {
        e.stopPropagation(); // Impede que o clique se propague para o mapa
        const event = new CustomEvent("client-marker-click", {
          bubbles: true, // Permite que o evento "borbulhe" até o document
          detail: { order: orderData },
        });
        el.dispatchEvent(event);
      });
    }
  } else if (clientMarker) {
    clientMarker.remove();
    clientMarker = null;
  }
}

export function setRoute(origin, destination) {
  // Use directions plugin if available (for UI + controls)
  // Store last origin/destination so we can re-request the route after
  // style changes (satellite/static) which may drop plugin layers.
  try {
    lastRouteOrigin = origin || null;
    lastRouteDestination = destination || null;
    destinationCoords = destination
      ? { lat: destination.lat, lon: destination.lon }
      : null; // Armazena as coordenadas do destino
  } catch (e) {}
  if (directions && typeof directions.setOrigin === "function") {
    // If directions plugin is used for UI, its methods would go here.
  }

  // Sempre solicita rota ao OSRM e desenha como GeoJSON (fallback/visual consistente)
  return requestRoute(origin, destination);
}

// Solicita uma rota ao OSRM e desenha no mapa como GeoJSON (linha azul)
export async function requestRoute(origin, destination) {
  if (!map || !origin || !destination) return null;

  try {
    const lon1 =
      origin.longitude ?? origin.lon ?? origin.lng ?? origin.longitude;
    const lat1 = origin.latitude ?? origin.lat ?? origin.lat ?? origin.latitude;
    const lon2 = destination.lon ?? destination.longitude ?? destination.lng;
    const lat2 = destination.lat ?? destination.latitude ?? destination.lat;

    if ([lon1, lat1, lon2, lat2].some((v) => v == null)) {
      console.warn("requestRoute: coordenadas inválidas", origin, destination);
      return null;
    }

    const url = `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn("OSRM request failed", res.status);
      return null;
    }
    const data = await res.json();
    if (!data || !data.routes || !data.routes.length) return null;
    const geometry = data.routes[0].geometry; // GeoJSON LineString

    // Desenha a rota retornada pelo OSRM usando nosso estilo
    currentRouteGeometry = geometry;
    drawMainRoute(geometry);

    return data.routes[0];
  } catch (e) {
    console.warn("Erro ao solicitar rota do OSRM:", e);
    return null;
  }
}

export function clearRoute() {
  if (directions) directions.clear();
}

export function clearActiveRoute() {
  // Limpa a linha da rota principal definindo seus dados como vazios
  try {
    if (map && map.getSource("main-route")) {
      map
        .getSource("main-route")
        .setData({ type: "FeatureCollection", features: [] });
    }
  } catch (e) {
    console.warn("Erro ao limpar a linha da rota principal:", e);
  }

  // Remove apenas o marcador do cliente
  try {
    if (clientMarker) {
      clientMarker.remove();
      clientMarker = null;
    }
  } catch (e) {
    console.warn("Erro ao remover marcador do cliente:", e);
  }

  // Limpa também o plugin de direções, se existir
  if (directions && typeof directions.clear === "function") {
    try {
      directions.clear();
    } catch (e) {
      console.warn("Erro ao limpar rota do plugin de direções:", e);
    }
  }

  currentRouteGeometry = null;
  lastRouteOrigin = null;
  lastRouteDestination = null;
}

// Limpa marcadores, rota principal e fontes adicionais do mapa
export function clearMap() {
  // Limpa rota do plugin, se existir
  if (directions && typeof directions.clear === "function") {
    try {
      directions.clear();
    } catch (e) {
      console.warn("Erro ao limpar rota do directions plugin:", e);
    }
  }

  // Remove marcadores personalizados
  try {
    if (deliveryMarker) {
      deliveryMarker.remove();
      deliveryMarker = null;
    }
    if (clientMarker) {
      clientMarker.remove();
      clientMarker = null;
    }
  } catch (e) {
    console.warn("Erro ao remover marcadores:", e);
  }

  // Remove fonte/layer da rota principal (caso exista).
  // Se o estilo ainda não foi carregado, aguarda o evento 'load' antes de remover fontes/layers.
  if (map && map.getStyle) {
    let cleanupRetries = 0;
    const doCleanup = () => {
      try {
        const style = map.getStyle() || {};
        const allLayers = style.layers || [];

        const layersToRemove = [];
        const sourcesToRemove = new Set();

        const layerPattern =
          /(route|directions|main-route|osrm|mirror|delivery|client|line)/i;

        // 1. Collect layers and their sources for removal
        allLayers.forEach((layer) => {
          if (layer && layer.id && (layerPattern.test(layer.id) || layer.type === "line")) {
            layersToRemove.push(layer.id);
            if (layer.source) {
              sourcesToRemove.add(layer.source);
            }
          }
        });

        // 2. Remove all collected layers first.
        layersToRemove.forEach((layerId) => {
          if (map.getLayer(layerId)) {
            try {
              map.removeLayer(layerId);
            } catch (e) { /* Ignore errors, maybe it was already removed */ }
          }
        });

        // 3. After layers are gone, it's safe to remove the sources.
        sourcesToRemove.forEach((sourceId) => {
          if (map.getSource(sourceId)) {
            try {
              map.removeSource(sourceId);
            } catch (e) {
              console.warn(`clearMap: Could not remove source '${sourceId}'. It might still be in use by a layer not caught by the filter. Error: ${e.message}`);
            }
          }
        });
      } catch (e) {
        console.warn("Erro durante limpeza de camadas/sources:", e);
      }

      // Remove marcadores personalizados
      try {
        if (deliveryMarker) {
          deliveryMarker.remove();
          deliveryMarker = null;
        }
        if (clientMarker) {
          clientMarker.remove();
          clientMarker = null;
        }
      } catch (e) {
        console.warn("Erro ao remover marcadores durante limpeza:", e);
      }

      // Limpa estado do plugin de direções
      try {
        if (directions && typeof directions.clear === "function") {
          try {
            directions.clear();
          } catch (e) {
            /* ignore */
          }
        }
      } catch (e) {
        /* ignore */
      }

      // Debug: lista remaining layers/sources após tentativa de limpeza
      try {
        const afterStyle = map.getStyle() || {};
        const layerIdsAfter = (afterStyle.layers || [])
          .map((l) => l && l.id)
          .filter(Boolean);
        const sourceIdsAfter = Object.keys(afterStyle.sources || {});
        console.debug("clearMap: remaining layers:", layerIdsAfter);
        console.debug("clearMap: remaining sources:", sourceIdsAfter);
        // Se ainda houver camadas relacionadas a rotas, tenta resetar o estilo e tentar de novo (uma vez)
        try {
          const stubborn = layerIdsAfter.filter((id) =>
            /(route|directions|main-route|osrm|line)/i.test(id)
          );
          if (stubborn.length && cleanupRetries < 1 && mapOriginalStyle) {
            cleanupRetries++;
            console.warn(
              "clearMap: camadas resistentes encontradas, reiniciando estilo original e tentando limpar de novo",
              stubborn
            );
            try {
              map.setStyle(mapOriginalStyle);
              map.once("load", () => {
                try {
                  doCleanup();
                } catch (e) {
                  /* ignore */
                }
              });
            } catch (e) {
              console.warn(
                "clearMap: falha ao resetar estilo para forçar limpeza",
                e
              );
            }
          }
        } catch (e) {
          /* ignore */
        }
      } catch (e) {
        console.debug(
          "clearMap: erro ao listar layers/sources após limpeza",
          e
        );
      }

      // Esvazia a fonte principal de rota ao invés de remover (melhor para evitar erros de estilo)
      try {
        if (map.getSource && map.getSource("main-route")) {
          try {
            map
              .getSource("main-route")
              .setData({ type: "FeatureCollection", features: [] });
          } catch (e) {
            // fallback: se setData não for suportado, tenta remover a source/layer
            try {
              if (map.getLayer && map.getLayer("main-route-line"))
                map.removeLayer("main-route-line");
            } catch (er) {}
            try {
              if (map.getSource && map.getSource("main-route"))
                map.removeSource("main-route");
            } catch (er) {}
          }
        }
      } catch (e) {
        /* ignore */
      }

      // Remove referência à geometria atual
      try {
        currentRouteGeometry = null;
      } catch (e) {}
    };

    if (map.isStyleLoaded && !map.isStyleLoaded()) {
      map.once("load", doCleanup);
    } else {
      doCleanup();
    }
  }
}
/**
 * Limpeza mais agressiva de rotas/resíduos no mapa.
 * Usa `clearMap()` e então executa uma segunda passada que remove quaisquer
 * layers/sources do tipo 'line' ou com nomes suspeitos. Como último recurso
 * tenta resetar o estilo original para forçar remoção de camadas resistentes.
 */
export function forceClearAllRoutes() {
  try {
    // Passo 1: limpeza normal
    clearMap();
  } catch (e) {
    console.warn("forceClearAllRoutes: erro ao executar clearMap():", e);
  }

  // Passo 2: segunda passagem mais agressiva
  try {
    if (!map || !map.getStyle) return;
    const style = map.getStyle() || {};
    const allLayers = style.layers || [];

    const layersToRemove = [];
    const sourcesToRemove = new Set();

    const layerPattern =
      /(route|directions|main-route|osrm|mirror|delivery|client|line|shadow|route-line)/i;

    // 1. Collect layers and their sources for removal
    allLayers.forEach((layer) => {
      if (layer && layer.id && (layerPattern.test(layer.id) || layer.type === "line")) {
        layersToRemove.push(layer.id);
        if (layer.source) {
          sourcesToRemove.add(layer.source);
        }
      }
    });

    // 2. Remove all collected layers first.
    layersToRemove.forEach((layerId) => {
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId);
      }
    });

    // 3. After layers are gone, it's safe to remove the sources.
    sourcesToRemove.forEach((sourceId) => {
      if (map.getSource(sourceId)) {
        map.removeSource(sourceId);
      }
    });
  } catch (e) {
    console.warn("forceClearAllRoutes: erro durante segunda passada:", e);
  }

  // Passo 3: se ainda houver camadas suspeitas, reinicia o estilo original
  try {
    const afterStyle = map.getStyle() || {};
    const remaining = (afterStyle.layers || [])
      .map((l) => l && l.id)
      .filter(Boolean);
    const stubborn = remaining.filter((id) =>
      /(route|directions|main-route|osrm|line)/i.test(id)
    );
    if (stubborn.length && mapOriginalStyle) {
      console.warn(
        "forceClearAllRoutes: camadas resistentes encontradas, resetando estilo:",
        stubborn
      );
      try {
        map.setStyle(mapOriginalStyle);
        map.once("load", () => {
          try {
            // garante que main-route exista e esteja vazia
            if (map.getSource && map.getSource("main-route")) {
              try {
                map
                  .getSource("main-route")
                  .setData({ type: "FeatureCollection", features: [] });
              } catch (e) {}
            }
          } catch (e) {}
        });
      } catch (e) {
        console.warn("forceClearAllRoutes: falha ao resetar estilo:", e);
      }
    }
  } catch (e) {
    /* ignore final pass errors */
  }

  // Limpa referência à geometria atual
  try {
    currentRouteGeometry = null;
  } catch (e) {}
}
// Desenha uma rota principal a partir de uma geometria GeoJSON ou array de coordenadas
export function drawMainRoute(geometry) {
  if (!map) return;

  // Se a geometria for nula, limpa a rota existente
  if (!geometry) {
    try {
      if (map.getSource && map.getSource("main-route")) {
        map.getSource("main-route").setData({ type: "FeatureCollection", features: [] });
      }
    } catch (e) {
      console.warn("Erro ao limpar a linha da rota principal:", e);
    }
    return;
  }
  
  // Se o estilo ainda não foi carregado, espera pelo evento 'load' antes de adicionar fontes/layers.
  if (map.isStyleLoaded && !map.isStyleLoaded()) {
    map.once("load", () => drawMainRoute(geometry));
    return;
  }

  // Suporta receber a geometria como objeto GeoJSON ou diretamente um array de coordenadas
  let geojson = null;
  if (geometry.type && geometry.coordinates) {
    geojson = geometry;
  } else if (Array.isArray(geometry)) {
    geojson = { type: "LineString", coordinates: geometry };
  } else if (geometry.geometry && geometry.geometry.coordinates) {
    geojson = geometry.geometry;
  } else {
    console.warn(
      "Formato de geometria desconhecido para drawMainRoute:",
      geometry
    );
    return;
  }

  // Atualiza a fonte existente da rota com a nova geometria (setData) — padrão de criação única
  try {
    const feature = { type: "Feature", geometry: geojson };
    if (map.getSource && map.getSource("main-route")) {
      try {
        map.getSource("main-route").setData(feature);
      } catch (e) {
        // Se setData falhar por algum motivo, tenta recriar a fonte/layer (fallback)
        try {
          if (map.getLayer && map.getLayer("main-route-line"))
            map.removeLayer("main-route-line");
        } catch (er) {}
        try {
          if (map.getSource && map.getSource("main-route"))
            map.removeSource("main-route");
        } catch (er) {}
        try {
          map.addSource("main-route", { type: "geojson", data: feature });
          map.addLayer({
            id: "main-route-line",
            type: "line",
            source: "main-route",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: {
              "line-color": "#1b9af7",
              "line-width": 5,
              "line-opacity": 0.9,
            },
          });
        } catch (er) {
          console.warn(
            "Erro ao recriar source/layer da rota como fallback:",
            er
          );
        }
      }
    } else {
      // Caso a source não exista (estilo muito customizado), cria normalmente
      try {
        map.addSource("main-route", { type: "geojson", data: feature });
        map.addLayer({
          id: "main-route-line",
          type: "line",
          source: "main-route",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": "#1b9af7",
            "line-width": 5,
            "line-opacity": 0.9,
          },
        });
      } catch (e) {
        console.warn("Erro ao adicionar layer/source da rota:", e);
      }
    }
  } catch (e) {
    console.warn("Erro ao atualizar fonte da rota:", e);
  }

  // Ajusta bounds para exibir a rota
  try {
    const coords = geojson.coordinates;
    if (coords && coords.length) {
      const bounds = coords.reduce((b, c) => {
        return b.extend(c);
      }, new maplibregl.LngLatBounds(coords[0], coords[0]));
      map.fitBounds(bounds, { padding: 80 });
    }
  } catch (e) {
    console.warn("Erro ao ajustar bounds da rota:", e);
  }
}

/**
 * Habilita/Desabilita modo satélite (troca o estilo do mapa).
 */
export function setSatelliteMode(enabled) {
  if (!map || !map.isStyleLoaded()) return;
  if (enabled === satelliteMode) return;

  satelliteMode = !!enabled;

  try {
    const satLayer = "sat-tiles";
    const baseLayer = "simple-tiles";

    if (enabled) {
      // Mostra satélite e esconde o mapa base
      if (map.getLayer(satLayer))
        map.setLayoutProperty(satLayer, "visibility", "visible");
      if (map.getLayer(baseLayer))
        map.setLayoutProperty(baseLayer, "visibility", "none");
    } else {
      // Mostra o mapa base e esconde o satélite
      if (map.getLayer(satLayer))
        map.setLayoutProperty(satLayer, "visibility", "none");
      if (map.getLayer(baseLayer))
        map.setLayoutProperty(baseLayer, "visibility", "visible");
    }

    // Garante que a camada de rota esteja sempre visível e no topo
    if (map.getLayer("main-route-line")) {
      map.moveLayer("main-route-line"); // Move para o topo das camadas
    }
  } catch (e) {
    console.warn("Erro ao trocar modo satélite:", e);
  }
}

/**
 * Tenta adicionar camada de prédios 3D se houver dados de building no estilo.
 */
export function add3DBuildings() {
  if (!map || !mapStyleLoaded) return;
  try {
    // Procura uma camada de 'building' existente para usar como base
    const buildingLayer = (map.getStyle().layers || []).find((l) =>
      /building/i.test(l.id)
    );
    if (!buildingLayer) return; // Não há dados de building neste estilo

    // Se já existe uma camada de extrusão, remove para re-criar
    if (map.getLayer("building-extrusion")) {
      try {
        map.removeLayer("building-extrusion");
      } catch (e) {}
    }

    map.addLayer({
      id: "building-extrusion",
      source: buildingLayer.source || buildingLayer.ref || buildingLayer.id,
      "source-layer": buildingLayer["source-layer"] || undefined,
      type: "fill-extrusion",
      paint: {
        "fill-extrusion-color": "#aaa",
        "fill-extrusion-height": ["get", "height"],
        "fill-extrusion-base": ["get", "min_height"],
        "fill-extrusion-opacity": 0.8,
      },
    });
  } catch (e) {
    console.warn("Não foi possível adicionar prédios 3D:", e);
  }
}

export function set3DMode(enabled) {
  threeDEnabled = !!enabled;
  if (!map) return;
  try {
    map.easeTo({ pitch: threeDEnabled ? 60 : 0, duration: 800 });
    if (threeDEnabled) add3DBuildings();

    // Recalculate route under new pitch/visuals to ensure layers/sources present
    if (lastRouteOrigin && lastRouteDestination) {
      try {
        console.debug("set3DMode: recalculating route due to 3D toggle");
        requestRoute(lastRouteOrigin, lastRouteDestination).catch((e) => {
          console.warn("set3DMode: requestRoute failed:", e);
        });
      } catch (e) {
        /* ignore */
      }
    }
  } catch (e) {
    console.warn("Erro ao alternar 3D:", e);
  }
}

export function invalidateMapSize() {
  if (!map) return;
  try {
    map.resize();
  } catch (e) {
    console.warn("Erro ao invalidar tamanho do mapa:", e);
  }
}

export function panMapTo({ latitude, longitude }) {
  if (!map || latitude == null || longitude == null) return;
  try {
    map.flyTo({ center: [longitude, latitude], zoom: map.getZoom() || 15 });
  } catch (e) {
    console.warn("Erro ao mover o mapa:", e);
  }
}

// Retorna uma Promise que resolve quando o estilo do mapa estiver carregado
export function whenStyleLoaded() {
  return new Promise((resolve) => {
    if (!map) return resolve();
    try {
      if ((map.isStyleLoaded && map.isStyleLoaded()) || mapStyleLoaded) {
        resolve();
      } else {
        map.once("load", () => resolve());
      }
    } catch (e) {
      // Se algo falhar, ainda assim resolve para não travar chamadas dependentes
      resolve();
    }
  });
}
export function fitMapToBounds(deliveryLocation, clientCoords) {
  if (!map || !deliveryLocation || !clientCoords) return;
  const bounds = new maplibregl.LngLatBounds(
    [deliveryLocation.longitude, deliveryLocation.latitude],
    [clientCoords.lon, clientCoords.lat]
  );
  map.fitBounds(bounds, { padding: 80 });
}

/**
 * Ativa o modo de tela cheia para o mapa, se não estiver ativo.
 * Isso é feito acionando programaticamente o botão de tela cheia.
 */
export function enterFullscreen() {
  const fullscreenBtn = document.getElementById("map-fullscreen-btn");
  if (fullscreenBtn) {
    const icon = fullscreenBtn.querySelector("i");
    // Se o ícone for 'arrows-out', não estamos em tela cheia, então podemos entrar.
    if (icon && icon.classList.contains("ph-arrows-out")) {
      fullscreenBtn.click();
    }
  }
}

/**
 * Desativa o modo de tela cheia para o mapa, se estiver ativo.
 * Isso é feito acionando programaticamente o botão de tela cheia.
 */
export function exitFullscreen() {
  const fullscreenBtn = document.getElementById("map-fullscreen-btn");
  if (fullscreenBtn) {
    const icon = fullscreenBtn.querySelector("i");
    // Se o ícone for 'arrows-in', estamos em tela cheia, então podemos sair.
    if (icon && icon.classList.contains("ph-arrows-in")) {
      fullscreenBtn.click();
    }
  }
}
