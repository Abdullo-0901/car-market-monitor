import re
from typing import Optional, Tuple, Dict, Any

from car_normalizer import normalize_brand_name, normalize_car_model, BRAND_MAPPING


# =========================================================
# HELPER FUNCTIONS
# =========================================================

def clean_number(value: Optional[str]) -> Optional[int]:
    """Extracts integer digits from a string (e.g., '35.000' -> 35000)."""
    if not value:
        return None
    digits = re.sub(r"[^\d]", "", value)
    return int(digits) if digits else None


def normalize_instagram_url(url: Optional[str]) -> Optional[str]:
    """Ensures a clean canonical Instagram URL."""
    if not url:
        return None

    if url.startswith("/"):
        url = "https://www.instagram.com" + url

    url = url.split("?")[0]
    if not url.endswith("/"):
        url += "/"

    return url


def clean_ui_noise(text: str) -> str:
    """Removes common Instagram / Story UI and watermark noise before parsing."""
    if not text:
        return ""

    # Remove UI headers and footers
    cleaned = re.sub(r"\b(?:Instagzam|Instagram|Insta)\b", " ", text, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bReply to\b.*", " ", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bSend message\b.*", " ", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bAUTOTUNING\b", " ", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bTAJIKISTAN\b", " ", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"[@©]\w+", " ", cleaned)  # watermarks like @4444mk01, ©4444MK01

    return re.sub(r"[ \t]+", " ", cleaned).strip()


# =========================================================
# PHONE NUMBER PARSER
# =========================================================

def parse_phone_number(text: str) -> Optional[str]:
    """
    Extracts and standardizes contact phone numbers (e.g. from Tajikistan).
    Supports formats:
      - 'Тел.+992 557 94 49 49'
      - 'Тел: +992 907 77 01 10'
      - 'TEL 901404444'
      - 'WhatsApp: +992 974 44 44 54'
      - '+992907770110'
    Returns normalized phone string e.g. '+992 907 77 01 10' or None.
    """
    if not text:
        return None

    # 1. Search for explicitly labeled phone prefixes
    labeled_pattern = (
        r"(?:Тел|Tel|Телефон|WhatsApp|W/A|Вайбер|Viber|Номер|Мурочиат|Тамос)\s*[:.\-]?\s*"
        r"(\+?992[\d\s.\-]{8,16}|\b[05789]\d[\d\s.\-]{7,13})"
    )
    match = re.search(labeled_pattern, text, re.IGNORECASE)
    if match:
        raw_phone = match.group(1)
        digits = re.sub(r"[^\d]", "", raw_phone)
        if len(digits) == 9:  # local 9-digit (e.g., 901404444 or 028246767)
            digits = "992" + digits
        if len(digits) == 12 and digits.startswith("992"):
            return f"+{digits[:3]} {digits[3:6]} {digits[6:8]} {digits[8:10]} {digits[10:12]}"

    # 2. Search for explicit +992 or 992 international number pattern
    direct_pattern = r"(?:\+992|(?<!\d)992)[\s.\-]?([5789]\d{2})[\s.\-]?(\d{2})[\s.\-]?(\d{2})[\s.\-]?(\d{2})"
    m2 = re.search(direct_pattern, text)
    if m2:
        return f"+992 {m2.group(1)} {m2.group(2)} {m2.group(3)} {m2.group(4)}"

    # 3. Standalone pattern with spaces/dots: e.g., +992 557 94 49 49
    generic_992 = r"(?:\+992|(?<!\d)992)[\s.\-]?(\d{9})"
    m3 = re.search(generic_992, re.sub(r"[\s.\-]", "", text))
    if m3:
        digits = "992" + m3.group(1)
        return f"+{digits[:3]} {digits[3:6]} {digits[6:8]} {digits[8:10]} {digits[10:12]}"

    return None


# =========================================================
# PRICE PARSER
# =========================================================

def parse_prices(text: str) -> Tuple[Optional[int], Optional[int]]:
    """
    Parses TJS and USD prices from text.
    Supports formats:
      - TJS: 77 .000c, 77.000c, 770.900C, 1.487.900C, 77 000 сомони, 77 000 TJS
      - USD: 23.900$, 82.900$, 23900$, $23900
      - Dual: 82.900$ 770.900C
    Returns (price_tjs, price_usd).
    """
    price_tjs: Optional[int] = None
    price_usd: Optional[int] = None

    if not text:
        return None, None

    # 1. Look for explicit labeled prices: e.g. "Цена: 327 .000c" or "Цена: 23.900$"
    label_match = re.search(
        r"(?:Цена|Нарх|Price|Нархи|Нархш)\s*[:\-]?\s*([\d\s.,]+)\s*([cс$]|сомони|tjs|usd)?",
        text,
        re.IGNORECASE,
    )
    if label_match:
        val_str = label_match.group(1).strip()
        curr_str = (label_match.group(2) or "").strip().lower()
        val = clean_number(val_str)

        context_around = text[label_match.start(): min(len(text), label_match.end() + 10)].lower()

        if val and (val >= 1000):
            if "$" in context_around or "usd" in context_around or curr_str == "$":
                price_usd = val
            elif any(c in context_around for c in ["c", "с", "сомони", "tjs"]) or curr_str in ["c", "с", "сомони", "tjs"]:
                price_tjs = val
            else:
                price_tjs = val

    # 2. USD regex: e.g. 23.900$, 82.900$, $82,900
    usd_matches = re.findall(
        r"(?:\$\s*(\d{1,3}(?:[.\s,]\d{3})+|\d{4,7})|(\d{1,3}(?:[.\s,]\d{3})+|\d{4,7})\s*\$)",
        text,
        re.IGNORECASE,
    )
    if usd_matches:
        for m in usd_matches:
            raw_val = m[0] or m[1]
            val = clean_number(raw_val)
            if val and 1000 <= val <= 2_000_000:
                price_usd = val
                break

    # 3. TJS regex: e.g. 77 .000c, 770.900C, 1.487.900C, 77 000 сомони, 77000 TJS
    tjs_patterns = [
        r"(?<!\d)(\d{1,3}(?:[.\s,]\s*\d{3})+|\d{4,8})\s*[cсCС](?![A-Za-zА-Яа-я0-9])",
        r"(?<!\d)(\d{1,3}(?:[.\s,]\s*\d{3})+|\d{4,8})\s*(?:сомони|tjs)\b",
    ]
    for pat in tjs_patterns:
        found = re.findall(pat, text, re.IGNORECASE)
        if found:
            for item in found:
                val = clean_number(item)
                if val and 5000 <= val <= 20_000_000:
                    price_tjs = val
                    break
            if price_tjs:
                break

    return price_tjs, price_usd


# =========================================================
# YEAR & MONTH PARSER
# =========================================================

def parse_year_month(text: str) -> Tuple[Optional[int], Optional[int]]:
    """
    Parses manufacturing year and optional month.
    Supports: 2023, 2023.07, 2026.5, 2023 07, 2023/07, 2023-07
    Returns (year, month).
    """
    if not text:
        return None, None

    year: Optional[int] = None
    month: Optional[int] = None

    # Labeled year: Год: 2023.07 or Год выпуска: 2023
    year_match = re.search(
        r"(?:Год выпуска|Год|Year|Соли баромад|Сол)\s*[:\-]?\s*(19\d{2}|20\d{2})(?:[\s./-]+(\d{1,2}))?",
        text,
        re.IGNORECASE,
    )
    if year_match:
        year = int(year_match.group(1))
        if year_match.group(2):
            m = int(year_match.group(2))
            if 1 <= m <= 12:
                month = m
        return year, month

    # Standalone year pattern (1990 - 2030) with optional month
    date_match = re.search(r"\b(19[89]\d|20[0-3]\d)(?:[./-](\d{1,2}))?\b", text)
    if date_match:
        year = int(date_match.group(1))
        if date_match.group(2):
            m = int(date_match.group(2))
            if 1 <= m <= 12:
                month = m

    return year, month


# =========================================================
# MILEAGE PARSER
# =========================================================

def parse_mileage(text: str) -> Optional[int]:
    """
    Parses vehicle mileage into an integer.
    Supports: 35.000km, 35 000 km, 35.000ml, 35.000mp, 244.000KM, 31 000KM
    """
    if not text:
        return None

    # Labeled mileage
    match = re.search(
        r"(?:Пробег|Mileage|Пробегш|Масофа)\s*[:\-]?\s*([\d\s.,]+)\s*(?:km|км|ml|mp|mil|mi)?",
        text,
        re.IGNORECASE,
    )
    if match:
        val = clean_number(match.group(1))
        if val is not None and val < 2_000_000:
            return val

    # Standalone mileage with unit: 244.000km, 35 000 km, 35.000mp
    standalone_match = re.search(
        r"(?<!\d)(\d{1,3}(?:[.\s]\d{3})+|\d{2,6})\s*(?:km|км|ml|mp|миль|km/ч)\b",
        text,
        re.IGNORECASE,
    )
    if standalone_match:
        val = clean_number(standalone_match.group(1))
        if val is not None and val < 2_000_000:
            return val

    return None


# =========================================================
# ENGINE VOLUME PARSER
# =========================================================

def parse_engine(text: str) -> Optional[float]:
    """
    Parses engine displacement (e.g., 2.5, 3.2, 4.4).
    """
    if not text:
        return None

    # Labeled engine: Двигатель: 2.5 or Мотор: 4.4
    match = re.search(
        r"(?:Двигатель|Мотор|Объем|Объём|Engine)\s*[:\-]?\s*([\d.,]+)\s*(?:L|л|V[468]|V12)?",
        text,
        re.IGNORECASE,
    )
    if match:
        try:
            val_str = match.group(1).replace(",", ".")
            eng = float(val_str)
            if 0.6 <= eng <= 8.5:
                return eng
        except ValueError:
            pass

    # Unlabeled engine: e.g. 4.4 V8, 2.5L, 3.5 V6, 3.0 twin turbo
    match_free = re.search(r"\b([1-7][.,]\d)\s*(?:V[468]|L\b|л\b|TT\b|турбо|turbo|twin)", text, re.IGNORECASE)
    if match_free:
        try:
            val_str = match_free.group(1).replace(",", ".")
            eng = float(val_str)
            if 0.6 <= eng <= 8.5:
                return eng
        except ValueError:
            pass

    # Standalone like 'BMW M6 4.4 ...'
    match_standalone = re.search(r"\b([1-6][.,]\d)\b", text)
    if match_standalone:
        try:
            val_str = match_standalone.group(1).replace(",", ".")
            eng = float(val_str)
            if 0.8 <= eng <= 6.5:
                return eng
        except ValueError:
            pass

    return None


# =========================================================
# BRAND & MODEL PARSER
# =========================================================

def parse_brand_and_model(text: str) -> Tuple[Optional[str], Optional[str]]:
    """
    Parses brand and model from labeled caption or raw story text,
    stripping UI artifacts and applying RapidFuzz normalization.
    """
    if not text:
        return None, None

    cleaned_text = clean_ui_noise(text)
    raw_brand: Optional[str] = None
    raw_model: Optional[str] = None

    # 1. Labeled model: e.g. "Модель TOYOTA RAV4" or "Модель: RENGE ROVER P550E"
    model_label_match = re.search(
        r"(?:Модель автомобиля|Модель|Model|Марка)\s*[:\-]?\s*([^\n\r]+)",
        cleaned_text,
        re.IGNORECASE,
    )

    if model_label_match:
        line = re.sub(r"\s+", " ", model_label_match.group(1)).strip()
        upper_line = line.upper()

        for alias in sorted(BRAND_MAPPING.keys(), key=len, reverse=True):
            if upper_line.startswith(alias):
                raw_brand = BRAND_MAPPING[alias]
                raw_model = line[len(alias):].strip(" :-")
                # If alias is a model itself (e.g. CAMRY, LC PRADO, DEFENDER)
                if alias in ("CAMRY", "CAMRY-6"):
                    raw_model = f"Camry {raw_model}".strip()
                elif alias in ("LC PRADO", "LC PRAD0", "PRADO", "LAND CRUISER PRADO"):
                    raw_model = f"Land Cruiser Prado {raw_model}".strip()
                elif alias in ("LC300", "LC 300"):
                    raw_model = f"Land Cruiser 300 {raw_model}".strip()
                elif alias in ("RR DEFENDER", "DEFENDER"):
                    raw_model = f"Defender {raw_model}".strip()
                elif alias in ("SANTAFE", "SANTA FE", "SANTAFEE"):
                    raw_model = f"Santa Fe {raw_model}".strip()
                break

        if not raw_brand:
            parts = line.split(maxsplit=1)
            raw_brand = parts[0]
            raw_model = parts[1] if len(parts) > 1 else None

    # 2. Unlabeled / Story text (e.g. "LC PRAD0 D3 2.5 TT EUROPA 2026.5 FULL 82.900$")
    if not raw_brand:
        upper_text = re.sub(r"\s+", " ", cleaned_text).upper()

        for alias in sorted(BRAND_MAPPING.keys(), key=len, reverse=True):
            pattern = rf"(?:\b|^){re.escape(alias)}(?:\b|$)"
            match = re.search(pattern, upper_text)
            if match:
                pos = match.start()
                raw_brand = BRAND_MAPPING[alias]

                orig_segment = re.sub(r"\s+", " ", cleaned_text)[pos + len(alias):]

                # Cut off immediately before prices, years, phone numbers, or metadata words
                cut_match = re.split(
                    r"[\n\r]|(?:\b\d{1,3}(?:[.\s]\d{3})+\s*[$сcCС])|(?:\b\d{4,7}\s*[$сcCС])|"
                    r"(?:\b(19\d{2}|20\d{2})\b)|"
                    r"\b(?:TEL|Тел|WhatsApp|Phone|Номер|Цена|Нарх|Price|Год|Пробег|Reply|Send|AUTOTUNING|TAJIKISTAN)\b",
                    orig_segment,
                    maxsplit=1,
                    flags=re.IGNORECASE,
                )
                raw_model = cut_match[0].strip(" :-")

                # If alias itself represents a specific model
                if alias in ("CAMRY", "CAMRY-6"):
                    raw_model = f"Camry {raw_model}".strip()
                elif alias in ("LC PRADO", "LC PRAD0", "PRADO", "LAND CRUISER PRADO"):
                    raw_model = f"Land Cruiser Prado {raw_model}".strip()
                elif alias in ("LC300", "LC 300"):
                    raw_model = f"Land Cruiser 300 {raw_model}".strip()
                elif alias in ("RR DEFENDER", "DEFENDER"):
                    raw_model = f"Defender {raw_model}".strip()
                elif alias in ("SANTAFE", "SANTA FE", "SANTAFEE"):
                    raw_model = f"Santa Fe {raw_model}".strip()

                break

    # Clean residual specification terms and phone fragments from model string
    if raw_model:
        raw_model = re.sub(r"\b(?:FULL|ABTOCAЛOH|АВТОСАЛОН|EUROPA|AMERIKA|KOREA|БЕ ГУМРУК|РАСТАМОЖКА|M PACKET|M SPORT|COMPETITION|EDITION)\b", "", raw_model, flags=re.IGNORECASE)
        raw_model = re.sub(r"\b\d{6,}\b", "", raw_model)  # remove rogue phone digits
        raw_model = re.sub(r"\s+", " ", raw_model).strip(" :-.,")

    return normalize_car_model(raw_brand, raw_model)


# =========================================================
# FULL CAR TEXT PARSER
# =========================================================

def parse_car_text(text: str) -> Dict[str, Any]:
    """
    Extracts all car attributes from text (Caption or Story OCR).
    """
    result: Dict[str, Any] = {
        "brand": None,
        "model": None,
        "year": None,
        "month": None,
        "mileage": None,
        "production": None,
        "transmission": None,
        "fuel": None,
        "engine": None,
        "condition": None,
        "price_tjs": None,
        "price_usd": None,
        "phone_number": None,
    }

    if not text:
        return result

    # 1. Brand & Model
    brand, model = parse_brand_and_model(text)
    result["brand"] = brand
    result["model"] = model

    # 2. Year & Month
    year, month = parse_year_month(text)
    result["year"] = year
    result["month"] = month

    # 3. Mileage
    result["mileage"] = parse_mileage(text)

    # 4. Engine
    result["engine"] = parse_engine(text)

    # 5. Prices
    price_tjs, price_usd = parse_prices(text)
    result["price_tjs"] = price_tjs
    result["price_usd"] = price_usd

    # 6. Phone Number
    result["phone_number"] = parse_phone_number(text)

    # 7. Additional Specs
    spec_patterns = {
        "production": r"(?:Производство|Истехсол|Production)\s*[:\-]?\s*([^\n\r]+)",
        "transmission": r"(?:Трансмиссия|Коробка|Transmission)\s*[:\-]?\s*([^\n\r]+)",
        "fuel": r"(?:Топливо|Сулхо|Fuel)\s*[:\-]?\s*([^\n\r]+)",
        "condition": r"(?:Состояние|Холат|Condition)\s*[:\-]?\s*([^\n\r]+)",
    }
    for key, pat in spec_patterns.items():
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            result[key] = m.group(1).strip()

    return result


# =========================================================
# VALIDATION
# =========================================================

def is_valid_listing(data: Dict[str, Any]) -> bool:
    """
    Validates if parsed data represents a genuine marketplace car listing.
    Criteria:
      - brand or model must be identified
      - AND at least one valid price (price_tjs or price_usd) must exist.
    """
    has_car = bool(data.get("brand") or data.get("model"))
    has_price = bool(data.get("price_tjs") or data.get("price_usd"))
    return bool(has_car and has_price)
