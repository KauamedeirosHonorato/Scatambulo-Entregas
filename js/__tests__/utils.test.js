import { geocodeAddress, getRouteDetails, calcularDistancia, calculateSpeed } from '../utils.js';

// Mock the fetch API for geocodeAddress and getRouteDetails
global.fetch = jest.fn();

// Mock console.error to prevent actual console output during tests and to assert calls
global.console = {
  ...console,
  error: jest.fn(),
};

describe('utils.js', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('geocodeAddress', () => {
    it('should return coordinates for a valid address', async () => {
      fetch.mockResolvedValueOnce({
        json: () => Promise.resolve([{ lat: '10.0', lon: '20.0' }]),
      });

      const coords = await geocodeAddress('Rua Exemplo, 123, Cidade');
      expect(coords).toEqual({ lat: 10.0, lon: 20.0 });
      expect(fetch).toHaveBeenCalledWith(
        'https://nominatim.openstreetmap.org/search?format=json&q=Rua%20Exemplo%2C%20123%2C%20Cidade'
      );
    });

    it('should return null for an invalid address', async () => {
      fetch.mockResolvedValueOnce({
        json: () => Promise.resolve([]),
      });

      const coords = await geocodeAddress('Invalid Address');
      expect(coords).toBeNull();
    });

    it('should return null on fetch error', async () => {
      fetch.mockRejectedValueOnce(new Error('Network error'));

      const coords = await geocodeAddress('Rua Exemplo, 123, Cidade');
      expect(coords).toBeNull();
      expect(console.error).toHaveBeenCalledWith('Erro de geocodificação:', expect.any(Error));
    });
  });

  describe('getRouteDetails', () => {
    it('should return route details for valid coordinates', async () => {
      fetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          code: 'Ok',
          routes: [{
            distance: 10000, // 10 km
            duration: 600, // 10 minutes
            geometry: { type: 'LineString', coordinates: [[1, 2], [3, 4]] },
          }],
        }),
      });

      const start = { latitude: 10, longitude: 20 };
      const end = { lat: 10.1, lon: 20.1 };
      const route = await getRouteDetails(start, end);

      expect(route).toEqual({
        distance: '10.0',
        duration: 10,
        geometry: { type: 'LineString', coordinates: [[1, 2], [3, 4]] },
      });
      expect(fetch).toHaveBeenCalledWith(
        'https://router.project-osrm.org/route/v1/driving/20,10;20.1,10.1?overview=full&geometries=geojson'
      );
    });

    it('should return null if OSRM returns no route', async () => {
      fetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ code: 'NoRoute', routes: [] }),
      });

      const start = { latitude: 10, longitude: 20 };
      const end = { lat: 10.1, lon: 20.1 };
      const route = await getRouteDetails(start, end);
      expect(route).toBeNull();
    });

    it('should return null on fetch error', async () => {
      fetch.mockRejectedValueOnce(new Error('Network error'));

      const start = { latitude: 10, longitude: 20 };
      const end = { lat: 10.1, lon: 20.1 };
      const route = await getRouteDetails(start, end);
      expect(route).toBeNull();
      expect(console.error).toHaveBeenCalledWith('Erro ao obter rota:', expect.any(Error));
    });
  });

  describe('calcularDistancia', () => {
    it('should return 0 for the same coordinates', () => {
      const dist = calcularDistancia(0, 0, 0, 0);
      expect(dist).toBe(0);
    });

    it('should calculate a positive distance for different coordinates', () => {
      const dist = calcularDistancia(0, 0, 1, 1);
      expect(dist).toBeGreaterThan(0);
      expect(dist).toBeCloseTo(157.2, 1); // Approx distance between (0,0) and (1,1)
    });

    it('should return the correct distance for known points (e.g., equator)', () => {
      // Distance between (0,0) and (0, 90) should be approx 10000km (1/4 of earth circumference)
      const dist = calcularDistancia(0, 0, 0, 90);
      expect(dist).toBeCloseTo(10007.5, 1);
    });
  });

  describe('calculateSpeed', () => {
    it('should return 0 if oldLoc is null', () => {
      const newLoc = { latitude: 1, longitude: 1, timestamp: Date.now() };
      expect(calculateSpeed(newLoc, null)).toBe(0);
    });

    it('should return 0 if newLoc is null', () => {
      const oldLoc = { latitude: 0, longitude: 0, timestamp: Date.now() };
      expect(calculateSpeed(null, oldLoc)).toBe(0);
    });

    it('should return 0 if timestamps are the same', () => {
      const now = Date.now();
      const oldLoc = { latitude: 0, longitude: 0, timestamp: now };
      const newLoc = { latitude: 1, longitude: 1, timestamp: now };
      expect(calculateSpeed(newLoc, oldLoc)).toBe(0);
    });

    it('should calculate speed correctly for different locations and timestamps', () => {
      const oldTime = Date.now() - 3600000; // 1 hour ago
      const newTime = Date.now();
      const oldLoc = { latitude: 0, longitude: 0, timestamp: oldTime };
      const newLoc = { latitude: 0.01, longitude: 0, timestamp: newTime }; // Approx 1.11 km north

      // Distance is approx 1.11 km. Time is 1 hour. Speed should be approx 1.1 km/h
      const speed = calculateSpeed(newLoc, oldLoc);
      expect(parseFloat(speed)).toBeCloseTo(1.1, 1);
    });

    it('should return 0 if distance is 0 but time is not 0', () => {
      const oldTime = Date.now() - 3600000; // 1 hour ago
      const newTime = Date.now();
      const oldLoc = { latitude: 0, longitude: 0, timestamp: oldTime };
      const newLoc = { latitude: 0, longitude: 0, timestamp: newTime }; // Same location

      const speed = calculateSpeed(newLoc, oldLoc);
      expect(speed).toBe('0.0');
    });
  });
});
