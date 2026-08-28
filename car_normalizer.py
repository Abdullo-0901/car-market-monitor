import json
import re
from typing import Optional, Tuple, List, Dict
from rapidfuzz import fuzz, process

from config import CAR_CATALOG_PATH, FUZZY_MATCH_THRESHOLD

# =========================================================
# BRAND CANONICAL MAPPING
# =========================================================
BRAND_MAPPING = {
    "BMW": "BMW",
    "MERCEDES": "Mercedes-Benz",
    "MERCEDES-BENZ": "Mercedes-Benz",
    "MERCEDES BENZ": "Mercedes-Benz",
    "МЕРСЕДЕС": "Mercedes-Benz",
    "TOYOTA": "Toyota",
    "ТОЙОТА": "Toyota",
    "LEXUS": "Lexus",
    "ЛЕКСУС": "Lexus",
    "HYUNDAI": "Hyundai",
    "ХУНДАЙ": "Hyundai",
    "KIA": "Kia",
    "КИА": "Kia",
    "CHEVROLET": "Chevrolet",
    "ШЕВРОЛЕ": "Chevrolet",
    "AUDI": "Audi",
    "АУДИ": "Audi",
    "PORSCHE": "Porsche",
    "ПОРШ": "Porsche",
    "HONDA": "Honda",
    "ХОНДА": "Honda",
    "NISSAN": "Nissan",
    "НИССАН": "Nissan",
    "INFINITI": "Infiniti",
    "ИНФИНИТИ": "Infiniti",
    "MAZDA": "Mazda",
    "МАЗДА": "Mazda",
    "MITSUBISHI": "Mitsubishi",
    "МИТСУБИСИ": "Mitsubishi",
    "VOLKSWAGEN": "Volkswagen",
    "ФОЛЬКСВАГЕН": "Volkswagen",
    "VW": "Volkswagen",
    "VOLVO": "Volvo",
    "ВОЛЬВО": "Volvo",
    "FORD": "Ford",
    "ФОРД": "Ford",
    "TESLA": "Tesla",
    "ТЕСЛА": "Tesla",
    "BYD": "BYD",
    "БИД": "BYD",
    "ZEEKR": "Zeekr",
    "ЗИКР": "Zeekr",
    "GEELY": "Geely",
    "ДЖИЛИ": "Geely",
    "CHERY": "Chery",
    "ЧЕРИ": "Chery",
    "HAVAL": "Haval",
    "ХАВАЛ": "Haval",
    "EXEED": "Exeed",
    "ЭКСИД": "Exeed",
    "CHANGAN": "Changan",
    "ЧАНГАН": "Changan",
    "HONGQI": "Hongqi",
    "ХОНЧИ": "Hongqi",
    "LI AUTO": "Li Auto",
    "LIXIANG": "Li Auto",
    "ЛИ АВТО": "Li Auto",
    "LAND ROVER": "Land Rover",
    "RANGE ROVER": "Land Rover",
    "RENGE ROVER": "Land Rover",
    "ЛЕНД РОВЕР": "Land Rover",
    "РЕЙНДЖ РОВЕР": "Land Rover",
    "GENESIS": "Genesis",
    "ДЖЕНЕЗИС": "Genesis",
    "GAC": "GAC",
    "JETOUR": "Jetour",
    "ДЖЕТУР": "Jetour",
    "OMODA": "Omoda",
    "JAECOO": "Jaecoo",
    "VOYAH": "Voyah",
    "NIO": "NIO",
    "XPENG": "XPeng",
    "DENZA": "Denza",
    "AVATR": "Avatr",
    "TANK": "Tank",
    "ТАНК": "Tank",
    "ROX": "Rox",
    "MG": "MG",
    "BENTLEY": "Bentley",
    "FERRARI": "Ferrari",
    "LAMBORGHINI": "Lamborghini",
    "ROLLS-ROYCE": "Rolls-Royce",
    "ROLLS ROYCE": "Rolls-Royce",
    "ASTON MARTIN": "Aston Martin",
}


def normalize_brand_name(brand: Optional[str]) -> Optional[str]:
    """Standardizes brand string based on canonical rules."""
    if not brand:
        return None

    cleaned = re.sub(r"\s+", " ", brand).strip()
    upper = cleaned.upper()

    if upper in BRAND_MAPPING:
        return BRAND_MAPPING[upper]

    if upper == "BMW":
        return "BMW"
    if upper == "BYD":
        return "BYD"
    if upper in ("NIO", "GAC", "MG", "VW"):
        return upper

    return cleaned.title()


class CarCatalogNormalizer:
    def __init__(self, catalog_path=CAR_CATALOG_PATH):
        self.catalog: List[Dict] = []
        self.alias_to_entry: Dict[str, Tuple[str, str]] = {}
        self.alias_list: List[str] = []
        self.load_catalog(catalog_path)

    def load_catalog(self, path):
        if not path or not path.exists():
            return

        try:
            with open(path, "r", encoding="utf-8") as f:
                self.catalog = json.load(f)

            for item in self.catalog:
                brand = item.get("brand", "")
                model = item.get("model", "")
                aliases = item.get("aliases", [])

                full_canonical = f"{brand} {model}".upper()
                self.alias_to_entry[full_canonical] = (brand, model)
                if full_canonical not in self.alias_list:
                    self.alias_list.append(full_canonical)

                for alias in aliases:
                    alias_upper = alias.strip().upper()
                    if alias_upper:
                        self.alias_to_entry[alias_upper] = (brand, model)
                        if alias_upper not in self.alias_list:
                            self.alias_list.append(alias_upper)

        except Exception as e:
            print(f"⚠️ Error loading car catalog: {e}")

    def normalize(
        self,
        raw_brand: Optional[str],
        raw_model: Optional[str],
        threshold: float = FUZZY_MATCH_THRESHOLD,
    ) -> Tuple[Optional[str], Optional[str]]:
        """
        Normalizes brand and model.
        Uses RapidFuzz to match against catalog aliases.
        If fuzzy similarity >= threshold, returns normalized (brand, model).
        Otherwise falls back to cleanly normalized parsed brand and model.
        """
        norm_brand = normalize_brand_name(raw_brand)
        clean_model = re.sub(r"\s+", " ", raw_model or "").strip() if raw_model else None

        # Build candidate query strings (full and sub-phrases)
        candidates = []
        words = clean_model.split() if clean_model else []

        if raw_brand and clean_model:
            candidates.append(f"{raw_brand} {clean_model}".upper())
        if clean_model:
            candidates.append(clean_model.upper())

        # Sub-phrases if model has multiple words (e.g. "M6 4.4 V8 COMPETITION" -> "M6", "M6 4.4")
        if words:
            for i in range(1, min(len(words), 4)):
                sub = " ".join(words[:i]).upper()
                if raw_brand:
                    candidates.append(f"{raw_brand} {sub}".upper())
                candidates.append(sub)

        if raw_brand:
            candidates.append(raw_brand.upper())

        # 1. Exact lookup first
        for cand in candidates:
            if cand in self.alias_to_entry:
                b, m = self.alias_to_entry[cand]
                return b, m

        # 2. RapidFuzz matching if catalog is available
        if self.alias_list:
            best_match = None
            best_score = 0.0

            for cand in candidates:
                # token_sort_ratio for robust token matching
                match = process.extractOne(
                    cand,
                    self.alias_list,
                    scorer=fuzz.token_sort_ratio,
                )
                if match:
                    matched_alias, score, _ = match
                    if score > best_score:
                        best_score = score
                        best_match = matched_alias

            if best_match and best_score >= threshold:
                matched_brand, matched_model = self.alias_to_entry[best_match]
                return matched_brand, matched_model

        # Fallback to normalized brand and clean model
        if raw_brand and raw_brand.upper() in ("RANGE ROVER", "RENGE ROVER"):
            norm_brand = "Land Rover"
            if clean_model and not clean_model.lower().startswith("range rover"):
                clean_model = f"Range Rover {clean_model}".strip()
            elif not clean_model:
                clean_model = "Range Rover"

        return norm_brand, clean_model


# Singleton instance
_normalizer = CarCatalogNormalizer()


def normalize_car_model(
    brand: Optional[str],
    model: Optional[str],
    threshold: float = FUZZY_MATCH_THRESHOLD,
) -> Tuple[Optional[str], Optional[str]]:
    return _normalizer.normalize(brand, model, threshold=threshold)
