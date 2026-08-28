# 🚗 Instagram Car Market Monitor (Tajikistan)

An automated data extraction and market analysis engine designed to monitor active Instagram Stories from automotive bloggers and car dealerships in Tajikistan. The system extracts vehicle specifications, pricing (TJS & USD), phone numbers, images, and normalizes brand and model names into a centralized SQLite database with a modern web dashboard frontend.

---

## 📂 Project Structure & Architecture Overview

```text
car-price-analyzer/
├── web/                     # Modern Web Dashboard Frontend
│   ├── index.html           # Dashboard UI with responsive grid, filters, and modals
│   ├── style.css            # Dark mode glassmorphism theme styling
│   └── app.js               # Dynamic filter logic, live search, and modal interactions
├── server.py                # Lightweight HTTP server & REST API (Zero-dependency)
├── config.py                # Global configuration, target sellers, paths, and anti-bot timeouts
├── car_catalog.json         # Structured car catalog with aliases for fuzzy matching
├── car_normalizer.py        # Brand standardizer & RapidFuzz model normalization engine
├── parsers.py               # Extraction engine for prices, phone numbers, specs & validation
├── database.py              # SQLite database layer, unified `cars`, `seller_checkpoints` & `daily_story_checks`
├── ocr_service.py           # PaddleOCR integration for direct story text recognition
├── image_service.py         # Image downloader, story screenshot fallback & temp cleaner
├── instagram_client.py      # Playwright browser controller with randomized anti-bot delays
├── story_monitor.py         # Main execution orchestrator with checkpoint fast-skipping
├── test_parsers.py          # Unit test suite covering all parser scenarios & edge cases
├── requirements.txt         # Project dependencies
├── instagram_monitor.db     # Central SQLite database storing all car listings
├── car_images/              # Directory organizing downloaded vehicle images by seller
└── story_temp/              # Temporary runtime folder for OCR screenshot processing
```

---

## 🖥️ Web Dashboard Frontend Features

- **📊 Live Analytics**: Real-time stats showing total verified cars, average price in Somoni (TJS), phone number coverage, and active monitored sellers.
- **🔍 Instant Live Search**: Filter cars by model, brand, seller, specs, or phone numbers.
- **🎛️ Interactive Filters**: Filter by Seller (`@auto_dubai.tj`, `@4444mk01`, etc.), Brand (`Toyota`, `BMW`, etc.), Min/Max Price in TJS, and "Phone Number Only" toggle.
- **📱 One-Click Communication**: Direct click-to-call (`tel:`) and direct **WhatsApp** (`https://wa.me/...`) buttons for each listing.
- **🖼️ Vehicle Media**: Direct preview of vehicle photos stored under `car_images/` with fallback placeholders.
- **ℹ️ Details Modal**: Deep inspection dialog showing full specs and direct Instagram post links.
- **📅 Daily Activity Log**: Audit history showing stories and cars discovered per seller today.

---

## ⚡ Fast-Forward Checkpoint Architecture

When the monitor runs multiple times per day, it uses **Seller Story Checkpoints**:
1. For each seller, the system saves only the single highest (newest) `last_story_id` in `seller_checkpoints`.
2. On subsequent runs in the same day:
   - Any story with `current_story_id <= last_story_id` is immediately fast-forwarded without taking screenshots or performing OCR.
   - The monitor halts and performs OCR only when it encounters **new stories** posted after the last checkpoint.
   - At the end of the seller run, the checkpoint is updated to the newest story ID.

---

## 📊 Database Schemas

### `cars` Table

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `INTEGER` | Auto-incrementing primary key |
| `seller_username`| `TEXT` | Instagram seller handle (e.g., `auto_dubai.tj`) |
| `brand` | `TEXT` | Normalized vehicle make (e.g., `Toyota`, `BMW`, `Land Rover`) |
| `model` | `TEXT` | Normalized vehicle model (e.g., `RAV4`, `M6`, `Range Rover P550e`) |
| `year` | `INTEGER` | Manufacturing year (e.g., `2023`) |
| `month` | `INTEGER` | Manufacturing month if provided (e.g., `7`) |
| `mileage` | `INTEGER` | Normalized mileage in kilometers/miles |
| `production` | `TEXT` | Country of origin / production (e.g., `USA`, `KOREA`, `GERMANY`) |
| `transmission` | `TEXT` | Transmission type (e.g., `Автомат`) |
| `fuel` | `TEXT` | Fuel type (e.g., `Бензин Гибрид`, `Дизель`) |
| `engine` | `REAL` | Engine displacement in liters (e.g., `2.5`, `4.4`) |
| `condition` | `TEXT` | Vehicle condition (e.g., `с пробегом`, `новый`) |
| `price_tjs` | `INTEGER` | Price in Tajikistani Somoni (TJS) |
| `price_usd` | `INTEGER` | Price in US Dollars (USD) |
| `phone_number` | `TEXT` | Extracted seller contact phone number (e.g. `+992 907 77 01 10`) |
| `source_type` | `TEXT` | Origin source: `POST_CAPTION` or `STORY_OCR` |
| `source_url` | `TEXT` | Canonical Instagram URL |
| `source_key` | `TEXT` | Unique hash key preventing duplicates |
| `image_url` | `TEXT` | Remote CDN image link |
| `image_path` | `TEXT` | Local file path under `car_images/` |
| `created_at` | `DATETIME` | Timestamp of record creation |

### `seller_checkpoints` Table

| Column | Type | Description |
| :--- | :--- | :--- |
| `seller_username`| `TEXT` | Instagram seller handle (Primary Key) |
| `last_story_id` | `TEXT` | The most recent story ID processed for this seller |
| `last_checked_at` | `DATETIME` | Timestamp when the checkpoint was last updated |

### `daily_story_checks` Table

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `INTEGER` | Auto-incrementing primary key |
| `seller_username`| `TEXT` | Instagram seller handle |
| `check_date` | `DATE` | Date of the check (`YYYY-MM-DD`) |
| `stories_count` | `INTEGER` | Number of active stories reviewed today |
| `cars_found` | `INTEGER` | Number of valid car listings found today |
| `last_checked_at` | `DATETIME` | Timestamp of the most recent inspection |

---

## 🚦 How to Run

### 1. Launch the Web Dashboard (Frontend)
```bash
source .venv/bin/activate
python3 server.py
```
Open your browser and navigate to: **[http://localhost:8000](http://localhost:8000)**

### 2. Run the Instagram Story Scraper / Monitor
```bash
# Interactive mode (visible browser)
python3 story_monitor.py

# Headless background mode
HEADLESS=1 python3 story_monitor.py
```

### 3. Run Automated Unit Tests
```bash
python3 -m unittest test_parsers.py -v
```
