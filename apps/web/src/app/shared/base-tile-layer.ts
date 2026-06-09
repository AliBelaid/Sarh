import * as L from 'leaflet';

// Ordered base-map providers. We start with OpenStreetMap (the familiar look);
// if its tiles fail to load — which happens when OSM is blocked or unreachable
// on a given network (observed in parts of Libya, where the map showed a blank
// grey canvas) — we automatically fall back to the next provider so the user
// always gets a street base-map. All three are keyless and free for light use.
interface TileProvider {
  readonly url: string;
  readonly options: L.TileLayerOptions;
}

const PROVIDERS: readonly TileProvider[] = [
  {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    options: {
      maxZoom: 19,
      subdomains: 'abc',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    },
  },
  {
    // Esri World Street Map — different CDN/domain, reachable on many networks
    // where openstreetmap.org is blocked. No API key for basic tile use.
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    options: {
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri — Esri, HERE, Garmin, OpenStreetMap contributors',
    },
  },
  {
    // CARTO Voyager — third fallback, yet another CDN.
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    options: {
      maxZoom: 20,
      subdomains: 'abcd',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; CARTO',
    },
  },
];

// Adds a self-healing base tile layer to the map. On a burst of tile-load
// errors (a whole provider blocked/unreachable), it removes that layer and
// swaps to the next provider in the list, so the map never stays blank when a
// provider is unavailable. Returns the currently-active layer.
export function addBaseTileLayer(map: L.Map): L.TileLayer {
  let idx = 0;
  let errors = 0;
  let layer = L.tileLayer(PROVIDERS[idx].url, PROVIDERS[idx].options).addTo(map);

  const wire = (current: L.TileLayer): void => {
    errors = 0;
    current.on('tileerror', () => {
      errors++;
      // A blocked provider fails many tiles within ~1–2s; switch once we've
      // seen enough failures and there is another provider left to try.
      if (errors >= 4 && idx < PROVIDERS.length - 1) {
        idx++;
        map.removeLayer(current);
        layer = L.tileLayer(PROVIDERS[idx].url, PROVIDERS[idx].options).addTo(map);
        wire(layer);
      }
    });
  };

  wire(layer);
  return layer;
}
