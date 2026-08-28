import json
import mimetypes
import os
import sqlite3
import urllib.parse
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from typing import Dict, Any, List

from config import DB_PATH, CAR_IMAGES_DIR, BASE_DIR

PORT = int(os.environ.get("PORT", 8000))
WEB_DIR = BASE_DIR / "web"


def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def query_cars(params: Dict[str, List[str]]) -> Dict[str, Any]:
    conn = get_db_connection()
    cursor = conn.cursor()

    sql = "SELECT * FROM cars WHERE 1=1"
    args = []

    # Search filter (brand, model, raw_text, phone_number, seller_username)
    if "search" in params and params["search"][0].strip():
        term = f"%{params['search'][0].strip()}%"
        sql += " AND (brand LIKE ? OR model LIKE ? OR raw_text LIKE ? OR phone_number LIKE ? OR seller_username LIKE ?)"
        args.extend([term, term, term, term, term])

    # Seller filter
    if "seller" in params and params["seller"][0].strip():
        sql += " AND seller_username = ?"
        args.append(params["seller"][0].strip())

    # Brand filter
    if "brand" in params and params["brand"][0].strip():
        sql += " AND brand = ?"
        args.append(params["brand"][0].strip())

    # Phone only filter
    if "has_phone" in params and params["has_phone"][0].lower() in ("1", "true", "yes"):
        sql += " AND phone_number IS NOT NULL AND phone_number != ''"

    # Price TJS min/max
    if "min_price" in params and params["min_price"][0].isdigit():
        sql += " AND price_tjs >= ?"
        args.append(int(params["min_price"][0]))
    if "max_price" in params and params["max_price"][0].isdigit():
        sql += " AND price_tjs <= ?"
        args.append(int(params["max_price"][0]))

    # Sorting
    sort_order = params.get("sort", ["newest"])[0]
    if sort_order == "price_asc":
        sql += " ORDER BY CASE WHEN price_tjs IS NULL THEN 1 ELSE 0 END, price_tjs ASC"
    elif sort_order == "price_desc":
        sql += " ORDER BY price_tjs DESC"
    elif sort_order == "year_desc":
        sql += " ORDER BY year DESC, created_at DESC"
    elif sort_order == "oldest":
        sql += " ORDER BY created_at ASC"
    else:  # newest default
        sql += " ORDER BY created_at DESC, id DESC"

    rows = cursor.execute(sql, args).fetchall()
    cars = [dict(row) for row in rows]
    conn.close()

    return {
        "count": len(cars),
        "cars": cars,
    }


def get_dashboard_stats() -> Dict[str, Any]:
    conn = get_db_connection()
    cursor = conn.cursor()

    total_cars = cursor.execute("SELECT COUNT(*) FROM cars").fetchone()[0]
    with_phone = cursor.execute("SELECT COUNT(*) FROM cars WHERE phone_number IS NOT NULL AND phone_number != ''").fetchone()[0]
    avg_price_row = cursor.execute("SELECT AVG(price_tjs) FROM cars WHERE price_tjs IS NOT NULL AND price_tjs > 0").fetchone()
    avg_price_tjs = int(avg_price_row[0]) if avg_price_row and avg_price_row[0] else 0

    sellers_count = cursor.execute("SELECT COUNT(DISTINCT seller_username) FROM cars").fetchone()[0]

    top_brands = cursor.execute(
        """
        SELECT brand, COUNT(*) AS count
        FROM cars
        WHERE brand IS NOT NULL
        GROUP BY brand
        ORDER BY count DESC
        LIMIT 6
        """
    ).fetchall()

    seller_distribution = cursor.execute(
        """
        SELECT seller_username, COUNT(*) AS count
        FROM cars
        GROUP BY seller_username
        ORDER BY count DESC
        """
    ).fetchall()

    conn.close()

    return {
        "total_cars": total_cars,
        "with_phone": with_phone,
        "avg_price_tjs": avg_price_tjs,
        "sellers_count": sellers_count,
        "top_brands": [dict(b) for b in top_brands],
        "seller_distribution": [dict(s) for s in seller_distribution],
    }


def get_filter_options() -> Dict[str, Any]:
    conn = get_db_connection()
    cursor = conn.cursor()

    brands = [r[0] for r in cursor.execute("SELECT DISTINCT brand FROM cars WHERE brand IS NOT NULL ORDER BY brand ASC").fetchall()]
    sellers = [r[0] for r in cursor.execute("SELECT DISTINCT seller_username FROM cars ORDER BY seller_username ASC").fetchall()]

    min_price_row = cursor.execute("SELECT MIN(price_tjs) FROM cars WHERE price_tjs > 0").fetchone()
    max_price_row = cursor.execute("SELECT MAX(price_tjs) FROM cars WHERE price_tjs > 0").fetchone()

    conn.close()

    return {
        "brands": brands,
        "sellers": sellers,
        "min_price": min_price_row[0] if min_price_row and min_price_row[0] else 0,
        "max_price": max_price_row[0] if max_price_row and max_price_row[0] else 1000000,
    }


def get_daily_checks() -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    rows = cursor.execute(
        """
        SELECT seller_username, check_date, stories_count, cars_found, last_checked_at
        FROM daily_story_checks
        ORDER BY check_date DESC, cars_found DESC
        """
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


class CarMarketHTTPRequestHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # Enable CORS for local testing
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        query_params = urllib.parse.parse_qs(parsed_url.query)

        # ---------------------------------------------------------
        # REST API ENDPOINTS
        # ---------------------------------------------------------
        if path == "/api/cars":
            data = query_cars(query_params)
            self._send_json(data)
            return

        if path == "/api/stats":
            data = get_dashboard_stats()
            self._send_json(data)
            return

        if path == "/api/filters":
            data = get_filter_options()
            self._send_json(data)
            return

        if path == "/api/daily-checks":
            data = get_daily_checks()
            self._send_json({"checks": data})
            return

        # ---------------------------------------------------------
        # SERVE CAR IMAGES
        # ---------------------------------------------------------
        if path.startswith("/car_images/"):
            rel_path = path[len("/car_images/"):]
            file_path = CAR_IMAGES_DIR / rel_path
            if file_path.exists() and file_path.is_file():
                self._send_file(file_path)
            else:
                self.send_error(404, "Image not found")
            return

        # ---------------------------------------------------------
        # SERVE STATIC FRONTEND FILES
        # ---------------------------------------------------------
        if path in ("/", "/index.html"):
            target = WEB_DIR / "index.html"
            self._send_file(target)
            return

        if path == "/style.css":
            target = WEB_DIR / "style.css"
            self._send_file(target)
            return

        if path == "/app.js":
            target = WEB_DIR / "app.js"
            self._send_file(target)
            return

        # General static files in web folder
        target = WEB_DIR / path.lstrip("/")
        if target.exists() and target.is_file():
            self._send_file(target)
            return

        self.send_error(404, "File not found")

    def _send_json(self, data: Any):
        payload = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _send_file(self, file_path: Path):
        try:
            content = file_path.read_bytes()
            mime_type, _ = mimetypes.guess_type(str(file_path))
            if not mime_type:
                mime_type = "application/octet-stream"

            self.send_response(200)
            self.send_header("Content-Type", f"{mime_type}; charset=utf-8" if "text" in mime_type or "json" in mime_type else mime_type)
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self.send_error(500, f"Error reading file: {e}")


def run_server():
    server_address = ("", PORT)
    httpd = HTTPServer(server_address, CarMarketHTTPRequestHandler)
    print("=" * 55)
    print(f"🚀 Car Market Dashboard Server running at:")
    print(f"👉 http://localhost:{PORT}")
    print(f"👉 http://127.0.0.1:{PORT}")
    print("=" * 55)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
        httpd.server_close()


if __name__ == "__main__":
    run_server()
