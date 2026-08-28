import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =========================================================
// SELLERS LIST
// =========================================================
export const SELLERS = [
  'auto_dubai.tj',
  'auto_umedsho',
  'autofurush.tj',
  'autokhatlon.tj',
  'auto_dromtj',
  'sales_car.tj',
  'tajcars__',
  'tjkcars',
  'taj__auto_car',
  '4444mk01',
];

// =========================================================
// PATHS & DIRECTORIES
// =========================================================
export const BASE_DIR = path.resolve(__dirname, '..');

export const DB_PATH = path.join(BASE_DIR, 'instagram_monitor.db');
export const SESSION_DIR = path.join(os.homedir(), '.instagram-car-monitor');

export const TEMP_DIR = path.join(BASE_DIR, 'story_temp');
fs.mkdirSync(TEMP_DIR, { recursive: true });

export const CAR_IMAGES_DIR = path.join(BASE_DIR, 'car_images');
fs.mkdirSync(CAR_IMAGES_DIR, { recursive: true });

export const CAR_CATALOG_PATH = path.join(BASE_DIR, 'car_catalog.json');
export const WEB_DIR = path.join(BASE_DIR, 'web');

// =========================================================
// SCRAPING & MONITOR SETTINGS
// =========================================================
export const HEADLESS = ['true', '1', 'yes'].includes(
  (process.env.HEADLESS || 'false').toLowerCase()
);

export const MAX_STORIES_PER_SELLER = 30;

// Fuzzy match threshold (0-100)
export const FUZZY_MATCH_THRESHOLD = 0.85;

// =========================================================
// ANTI-BOT TIMEOUTS & DELAYS (in seconds)
// =========================================================
export const STORY_DELAY_MIN = 2.2;
export const STORY_DELAY_MAX = 4.2;

export const POST_DELAY_MIN = 3.0;
export const POST_DELAY_MAX = 5.5;

export const SELLER_COOLDOWN_MIN = 4.5;
export const SELLER_COOLDOWN_MAX = 8.5;
