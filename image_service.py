import hashlib
import re
from pathlib import Path
from typing import Optional

from config import CAR_IMAGES_DIR, TEMP_DIR


def safe_filename(text: str) -> str:
    """Sanitizes text for filesystem directory and file names."""
    return re.sub(r"[^A-Za-z0-9_.-]", "_", text)


def get_image_hash_filename(source_key: str, ext: str = ".jpg") -> str:
    """Generates a consistent 16-character SHA-256 hash filename for a source key."""
    digest = hashlib.sha256(source_key.encode("utf-8")).hexdigest()[:16]
    return f"{digest}{ext}"


def download_image(
    context,
    image_url: Optional[str],
    seller_username: str,
    source_key: str,
) -> Optional[str]:
    """
    Downloads an image using Playwright's authenticated request context.
    Saves it under car_images/<seller_username>/<hash>.<ext> and returns relative path.
    """
    if not image_url:
        return None

    seller_folder = safe_filename(seller_username)
    seller_dir = CAR_IMAGES_DIR / seller_folder
    seller_dir.mkdir(parents=True, exist_ok=True)

    try:
        response = context.request.get(
            image_url,
            timeout=30_000,
            headers={
                "Referer": "https://www.instagram.com/",
            },
        )

        if not response.ok:
            return None

        content_type = (response.headers.get("content-type") or "").lower()
        if "png" in content_type:
            ext = ".png"
        elif "webp" in content_type:
            ext = ".webp"
        else:
            ext = ".jpg"

        filename = get_image_hash_filename(source_key, ext)
        target_path = seller_dir / filename
        target_path.write_bytes(response.body())

        # Return standardized relative path for DB and Web UI
        return f"car_images/{seller_folder}/{filename}"

    except Exception as e:
        print(f"⚠️ Image download error: {e}")
        return None


def save_story_screenshot(page, seller_username: str, source_key: str) -> Optional[str]:
    """
    Takes a screenshot of the current story viewer and saves it to car_images/<seller_username>/
    """
    seller_folder = safe_filename(seller_username)
    seller_dir = CAR_IMAGES_DIR / seller_folder
    seller_dir.mkdir(parents=True, exist_ok=True)

    filename = get_image_hash_filename(source_key, "_story.png")
    target_path = seller_dir / filename

    try:
        page.screenshot(path=str(target_path), full_page=False)
        return f"car_images/{seller_folder}/{filename}"
    except Exception as e:
        print(f"⚠️ Story screenshot error: {e}")
        return None


def get_story_media_image_url(page) -> Optional[str]:
    """
    Finds the largest visible media image or video poster inside the current story viewer.
    Filters out UI icons and tiny avatars.
    """
    try:
        candidates = page.locator("img, video").evaluate_all(
            """
            elements => elements.map(el => {
                const r = el.getBoundingClientRect();
                const style = window.getComputedStyle(el);
                const visible = style.display !== 'none' &&
                                style.visibility !== 'hidden' &&
                                r.width > 250 && r.height > 250;

                let url = '';
                if (el.tagName === 'VIDEO') {
                    url = el.poster || '';
                } else {
                    url = el.currentSrc || el.src || '';
                }

                return {
                    url,
                    area: r.width * r.height,
                    visible
                };
            }).filter(x => x.visible && x.url)
              .sort((a, b) => b.area - a.area)
            """
        )

        if candidates:
            return candidates[0].get("url")
    except Exception:
        pass

    return None


def create_temp_screenshot(page, seller_username: str, index: int) -> Path:
    """Takes a quick screenshot for OCR in the story_temp directory."""
    filename = f"{safe_filename(seller_username)}_{index}_{hashlib.sha256(str(page.url).encode()).hexdigest()[:8]}.png"
    target = TEMP_DIR / filename
    page.screenshot(path=str(target), full_page=False)
    return target


def clean_temp_file(path: Optional[Path]):
    """Safely removes a temporary file."""
    if path and isinstance(path, Path) and path.exists():
        try:
            path.unlink()
        except Exception:
            pass


def clean_all_temp_files():
    """Cleans up all files in the story_temp directory at the end of a run."""
    try:
        for file in TEMP_DIR.glob("*"):
            if file.is_file():
                file.unlink()
    except Exception:
        pass
