export interface CarListing {
  id?: number;
  seller_username: string;
  brand: string | null;
  model: string | null;
  year: number | null;
  month: number | null;
  mileage: number | null;
  production: string | null;
  transmission: string | null;
  fuel: string | null;
  engine: number | null;
  condition: string | null;
  price_tjs: number | null;
  price_usd: number | null;
  phone_number: string | null;
  source_type: 'POST_CAPTION' | 'STORY_OCR';
  source_url: string | null;
  source_key: string;
  image_url?: string | null;
  image_path?: string | null;
  created_at?: string;
}

export interface CarParseResult {
  brand: string | null;
  model: string | null;
  year: number | null;
  month: number | null;
  mileage: number | null;
  production: string | null;
  transmission: string | null;
  fuel: string | null;
  engine: number | null;
  condition: string | null;
  price_tjs: number | null;
  price_usd: number | null;
  phone_number: string | null;
}

export interface CatalogEntry {
  brand: string;
  model: string;
  aliases: string[];
}

export interface SellerCheckpoint {
  seller_username: string;
  last_story_id: string;
  last_checked_at: string;
}

export interface DailyStoryCheck {
  id?: number;
  seller_username: string;
  check_date: string;
  stories_count: number;
  cars_found: number;
  last_checked_at: string;
}

export interface DashboardStats {
  total_cars: number;
  with_phone: number;
  avg_price_tjs: number;
  sellers_count: number;
  top_brands: Array<{ brand: string; count: number }>;
  seller_distribution: Array<{ seller_username: string; count: number }>;
}

export interface MonitoringStats {
  sellers_checked: number;
  stories_checked: number;
  cars_added: number;
  duplicates_skipped: number;
  invalid_skipped: number;
  errors: number;
}
