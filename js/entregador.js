import { db, ref, set } from './firebase.js';

document.addEventListener('DOMContentLoaded', () => {
    // Proteção de rota: verifica se o usuário logado é o Alexandre
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    if (!currentUser || currentUser.panel !== 'entregador.html') {
        window.location.href = 'index.html';
        return;
    }

    // --- Seleção dos Elementos do DOM ---
    const logoutButton = document.getElementById('logout-button');
    const locationStatus = document.getElementById('location-status');
    const permissionActions = document.getElementById('permission-actions');

    let map;
    let marker;

    // --- INICIALIZAÇÃO ---
    setupEventListeners();
    initMap();
    checkGeolocationPermission();

    /**
     * Configura os ouvintes de eventos para a página.
     */
    function setupEventListeners() {
        logoutButton.addEventListener('click', () => {
            localStorage.removeItem('currentUser');
            window.location.href = 'index.html';
        });
    }

    /**
     * Inicializa o mapa Leaflet.
     */
    function initMap() {
        const mapElement = document.getElementById('map');
        if (!mapElement) return; // Sai se o elemento do mapa não for encontrado

        map = L.map(mapElement).setView([-23.5505, -46.6333], 13); // Ponto inicial (São Paulo)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);
    }

    /**
     * Verifica o status da permissão de geolocalização e age de acordo.
     */
    function checkGeolocationPermission() {
        if (!window.isSecureContext) {
            locationStatus.textContent = 'Erro de segurança: A geolocalização só funciona em páginas seguras (HTTPS).';
            return;
        }

        if ('geolocation' in navigator && 'permissions' in navigator) {
            navigator.permissions.query({ name: 'geolocation' }).then(permissionStatus => {
                updateUIForPermission(permissionStatus.state);
                permissionStatus.onchange = () => {
                    updateUIForPermission(permissionStatus.state);
                };
            });
        } else {
            // Fallback para navegadores mais antigos sem a API de Permissões
            startWatchingLocation();
        }
    }

    /**
     * Atualiza a interface do usuário com base no estado da permissão.
     * @param {string} state - O estado da permissão ('granted', 'prompt', ou 'denied').
     */
    function updateUIForPermission(state) {
        permissionActions.innerHTML = ''; // Limpa ações anteriores

        switch (state) {
            case 'granted':
                locationStatus.textContent = 'Permissão concedida. Iniciando monitoramento...';
                startWatchingLocation();
                break;
            case 'prompt':
                locationStatus.textContent = 'Este aplicativo precisa da sua localização para funcionar.';
                const grantButton = document.createElement('button');
                grantButton.textContent = 'Ativar Localização';
                grantButton.className = 'btn-primary';
                grantButton.onclick = () => {
                    // Ao clicar, o navegador mostrará o aviso para aceitar ou rejeitar
                    startWatchingLocation();
                };
                permissionActions.appendChild(grantButton);
                break;
            case 'denied':
                locationStatus.textContent = 'Permissão de localização negada. Por favor, habilite o acesso nas configurações do seu navegador e do seu celular para continuar.';
                break;
        }
    }

    /**
     * Inicia o monitoramento da localização do dispositivo.
     */
    function startWatchingLocation() {
        // Geolocation API requer um contexto seguro (HTTPS) na maioria dos navegadores modernos.
        if (!window.isSecureContext) {
            locationStatus.textContent = 'Erro de segurança: A geolocalização só funciona em páginas seguras (HTTPS).';
            return;
        }

        if ('geolocation' in navigator) {
            navigator.geolocation.watchPosition(
                (position) => { // Callback de sucesso
                    const { latitude, longitude } = position.coords;
                    locationStatus.textContent = 'Localização ativa.';

                    // Atualiza o mapa
                    const latLng = [latitude, longitude];
                    if (!marker) {
                        marker = L.marker(latLng).addTo(map);
                    } else {
                        marker.setLatLng(latLng);
                    }
                    map.setView(latLng, 16);

                    // Envia para o Firebase
                    const locationRef = ref(db, 'localizacao/alexandre');
                    set(locationRef, { latitude, longitude });
                },
                (error) => { // Callback de erro
                    let errorMessage = 'Ocorreu um erro ao obter a localização.';
                    switch (error.code) {
                        case error.PERMISSION_DENIED:
                            errorMessage = 'Permissão de localização negada. Por favor, habilite o acesso à localização para este site nas configurações do seu navegador e do seu celular.';
                            break;
                        case error.POSITION_UNAVAILABLE:
                            errorMessage = 'Informações de localização não estão disponíveis no momento.';
                            break;
                        case error.TIMEOUT:
                            errorMessage = 'A solicitação de localização expirou.';
                            break;
                    }
                    locationStatus.textContent = errorMessage;
                },
                { enableHighAccuracy: true }
            );
        } else {
            locationStatus.textContent = 'Geolocalização não é suportada por este navegador.';
        }
    }
});