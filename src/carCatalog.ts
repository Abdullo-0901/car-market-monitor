import fs from 'node:fs';
import { CAR_CATALOG_PATH } from './config.js';
import type { CatalogEntry } from './types.js';

export function loadCarCatalog(): CatalogEntry[] {
  try {
    if (fs.existsSync(CAR_CATALOG_PATH)) {
      const data = fs.readFileSync(CAR_CATALOG_PATH, 'utf-8');
      return JSON.parse(data) as CatalogEntry[];
    }
  } catch (err) {
    console.warn('⚠️ Could not load car_catalog.json:', err);
  }
  return [];
}
