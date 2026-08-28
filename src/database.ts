import Database from 'better-sqlite3';
import { DB_PATH } from './config.js';
import type {
  CarListing,
  CarParseResult,
  DailyStoryCheck,
  DashboardStats,
} from './types.js';

let dbInstance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!dbInstance) {
    dbInstance = new Database(DB_PATH);
    dbInstance.pragma('journal_mode = WAL');
  }
  return dbInstance;
}

export function initDb(): void {
  const db = getDb();

  // Create cars table
  db.exec(`
    CREATE TABLE IF NOT EXISTS cars (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      seller_username TEXT NOT NULL,

      brand TEXT,
      model TEXT,

      year INTEGER,
      month INTEGER,

      mileage INTEGER,

      production TEXT,
      transmission TEXT,
      fuel TEXT,

      engine REAL,
      condition TEXT,

      price_tjs INTEGER,
      price_usd INTEGER,

      phone_number TEXT,

      source_type TEXT NOT NULL,

      source_url TEXT,
      source_key TEXT UNIQUE,

      image_url TEXT,
      image_path TEXT,

      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Checkpoint table: Stores the single highest/last seen story ID per seller
  db.exec(`
    CREATE TABLE IF NOT EXISTS seller_checkpoints (
      seller_username TEXT PRIMARY KEY,
      last_story_id TEXT NOT NULL,
      last_checked_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Daily monitoring audit history table
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_story_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seller_username TEXT NOT NULL,
      check_date DATE NOT NULL,
      stories_count INTEGER DEFAULT 0,
      cars_found INTEGER DEFAULT 0,
      last_checked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(seller_username, check_date)
    );
  `);

  // Indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_cars_seller ON cars(seller_username);
    CREATE INDEX IF NOT EXISTS idx_cars_brand_model ON cars(brand, model);
    CREATE INDEX IF NOT EXISTS idx_cars_price_tjs ON cars(price_tjs);
    CREATE INDEX IF NOT EXISTS idx_cars_source_key ON cars(source_key);
    CREATE INDEX IF NOT EXISTS idx_daily_checks_date ON daily_story_checks(check_date);
  `);
}

export function carExists(sourceKey: string): boolean {
  if (!sourceKey) return false;
  const db = getDb();
  const stmt = db.prepare('SELECT 1 FROM cars WHERE source_key = ? LIMIT 1');
  const row = stmt.get(sourceKey);
  return Boolean(row);
}

export function saveCar(
  sellerUsername: string,
  sourceType: 'POST_CAPTION' | 'STORY_OCR',
  sourceKey: string,
  sourceUrl: string | null,
  carData: CarParseResult,
  imageUrl?: string | null,
  imagePath?: string | null
): boolean {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO cars (
      seller_username,
      brand,
      model,
      year,
      month,
      mileage,
      production,
      transmission,
      fuel,
      engine,
      condition,
      price_tjs,
      price_usd,
      phone_number,
      source_type,
      source_url,
      source_key,
      image_url,
      image_path
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const info = stmt.run(
    sellerUsername,
    carData.brand,
    carData.model,
    carData.year,
    carData.month,
    carData.mileage,
    carData.production,
    carData.transmission,
    carData.fuel,
    carData.engine,
    carData.condition,
    carData.price_tjs,
    carData.price_usd,
    carData.phone_number,
    sourceType,
    sourceUrl,
    sourceKey,
    imageUrl || null,
    imagePath || null
  );

  return info.changes > 0;
}

export function getLastStoryId(sellerUsername: string): string | null {
  const db = getDb();
  const stmt = db.prepare(
    'SELECT last_story_id FROM seller_checkpoints WHERE seller_username = ? LIMIT 1'
  );
  const row = stmt.get(sellerUsername) as { last_story_id: string } | undefined;
  return row ? String(row.last_story_id) : null;
}

export function updateLastStoryId(sellerUsername: string, lastStoryId: string): void {
  if (!lastStoryId) return;
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO seller_checkpoints (seller_username, last_story_id, last_checked_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(seller_username) DO UPDATE SET
      last_story_id = excluded.last_story_id,
      last_checked_at = CURRENT_TIMESTAMP
  `);
  stmt.run(sellerUsername, String(lastStoryId));
}

export function recordDailyCheck(
  sellerUsername: string,
  storiesChecked: number,
  carsFound: number
): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO daily_story_checks (seller_username, check_date, stories_count, cars_found, last_checked_at)
    VALUES (?, DATE('now'), ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(seller_username, check_date) DO UPDATE SET
      stories_count = stories_count + excluded.stories_count,
      cars_found = cars_found + excluded.cars_found,
      last_checked_at = CURRENT_TIMESTAMP
  `);
  stmt.run(sellerUsername, storiesChecked, carsFound);
}

export function getDbSummary(): {
  total: number;
  with_phone: number;
  breakdown: Record<string, number>;
} {
  const db = getDb();

  const totalRow = db.prepare('SELECT COUNT(*) as cnt FROM cars').get() as { cnt: number };
  const phoneRow = db
    .prepare("SELECT COUNT(*) as cnt FROM cars WHERE phone_number IS NOT NULL AND phone_number != ''")
    .get() as { cnt: number };

  const rows = db
    .prepare(
      `
      SELECT seller_username, COUNT(*) AS count
      FROM cars
      GROUP BY seller_username
      ORDER BY count DESC
    `
    )
    .all() as Array<{ seller_username: string; count: number }>;

  const breakdown: Record<string, number> = {};
  for (const r of rows) {
    breakdown[r.seller_username] = r.count;
  }

  return {
    total: totalRow?.cnt || 0,
    with_phone: phoneRow?.cnt || 0,
    breakdown,
  };
}

export function getDailyChecksSummary(): DailyStoryCheck[] {
  const db = getDb();
  const rows = db
    .prepare(
      `
      SELECT seller_username, check_date, stories_count, cars_found, last_checked_at
      FROM daily_story_checks
      WHERE check_date = DATE('now')
      ORDER BY cars_found DESC, stories_count DESC
    `
    )
    .all() as DailyStoryCheck[];

  return rows;
}

export function queryCars(params: Record<string, any>): { count: number; cars: CarListing[] } {
  const db = getDb();
  let sql = 'SELECT * FROM cars WHERE 1=1';
  const args: any[] = [];

  // Search
  if (params.search && String(params.search).trim()) {
    const term = `%${String(params.search).trim()}%`;
    sql += ' AND (brand LIKE ? OR model LIKE ? OR phone_number LIKE ? OR seller_username LIKE ?)';
    args.push(term, term, term, term);
  }

  // Seller
  if (params.seller && String(params.seller).trim()) {
    sql += ' AND seller_username = ?';
    args.push(String(params.seller).trim());
  }

  // Brand
  if (params.brand && String(params.brand).trim()) {
    sql += ' AND brand = ?';
    args.push(String(params.brand).trim());
  }

  // Phone only
  if (params.has_phone === 'true' || params.has_phone === '1') {
    sql += " AND phone_number IS NOT NULL AND phone_number != ''";
  }

  // Price Min/Max
  if (params.min_price && !isNaN(Number(params.min_price))) {
    sql += ' AND price_tjs >= ?';
    args.push(Number(params.min_price));
  }
  if (params.max_price && !isNaN(Number(params.max_price))) {
    sql += ' AND price_tjs <= ?';
    args.push(Number(params.max_price));
  }

  // Sort
  const sort = params.sort || 'newest';
  if (sort === 'price_asc') {
    sql += ' ORDER BY CASE WHEN price_tjs IS NULL THEN 1 ELSE 0 END, price_tjs ASC';
  } else if (sort === 'price_desc') {
    sql += ' ORDER BY price_tjs DESC';
  } else if (sort === 'year_desc') {
    sql += ' ORDER BY year DESC, created_at DESC';
  } else if (sort === 'oldest') {
    sql += ' ORDER BY created_at ASC';
  } else {
    sql += ' ORDER BY created_at DESC, id DESC';
  }

  const cars = db.prepare(sql).all(...args) as CarListing[];
  return { count: cars.length, cars };
}

export function getDashboardStats(): DashboardStats {
  const db = getDb();

  const total = (db.prepare('SELECT COUNT(*) as c FROM cars').get() as { c: number }).c;
  const withPhone = (
    db.prepare("SELECT COUNT(*) as c FROM cars WHERE phone_number IS NOT NULL AND phone_number != ''").get() as {
      c: number;
    }
  ).c;

  const avgRow = db
    .prepare('SELECT AVG(price_tjs) as avg_p FROM cars WHERE price_tjs IS NOT NULL AND price_tjs > 0')
    .get() as { avg_p: number | null };
  const avgPrice = avgRow?.avg_p ? Math.round(avgRow.avg_p) : 0;

  const sellersCount = (
    db.prepare('SELECT COUNT(DISTINCT seller_username) as c FROM cars').get() as { c: number }
  ).c;

  const topBrands = db
    .prepare(
      `
      SELECT brand, COUNT(*) AS count
      FROM cars
      WHERE brand IS NOT NULL
      GROUP BY brand
      ORDER BY count DESC
      LIMIT 6
    `
    )
    .all() as Array<{ brand: string; count: number }>;

  const sellerDistribution = db
    .prepare(
      `
      SELECT seller_username, COUNT(*) AS count
      FROM cars
      GROUP BY seller_username
      ORDER BY count DESC
    `
    )
    .all() as Array<{ seller_username: string; count: number }>;

  return {
    total_cars: total,
    with_phone: withPhone,
    avg_price_tjs: avgPrice,
    sellers_count: sellersCount,
    top_brands: topBrands,
    seller_distribution: sellerDistribution,
  };
}

export function getFilterOptions(): {
  brands: string[];
  sellers: string[];
  min_price: number;
  max_price: number;
} {
  const db = getDb();

  const brands = (
    db.prepare('SELECT DISTINCT brand FROM cars WHERE brand IS NOT NULL ORDER BY brand ASC').all() as Array<{
      brand: string;
    }>
  ).map((r) => r.brand);

  const sellers = (
    db.prepare('SELECT DISTINCT seller_username FROM cars ORDER BY seller_username ASC').all() as Array<{
      seller_username: string;
    }>
  ).map((r) => r.seller_username);

  const minRow = db.prepare('SELECT MIN(price_tjs) as m FROM cars WHERE price_tjs > 0').get() as {
    m: number | null;
  };
  const maxRow = db.prepare('SELECT MAX(price_tjs) as m FROM cars WHERE price_tjs > 0').get() as {
    m: number | null;
  };

  return {
    brands,
    sellers,
    min_price: minRow?.m || 0,
    max_price: maxRow?.m || 1000000,
  };
}
