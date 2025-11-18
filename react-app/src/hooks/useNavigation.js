import { useState, useEffect, useRef } from "react";
import { getRouteDetails } from "../utils/map";
import { useDelivery } from "../contexts/DeliveryContext";

export function useNavigation() {
  const { activeDelivery, entregadorLocation } = useDelivery();
  const [route, setRoute] = useState(null);

  // 1. Usamos uma Ref para rastrear a localização sem disparar re-renders no efeito do intervalo
  const locationRef = useRef(entregadorLocation);

  // Mantém a ref sempre atualizada com a última posição do GPS
  useEffect(() => {
    locationRef.current = entregadorLocation;
  }, [entregadorLocation]);

  useEffect(() => {
    // Se não tem entrega, limpa a rota
    if (!activeDelivery) {
      setRoute(null);
      return;
    }

    // Se já temos uma geometria estática salva no pedido (ex: recuperada do banco), usamos ela
    if (activeDelivery.entrega && activeDelivery.entrega.geometria) {
      setRoute({ geometry: activeDelivery.entrega.geometria });
      return;
    }

    // Função para calcular a rota
    const fetchRoute = async () => {
      const currentLoc = locationRef.current;
      const clientLoc = activeDelivery.cliente;

      // Validações de segurança
      if (!currentLoc || !clientLoc?.lat || !clientLoc?.lon) {
        return;
      }

      // Normalização de coordenadas (Lat/Lon vs Latitude/Longitude)
      // O helper getRouteDetails (que corrigimos antes) espera { lat, lon }
      const startCoords = {
        lat: currentLoc.latitude,
        lon: currentLoc.longitude,
      };

      const endCoords = {
        lat: clientLoc.lat,
        lon: clientLoc.lon,
      };

      const routeDetails = await getRouteDetails(startCoords, endCoords);

      if (routeDetails && !routeDetails.error) {
        setRoute(routeDetails);
      } else {
        console.warn("Falha ao atualizar rota:", routeDetails?.error);
      }
    };

    // Chama imediatamente ao montar ou mudar de entrega
    fetchRoute();

    // 2. Configura o intervalo para atualizar a cada 20 segundos
    // Aumentei para 20s para ser gentil com a API pública do OSRM
    const intervalId = setInterval(fetchRoute, 20000);

    return () => clearInterval(intervalId);

    // NOTA: Removemos 'entregadorLocation' das dependências para evitar
    // recriar o intervalo a cada passo do motorista.
  }, [activeDelivery?.orderId]);

  return route;
}
