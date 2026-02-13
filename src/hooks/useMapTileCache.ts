// Tile Cache using IndexedDB for offline map tile storage
const DB_NAME = 'map-tile-cache';
const STORE_NAME = 'tiles';
const DB_VERSION = 1;
const MAX_CACHE_SIZE = 500; // Max number of tiles to cache
const CACHE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface CachedTile {
  url: string;
  blob: Blob;
  timestamp: number;
}

let db: IDBDatabase | null = null;

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'url' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
};

export const getCachedTile = async (url: string): Promise<Blob | null> => {
  try {
    const database = await openDB();
    return new Promise((resolve) => {
      const transaction = database.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(url);

      request.onsuccess = () => {
        const result = request.result as CachedTile | undefined;
        if (result && Date.now() - result.timestamp < CACHE_EXPIRY_MS) {
          resolve(result.blob);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
};

export const cacheTile = async (url: string, blob: Blob): Promise<void> => {
  try {
    const database = await openDB();
    
    // First, check cache size and clean up if needed
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    const countRequest = store.count();
    countRequest.onsuccess = () => {
      if (countRequest.result >= MAX_CACHE_SIZE) {
        // Delete oldest entries
        const index = store.index('timestamp');
        const cursorRequest = index.openCursor();
        let deleteCount = Math.floor(MAX_CACHE_SIZE * 0.2); // Delete 20% of oldest
        
        cursorRequest.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result;
          if (cursor && deleteCount > 0) {
            cursor.delete();
            deleteCount--;
            cursor.continue();
          }
        };
      }
    };

    // Add the new tile
    const tile: CachedTile = {
      url,
      blob,
      timestamp: Date.now()
    };
    
    store.put(tile);
  } catch (error) {
    console.warn('Failed to cache tile:', error);
  }
};

export const clearTileCache = async (): Promise<void> => {
  try {
    const database = await openDB();
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.clear();
  } catch (error) {
    console.warn('Failed to clear tile cache:', error);
  }
};

// Preload tiles for a specific area
export const preloadTiles = async (
  bounds: { north: number; south: number; east: number; west: number },
  zoomLevels: number[],
  tileUrlTemplate: string
): Promise<void> => {
  const lon2tile = (lon: number, zoom: number) => Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
  const lat2tile = (lat: number, zoom: number) => Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));

  for (const zoom of zoomLevels) {
    const minX = lon2tile(bounds.west, zoom);
    const maxX = lon2tile(bounds.east, zoom);
    const minY = lat2tile(bounds.north, zoom);
    const maxY = lat2tile(bounds.south, zoom);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        const url = tileUrlTemplate.replace('{z}', zoom.toString()).replace('{x}', x.toString()).replace('{y}', y.toString());
        
        // Check if already cached
        const cached = await getCachedTile(url);
        if (!cached) {
          try {
            const response = await fetch(url);
            if (response.ok) {
              const blob = await response.blob();
              await cacheTile(url, blob);
            }
          } catch {
            // Ignore fetch errors during preloading
          }
        }
      }
    }
  }
};
