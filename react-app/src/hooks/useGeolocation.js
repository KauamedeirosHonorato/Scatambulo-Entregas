import { useEffect, useRef } from "react";
import { useDelivery } from "../contexts/DeliveryContext";
import { db, ref, set, update } from "../services/firebase";

export function useGeolocation() {
  const {
    setEntregadorLocation,
    setPreviousEntregadorLocation,
    activeDelivery,
  } = useDelivery();

  // 1. Truque do Ref: Permite ler o valor atual de activeDelivery dentro do
  // callback do GPS (que é criado apenas uma vez) sem recriar o listener.
  const activeDeliveryRef = useRef(activeDelivery);

  // Mantém a ref sempre sincronizada com o estado/contexto
  useEffect(() => {
    activeDeliveryRef.current = activeDelivery;
  }, [activeDelivery]);

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      console.error("Geolocalização não suportada.");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, heading, speed } = position.coords;

        const newLocation = {
          latitude,
          longitude,
          heading: heading || 0, // Se o dispositivo não tiver bússola, assume 0
          speed: speed || 0,
          timestamp: Date.now(),
        };

        // 2. Atualização de Estado Funcional
        // Usamos a função de callback do setter para garantir que temos o valor anterior real
        setEntregadorLocation((prevLocation) => {
          // Salva o anterior antes de substituir
          setPreviousEntregadorLocation(prevLocation);
          return newLocation;
        });

        // 3. Firebase: Atualização Global do Entregador
        // Nota: Em um app real, considere fazer um "throttle" (limitar envios a cada 5s)
        // para economizar gravações no banco.
        set(ref(db, "localizacao/entregador"), newLocation).catch((err) =>
          console.error("Erro ao salvar no Firebase:", err)
        );

        // 4. Firebase: Atualização Específica do Pedido
        const currentDelivery = activeDeliveryRef.current;
        if (currentDelivery && currentDelivery.orderId) {
          // Padronizei para 'lon' para bater com seus outros arquivos
          update(ref(db, `entregas_ativas/${currentDelivery.orderId}`), {
            lastLocation: {
              lat: latitude,
              lon: longitude, // Alterado de 'lng' para 'lon' para consistência
              ts: Date.now(),
            },
          }).catch((err) => console.error("Erro ao atualizar entrega:", err));
        }
      },
      (error) => console.error("Erro de geolocalização:", error),
      {
        enableHighAccuracy: true, // Usa GPS real
        timeout: 10000, // Espera 10s antes de dar erro
        maximumAge: 0, // Não aceita cache, quer posição fresca
      }
    );

    // Cleanup: Só roda quando o componente desmonta (fecha o app/sai da tela)
    return () => navigator.geolocation.clearWatch(watchId);

    // Dependências vazias [] ou apenas os setters garantem que o watchPosition
    // inicie apenas UMA vez na montagem do componente.
  }, [setEntregadorLocation, setPreviousEntregadorLocation]);
}
