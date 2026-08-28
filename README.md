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
- **🔍 Instant Live Search**: Filter cars by model, brand, seller, specs, phone numbers, or free-text keywords with debounce.
- **🎛️ Interactive Filters**: Filter by Seller (`@auto_dubai.tj`, `@4444mk01`, etc.), Brand (`Toyota`, `BMW`, etc.), Min/Max Price in TJS, and "Phone Number Only" toggle.
- **📱 One-Click Communication**: Direct click-to-call (`tel:`) and direct **WhatsApp** (`https://wa.me/...`) buttons for each listing.
- **🖼️ Vehicle Media**: Direct preview of vehicle photos stored under `car_images/` with fallback placeholders.
- **ℹ️ Details Modal**: Deep inspection dialog showing full specs, raw Instagram captions/OCR text, and direct Instagram post links.
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
# car-market-monitor
