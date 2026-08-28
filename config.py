import os
from pathlib import Path

# =========================================================
# SELLERS LIST
# =========================================================
SELLERS = [
    "auto_dubai.tj",
    "auto_umedsho",
    "autofurush.tj",
    "autokhatlon.tj",
    "auto_dromtj",
    "sales_car.tj",
    "tajcars__",
    "tjkcars",
    "taj__auto_car",
    "4444mk01",
]

# =========================================================
# PATHS & DIRECTORIES
# =========================================================
BASE_DIR = Path(__file__).resolve().parent

DB_PATH = str(BASE_DIR / "instagram_monitor.db")
SESSION_DIR = Path.home() / ".instagram-car-monitor"

TEMP_DIR = BASE_DIR / "story_temp"
TEMP_DIR.mkdir(parents=True, exist_ok=True)

CAR_IMAGES_DIR = BASE_DIR / "car_images"
CAR_IMAGES_DIR.mkdir(parents=True, exist_ok=True)

CAR_CATALOG_PATH = BASE_DIR / "car_catalog.json"

# =========================================================
# SCRAPING & MONITOR SETTINGS
# =========================================================
# Default to False for interactive mode; set HEADLESS=1 to run invisibly
HEADLESS = os.environ.get("HEADLESS", "false").lower() in ("true", "1", "yes")

MAX_STORIES_PER_SELLER = 30

# RapidFuzz match threshold (0-100)
FUZZY_MATCH_THRESHOLD = 88.0

# =========================================================
# ANTI-BOT TIMEOUTS & DELAYS (in seconds)
# =========================================================
# Delay between switching story slides
STORY_DELAY_MIN = 2.2
STORY_DELAY_MAX = 4.2

# Delay when opening and inspecting a shared post/reel in a new tab
POST_DELAY_MIN = 3.0
POST_DELAY_MAX = 5.5

# Cooldown delay between checking different seller accounts
SELLER_COOLDOWN_MIN = 4.5
SELLER_COOLDOWN_MAX = 8.5
