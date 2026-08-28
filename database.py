import sqlite3
from typing import Optional, Dict, Any, List

from config import DB_PATH


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def table_exists(cursor: sqlite3.Cursor, table_name: str) -> bool:
    cursor.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1",
        (table_name,),
    )
    return cursor.fetchone() is not None


def get_table_columns(cursor: sqlite3.Cursor, table_name: str) -> List[str]:
    cursor.execute(f"PRAGMA table_info({table_name})")
    return [row[1] for row in cursor.fetchall()]


def init_db():
    """
    Initializes the SQLite database schema:
    1. Unified `cars` table (individual columns only, no raw_text).
    2. `seller_checkpoints` table tracking the last processed story ID per seller.
    3. `daily_story_checks` audit table.
    """
    conn = get_connection()
    cursor = conn.cursor()

    # If cars table already exists, verify columns integrity
    if table_exists(cursor, "cars"):
        cols = get_table_columns(cursor, "cars")
        if "raw_text" in cols:
            try:
                cursor.execute("ALTER TABLE cars DROP COLUMN raw_text")
            except Exception:
                pass
        if "phone_number" not in cols:
            cursor.execute("ALTER TABLE cars ADD COLUMN phone_number TEXT")

    cursor.execute("""
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
        )
    """)

    # Checkpoint table: Stores the single highest/last seen story ID per seller
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS seller_checkpoints (
            seller_username TEXT PRIMARY KEY,
            last_story_id TEXT NOT NULL,
            last_checked_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Daily monitoring audit history table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS daily_story_checks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            seller_username TEXT NOT NULL,
            check_date DATE NOT NULL,
            stories_count INTEGER DEFAULT 0,
            cars_found INTEGER DEFAULT 0,
            last_checked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(seller_username, check_date)
        )
    """)

    # Indexes
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_cars_seller ON cars(seller_username)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_cars_brand_model ON cars(brand, model)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_cars_price_tjs ON cars(price_tjs)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_cars_source_key ON cars(source_key)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_daily_checks_date ON daily_story_checks(check_date)")

    conn.commit()
    conn.close()


def get_last_story_id(seller_username: str) -> Optional[str]:
    """Retrieves the last processed story ID checkpoint for a seller."""
    conn = get_connection()
    cursor = conn.cursor()
    row = cursor.execute(
        "SELECT last_story_id FROM seller_checkpoints WHERE seller_username=? LIMIT 1",
        (seller_username,),
    ).fetchone()
    conn.close()
    return str(row["last_story_id"]) if row and row["last_story_id"] else None


def update_last_story_id(seller_username: str, last_story_id: str):
    """Updates the last processed story ID checkpoint for a seller."""
    if not last_story_id:
        return

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO seller_checkpoints (seller_username, last_story_id, last_checked_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(seller_username) DO UPDATE SET
            last_story_id = excluded.last_story_id,
            last_checked_at = CURRENT_TIMESTAMP
        """,
        (seller_username, str(last_story_id)),
    )
    conn.commit()
    conn.close()


def record_daily_check(seller_username: str, stories_checked: int, cars_found: int):
    """Records or updates the daily check statistics for a seller."""
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            INSERT INTO daily_story_checks (seller_username, check_date, stories_count, cars_found, last_checked_at)
            VALUES (?, DATE('now'), ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(seller_username, check_date) DO UPDATE SET
                stories_count = stories_count + excluded.stories_count,
                cars_found = cars_found + excluded.cars_found,
                last_checked_at = CURRENT_TIMESTAMP
            """,
            (seller_username, stories_checked, cars_found),
        )
        conn.commit()
    finally:
        conn.close()


def car_exists(source_key: str) -> bool:
    """Checks if a car listing with the given source_key is already present in DB."""
    if not source_key:
        return False

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT 1 FROM cars WHERE source_key=? LIMIT 1", (source_key,))
    exists = cursor.fetchone() is not None
    conn.close()
    return exists


def save_car(
    seller_username: str,
    source_type: str,
    source_key: str,
    source_url: Optional[str],
    car_data: Dict[str, Any],
    image_url: Optional[str] = None,
    image_path: Optional[str] = None,
) -> bool:
    """
    Inserts a verified car record into the cars table without redundant raw_text.
    Prevents duplicates via INSERT OR IGNORE on source_key UNIQUE constraint.
    """
    conn = get_connection()
    cursor = conn.cursor()

    try:
        cursor.execute(
            """
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
            """,
            (
                seller_username,
                car_data.get("brand"),
                car_data.get("model"),
                car_data.get("year"),
                car_data.get("month"),
                car_data.get("mileage"),
                car_data.get("production"),
                car_data.get("transmission"),
                car_data.get("fuel"),
                car_data.get("engine"),
                car_data.get("condition"),
                car_data.get("price_tjs"),
                car_data.get("price_usd"),
                car_data.get("phone_number"),
                source_type,
                source_url,
                source_key,
                image_url,
                image_path,
            ),
        )
        inserted = cursor.rowcount > 0
        conn.commit()
        return inserted
    finally:
        conn.close()


def get_db_summary() -> Dict[str, Any]:
    """Returns total car count, phone numbers captured count, and breakdown per seller."""
    conn = get_connection()
    cursor = conn.cursor()

    total = cursor.execute("SELECT COUNT(*) FROM cars").fetchone()[0]
    with_phone = cursor.execute("SELECT COUNT(*) FROM cars WHERE phone_number IS NOT NULL").fetchone()[0]

    rows = cursor.execute(
        """
        SELECT seller_username, COUNT(*) AS count
        FROM cars
        GROUP BY seller_username
        ORDER BY count DESC
        """
    ).fetchall()

    breakdown = {row["seller_username"]: row["count"] for row in rows}
    conn.close()

    return {
        "total": total,
        "with_phone": with_phone,
        "breakdown": breakdown,
    }


def get_daily_checks_summary() -> List[Dict[str, Any]]:
    """Returns today's story check stats per seller."""
    conn = get_connection()
    cursor = conn.cursor()

    rows = cursor.execute(
        """
        SELECT seller_username, check_date, stories_count, cars_found, last_checked_at
        FROM daily_story_checks
        WHERE check_date = DATE('now')
        ORDER BY cars_found DESC, stories_count DESC
        """
    ).fetchall()

    result = [dict(r) for r in rows]
    conn.close()
    return result
