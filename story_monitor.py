import hashlib
import random
import re
import time
from pathlib import Path
from typing import Dict, Any, Optional
from playwright.sync_api import sync_playwright

from config import (
    SELLERS,
    DB_PATH,
    SESSION_DIR,
    HEADLESS,
    MAX_STORIES_PER_SELLER,
    CAR_IMAGES_DIR,
    SELLER_COOLDOWN_MIN,
    SELLER_COOLDOWN_MAX,
)
from database import (
    init_db,
    car_exists,
    save_car,
    get_db_summary,
    record_daily_check,
    get_daily_checks_summary,
    get_last_story_id,
    update_last_story_id,
)
from parsers import parse_car_text, is_valid_listing
from ocr_service import ocr_service
from image_service import (
    download_image,
    save_story_screenshot,
    get_story_media_image_url,
    create_temp_screenshot,
    clean_temp_file,
    clean_all_temp_files,
    safe_filename,
)
from instagram_client import (
    wait_for_login,
    get_story_fingerprint,
    find_post_in_story,
    go_to_next_story,
    get_post_info,
)


def format_car_summary_line(car_data: Dict[str, Any]) -> str:
    brand = car_data.get("brand") or ""
    model = car_data.get("model") or ""
    year = f" {car_data['year']}" if car_data.get("year") else ""
    return f"🚗 {brand} {model}{year}".strip()


def format_price_line(car_data: Dict[str, Any]) -> str:
    prices = []
    if car_data.get("price_tjs"):
        prices.append(f"{car_data['price_tjs']} TJS")
    if car_data.get("price_usd"):
        prices.append(f"{car_data['price_usd']} USD")
    return f"💰 {' / '.join(prices)}" if prices else "💰 No price specified"


def extract_story_id_from_url(url: str) -> Optional[str]:
    """Extracts numeric story ID from Instagram story URL."""
    if not url:
        return None
    match = re.search(r"/stories/[^/]+/(\d+)", url)
    return match.group(1) if match else None


def is_story_id_older_or_equal(current_id: Optional[str], checkpoint_id: Optional[str]) -> bool:
    """Checks if current story ID has already been seen in a previous run."""
    if not current_id or not checkpoint_id:
        return False

    try:
        return int(current_id) <= int(checkpoint_id)
    except ValueError:
        return str(current_id) == str(checkpoint_id)


def check_seller(context, page, seller: str, stats: Dict[str, int]):
    print("\n=========================================")
    print(f"Checking @{seller}")

    story_url = f"https://www.instagram.com/stories/{seller}/"

    try:
        page.goto(
            story_url,
            wait_until="domcontentloaded",
            timeout=60_000,
        )
    except Exception as error:
        print(f"❌ Failed to open stories: {error}")
        stats["errors"] += 1
        record_daily_check(seller, 0, 0)
        return

    page.wait_for_timeout(3000)

    if "/stories/" not in page.url:
        print(f"ℹ️ No active stories found for @{seller}")
        record_daily_check(seller, 0, 0)
        return

    checkpoint_story_id = get_last_story_id(seller)
    if checkpoint_story_id:
        print(f"📌 Last checkpoint Story ID: {checkpoint_story_id}")

    highest_story_id_seen = checkpoint_story_id
    visited_fingerprints = set()
    seller_stories_checked = 0
    seller_cars_found = 0

    for index in range(MAX_STORIES_PER_SELLER):
        print(f"\nSTORY #{index + 1}")
        stats["stories_checked"] += 1
        seller_stories_checked += 1

        fingerprint = get_story_fingerprint(page)
        if fingerprint in visited_fingerprints:
            print("Duplicate story detected. Moving to next seller.")
            break
        visited_fingerprints.add(fingerprint)

        current_story_id = extract_story_id_from_url(page.url)

        # ---------------------------------------------------------
        # FAST CHECKPOINT SKIP: If this story was already processed in previous run
        # ---------------------------------------------------------
        if current_story_id and checkpoint_story_id and is_story_id_older_or_equal(current_story_id, checkpoint_story_id):
            print(f"⏭ Story ID {current_story_id} <= checkpoint ({checkpoint_story_id}). FAST SKIP.")
            stats["duplicates_skipped"] += 1
            changed = go_to_next_story(page)
            if not changed or "/stories/" not in page.url:
                print(f"✅ Finished stories for @{seller}.")
                break
            continue

        # Track the highest numeric story ID seen in this run
        if current_story_id:
            if not highest_story_id_seen:
                highest_story_id_seen = current_story_id
            else:
                try:
                    if int(current_story_id) > int(highest_story_id_seen):
                        highest_story_id_seen = current_story_id
                except ValueError:
                    highest_story_id_seen = current_story_id

        post_url = find_post_in_story(page)

        # =========================================================
        # VARIANT 1: POST / REEL SHARE
        # =========================================================
        if post_url:
            source_key = f"POST|{seller}|{post_url}"
            print(f"🔗 POST: {post_url}")

            if car_exists(source_key):
                print("⏭ Already saved. SKIP.")
                stats["duplicates_skipped"] += 1
            else:
                try:
                    caption, image_url = get_post_info(context, post_url)
                    car_data = parse_car_text(caption)

                    if is_valid_listing(car_data):
                        image_path = download_image(context, image_url, seller, source_key)
                        if not image_path:
                            image_path = save_story_screenshot(page, seller, source_key)

                        save_car(
                            seller_username=seller,
                            source_type="POST_CAPTION",
                            source_key=source_key,
                            source_url=post_url,
                            raw_text=caption,
                            car_data=car_data,
                            image_url=image_url,
                            image_path=image_path,
                        )

                        print(format_car_summary_line(car_data))
                        print(format_price_line(car_data))
                        if car_data.get("phone_number"):
                            print(f"📞 Phone: {car_data['phone_number']}")
                        if image_path:
                            print(f"🖼 Image saved: {image_path}")
                        print("✅ Saved to DB")
                        stats["cars_added"] += 1
                        seller_cars_found += 1
                    else:
                        print("ℹ️ Model or price not found. SKIP.")
                        stats["invalid_skipped"] += 1
                except Exception as e:
                    print(f"⚠️ Post parse error: {e}")
                    stats["errors"] += 1

        # =========================================================
        # VARIANT 2: STORY OCR (DIRECT STORY TEXT)
        # =========================================================
        else:
            temp_screenshot = create_temp_screenshot(page, seller, index)
            try:
                lines = ocr_service.extract_text_from_image(temp_screenshot)
                raw_text = "\n".join(lines)

                print("📸 STORY OCR")
                print("TEXT:")
                print(raw_text if raw_text.strip() else "(no text detected)")

                car_data = parse_car_text(raw_text)

                # Generate unique key for story text
                clean_ocr = re.sub(r"\W+", "", raw_text.lower())
                if not clean_ocr:
                    clean_ocr = fingerprint

                story_hash = hashlib.sha256(f"{seller}|{clean_ocr}".encode("utf-8")).hexdigest()[:24]
                source_key = f"STORY|{seller}|{story_hash}"

                if car_exists(source_key):
                    print("⏭ Already saved. SKIP.")
                    stats["duplicates_skipped"] += 1
                    clean_temp_file(temp_screenshot)

                elif is_valid_listing(car_data):
                    media_url = get_story_media_image_url(page)
                    image_path = download_image(context, media_url, seller, source_key)

                    # If original media not downloadable, retain OCR screenshot as car image
                    if not image_path and temp_screenshot.exists():
                        seller_dir = CAR_IMAGES_DIR / safe_filename(seller)
                        seller_dir.mkdir(parents=True, exist_ok=True)
                        target_file = seller_dir / f"{story_hash[:16]}_story.png"
                        try:
                            temp_screenshot.replace(target_file)
                            image_path = str(target_file)
                        except Exception:
                            image_path = str(temp_screenshot)
                    else:
                        clean_temp_file(temp_screenshot)

                    save_car(
                        seller_username=seller,
                        source_type="STORY_OCR",
                        source_key=source_key,
                        source_url=page.url,
                        raw_text=raw_text,
                        car_data=car_data,
                        image_url=media_url,
                        image_path=image_path,
                    )

                    print(f"\n{format_car_summary_line(car_data)}")
                    print(format_price_line(car_data))
                    if car_data.get("phone_number"):
                        print(f"📞 Phone: {car_data['phone_number']}")
                    if image_path:
                        print(f"🖼 Image saved: {image_path}")
                    print("✅ Saved to DB")
                    stats["cars_added"] += 1
                    seller_cars_found += 1

                else:
                    print("ℹ️ Model or price not found. SKIP.")
                    stats["invalid_skipped"] += 1
                    clean_temp_file(temp_screenshot)

            except Exception as e:
                print(f"⚠️ Story OCR error: {e}")
                stats["errors"] += 1
                clean_temp_file(temp_screenshot)

        # Move to next slide
        changed = go_to_next_story(page)
        if not changed or "/stories/" not in page.url:
            print(f"✅ Finished stories for @{seller}.")
            break

    # Save highest seen story ID checkpoint for this seller
    if highest_story_id_seen:
        update_last_story_id(seller, highest_story_id_seen)

    # Record daily check metrics for this seller
    record_daily_check(seller, seller_stories_checked, seller_cars_found)


def main():
    init_db()

    # Pre-warm PaddleOCR
    _ = ocr_service.ocr

    print(f"Total sellers: {len(SELLERS)}")
    print(f"Database ready: {DB_PATH}")
    print(f"Images folder: {CAR_IMAGES_DIR}")

    stats = {
        "sellers_checked": 0,
        "stories_checked": 0,
        "cars_added": 0,
        "duplicates_skipped": 0,
        "invalid_skipped": 0,
        "errors": 0,
    }

    with sync_playwright() as p:
        print("\nLaunching browser...")

        context = p.chromium.launch_persistent_context(
            user_data_dir=str(SESSION_DIR),
            headless=HEADLESS,
            viewport={"width": 1400, "height": 1000},
            args=["--disable-notifications"],
        )

        page = context.pages[0] if context.pages else context.new_page()

        if not wait_for_login(context, page):
            context.close()
            return

        for index, seller in enumerate(SELLERS):
            stats["sellers_checked"] += 1
            try:
                check_seller(context, page, seller, stats)
            except Exception as error:
                print(f"\n❌ Unexpected error while checking @{seller}:")
                print(error)
                stats["errors"] += 1

            # Apply random anti-bot cooldown delay before next seller
            if index < len(SELLERS) - 1:
                cooldown = random.uniform(SELLER_COOLDOWN_MIN, SELLER_COOLDOWN_MAX)
                time.sleep(cooldown)

        context.close()

    # Cleanup temporary images
    clean_all_temp_files()

    # Final Summary Report
    print("\n=========================================")
    print("MONITORING COMPLETE\n")
    print(f"Sellers checked:    {stats['sellers_checked']}")
    print(f"Stories checked:    {stats['stories_checked']}")
    print(f"Cars added:         {stats['cars_added']}")
    print(f"Duplicates skipped: {stats['duplicates_skipped']}")
    print(f"Invalid skipped:    {stats['invalid_skipped']}")
    print(f"Errors:             {stats['errors']}")
    print(f"\nDatabase: {DB_PATH}")
    print(f"Images: {CAR_IMAGES_DIR}")

    summary = get_db_summary()
    print(f"\n🚗 Total cars in DB: {summary['total']} ({summary['with_phone']} with phone number)")
    for seller, count in summary["breakdown"].items():
        print(f"  @{seller}: {count}")

    # Display today's daily story check history
    daily_checks = get_daily_checks_summary()
    if daily_checks:
        print("\n📅 Today's Story Check Activity:")
        for check in daily_checks:
            print(f"  @{check['seller_username']}: {check['stories_count']} stories checked, {check['cars_found']} cars found (Last: {check['last_checked_at']})")
    print("=========================================\n")


if __name__ == "__main__":
    main()
