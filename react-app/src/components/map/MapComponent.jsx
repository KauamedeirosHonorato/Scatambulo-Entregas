import React, { useEffect, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  GeoJSON,
  useMap,
} from "react-leaflet";
import { useDelivery } from "../../contexts/DeliveryContext";
import { useNavigation } from "../../hooks/useNavigation";
import L from "leaflet";
import "leaflet-rotatedmarker";

// --- Custom Icons ---
const driverIcon = new L.Icon({
  iconUrl: "/Versa2025.png",
  iconSize: [40, 40],
  iconAnchor: [20, 20], // Ajustei para o centro (metade do size) para rotação correta
});

const clientIcon = new L.Icon({
  iconUrl: "/cliente.png",
  iconSize: [40, 40],
  iconAnchor: [20, 40], // Ponto na base do ícone (padrão para pinos)
});

// --- Child Components for Map Logic ---

// 1. Rotated Marker for the Driver
function RotatedMarker({ position, icon, rotation }) {
  const markerRef = useRef(null);

  useEffect(() => {
    if (markerRef.current) {
      // Verifica se o plugin adicionou o método setRotationAngle
      if (typeof markerRef.current.setRotationAngle === "function") {
        markerRef.current.setRotationAngle(rotation);
      }
    }
  }, [rotation]);

  return <Marker ref={markerRef} position={position} icon={icon} />;
}

// 2. Component to auto-fit bounds when a route is active
function FitBoundsToRoute() {
  const map = useMap();
  const { activeDelivery, entregadorLocation } = useDelivery();

  useEffect(() => {
    // Garante que temos todas as coordenadas necessárias
    if (
      activeDelivery?.cliente?.lat &&
      activeDelivery?.cliente?.lon &&
      entregadorLocation
    ) {
      const driverLatLng = [
        entregadorLocation.latitude,
        entregadorLocation.longitude,
      ];
      const clientLatLng = [
        activeDelivery.cliente.lat,
        activeDelivery.cliente.lon,
      ]; // CORREÇÃO AQUI (lon)

      const bounds = L.latLngBounds([driverLatLng, clientLatLng]);
      map.fitBounds(bounds, { padding: [50, 50] }); // Padding em pixels é mais seguro que pad(0.1)
    } else if (entregadorLocation) {
      map.setView(
        [entregadorLocation.latitude, entregadorLocation.longitude],
        15
      );
    }
  }, [activeDelivery, entregadorLocation, map]);

  return null;
}

// --- Main Map Component ---

export default function MapComponent() {
  const { entregadorLocation, activeDelivery } = useDelivery();
  const route = useNavigation();

  const driverPosition = entregadorLocation
    ? [entregadorLocation.latitude, entregadorLocation.longitude]
    : null;

  return (
    <MapContainer
      center={[-23.55052, -46.633308]}
      zoom={14}
      className="w-full h-full z-0" // Certifique-se que o pai tem altura definida!
      zoomControl={false}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution="&copy; OpenStreetMap contributors &copy; CARTO"
      />

      <FitBoundsToRoute />

      {/* Driver's Marker */}
      {driverPosition && (
        <RotatedMarker
          position={driverPosition}
          icon={driverIcon}
          rotation={entregadorLocation.heading || 0}
        />
      )}

      {/* Client's Marker */}
      {/* CORREÇÃO: Usando .lon em vez de .lng para bater com o código anterior */}
      {activeDelivery?.cliente?.lat && activeDelivery?.cliente?.lon && (
        <Marker
          position={[activeDelivery.cliente.lat, activeDelivery.cliente.lon]}
          icon={clientIcon}
        />
      )}

      {/* Route Geometry */}
      {/* DICA: A prop 'key' força o componente a redesenhar quando a rota muda */}
      {route && route.geometry && (
        <GeoJSON
          key={JSON.stringify(route.geometry)}
          data={route.geometry}
          style={{ color: "#34d399", weight: 5, opacity: 0.8 }}
        />
      )}
    </MapContainer>
  );
}
