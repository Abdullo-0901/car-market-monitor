# 🚗 Instagram Car Market Monitor (Tajikistan) - TypeScript Edition

An automated data extraction and market analysis engine designed to monitor active Instagram Stories from automotive bloggers and car dealerships in Tajikistan. Built with **TypeScript**, **Playwright**, **Tesseract OCR**, **better-sqlite3**, and an interactive Web Dashboard.

---

## 📂 Project Structure & Architecture Overview

```text
car-price-analyzer/
├── package.json             # Node.js dependencies and npm scripts
├── tsconfig.json            # TypeScript compiler configuration
├── src/
│   ├── types.ts             # TypeScript interfaces and entity types
│   ├── config.ts            # Global configuration, target sellers, and anti-bot timeouts
│   ├── carCatalog.ts        # Automotive catalog loader
│   ├── carNormalizer.ts     # Brand standardizer & fuzzy model normalization engine
│   ├── parsers.ts           # Extraction engine for prices, phone numbers & specifications
│   ├── database.ts          # better-sqlite3 database layer (cars, checkpoints, daily_checks)
│   ├── ocrService.ts        # Tesseract.js multilingual OCR engine (Russian + English)
│   ├── imageService.ts      # Image downloader, story screenshots & temp cleaner
│   ├── instagramClient.ts   # Playwright TypeScript browser controller with anti-bot delays
│   ├── storyMonitor.ts      # Main execution orchestrator with fast checkpoint skipping
│   ├── server.ts            # Express REST API & static web dashboard backend
│   └── __tests__/
│       └── parsers.test.ts  # Comprehensive TypeScript unit test suite
├── web/                     # Web Dashboard Frontend
│   ├── index.html           # Dashboard UI with responsive grid, filters, and modals
│   ├── style.css            # Dark mode glassmorphism theme styling
│   └── app.js               # Dynamic filter logic, live search, and modal interactions
├── car_catalog.json         # Structured car catalog with aliases for fuzzy matching
└── car_images/              # Directory organizing downloaded vehicle images by seller
```

---

## ⚡ Key Features

- **🚀 100% Type-Safe**: Written in modern TypeScript with strict type checking.
- **⚡ Ultra-Fast SQLite**: Powered by `better-sqlite3` for high-speed synchronous queries.
- **🧠 Intelligent Normalization**: Fuzzy model matching maps typos (e.g. `RENGE ROVER P550E` $\to$ `Range Rover P550e`, `LC PRAD0` $\to$ `Land Cruiser Prado`).
- **🛡️ Anti-Bot Protection**: Randomized human-like navigation delays to prevent Instagram rate-limits.
- **⚡ Checkpoint Fast-Skipping**: Saves the newest `last_story_id` per seller to fast-forward previously checked stories in seconds.
- **📞 Phone Extraction**: Automatically extracts Tajik contact numbers (`+992 ...`) and creates direct **Call** & **WhatsApp** buttons.
- **📊 Web Dashboard**: Interactive UI with real-time stats, multi-criteria filtering, price ranges, and modal views.

---

## 🚦 Getting Started

### 1. Install Dependencies & Playwright Browser
```bash
npm install
npx playwright install chromium
```

### 2. Run Automated Unit Tests
```bash
npm test
```

### 3. Launch the Web Dashboard
```bash
npm run web
```
Open your browser and navigate to: **[http://localhost:8000](http://localhost:8000)**

### 4. Run the Story Monitor / Scraper
```bash
# Interactive mode (visible browser window for initial login or monitoring)
npm start

# Headless mode (runs silently in the background)
HEADLESS=1 npm start
```

### 5. Typecheck & Build
```bash
# Check types
npm run typecheck

# Compile to JavaScript
npm run build
```

---

## 📊 Database Schema

### `cars` Table

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `INTEGER` | Primary key |
| `seller_username`| `TEXT` | Instagram seller handle |
| `brand` | `TEXT` | Normalized vehicle make |
| `model` | `TEXT` | Normalized vehicle model |
| `year` | `INTEGER` | Manufacturing year |
| `month` | `INTEGER` | Manufacturing month |
| `mileage` | `INTEGER` | Mileage in kilometers |
| `production` | `TEXT` | Country of origin |
| `transmission` | `TEXT` | Transmission type |
| `fuel` | `TEXT` | Fuel type |
| `engine` | `REAL` | Engine displacement in liters |
| `condition` | `TEXT` | Vehicle condition |
| `price_tjs` | `INTEGER` | Price in Tajikistani Somoni (TJS) |
| `price_usd` | `INTEGER` | Price in US Dollars (USD) |
| `phone_number` | `TEXT` | Extracted contact phone number |
| `source_type` | `TEXT` | Origin: `POST_CAPTION` or `STORY_OCR` |
| `source_url` | `TEXT` | Canonical Instagram URL |
| `source_key` | `TEXT` | Unique hash key preventing duplicates |
| `image_url` | `TEXT` | Remote CDN image link |
| `image_path` | `TEXT` | Local file path under `car_images/` |
| `created_at` | `DATETIME` | Timestamp of record creation |
