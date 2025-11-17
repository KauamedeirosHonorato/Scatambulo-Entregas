import { geocodeAddress, getRouteDetails, calculateSpeed } from "./utils.js";

let map;
let deliveryMarker;
let routeLayer;
let clientMarker;

export function initMap(elementId) {
  map = L.map(elementId).setView([-23.5505, -46.6333], 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
  return map;
}

export function updateDeliveryMarkerOnMap(location) {
  if (location && map) {
    const { latitude, longitude } = location;
    const latLng = [latitude, longitude];

    if (deliveryMarker) {
      deliveryMarker.setLatLng(latLng);
    } else {
      deliveryMarker = L.marker(latLng, {
        icon: L.icon({
          iconUrl: "/CarroIcone/Versa2025.png",
          iconSize: [70, 70],
          iconAnchor: [35, 55],
        }),
      }).addTo(map);
    }
    return deliveryMarker;
  }
  return null;
}

export function updateClientMarkerOnMap(coords) {
    if (clientMarker) map.removeLayer(clientMarker);
    if(coords){
        const clientLatLng = [coords.lat, coords.lon];
        clientMarker = L.marker(clientLatLng, {
            icon: L.icon({
            iconUrl: "/CarroIcone/cliente.png",
            iconSize: [50, 50],
            iconAnchor: [25, 50],
            }),
        }).addTo(map);
    }
}

export function fitMapToBounds(deliveryLocation, clientCoords) {
    if(deliveryLocation && clientCoords){
        const deliveryLatLng = [deliveryLocation.latitude, deliveryLocation.longitude];
        const clientLatLng = [clientCoords.lat, clientCoords.lon];
        const bounds = L.latLngBounds([deliveryLatLng, clientLatLng]);
        map.fitBounds(bounds.pad(0.2));
    } else if(deliveryLocation){
        map.setView([deliveryLocation.latitude, deliveryLocation.longitude], 15);
    }
}

export function drawRouteOnMap(geometry) {
  if (routeLayer) {
    map.removeLayer(routeLayer);
  }
  if (geometry) {
    routeLayer = L.geoJSON(geometry, {
      style: { color: "#007bff", weight: 5 },
    }).addTo(map);
  }
}

export function clearRouteFromMap() {
    if (routeLayer) {
        map.removeLayer(routeLayer);
        routeLayer = null;
    }
}
