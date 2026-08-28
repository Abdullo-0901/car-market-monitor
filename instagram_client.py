import hashlib
import random
import re
import time
from typing import Optional, Tuple
from playwright.sync_api import BrowserContext, Page

from config import (
    HEADLESS,
    STORY_DELAY_MIN,
    STORY_DELAY_MAX,
    POST_DELAY_MIN,
    POST_DELAY_MAX,
)
from parsers import normalize_instagram_url


def is_instagram_logged_in(context: BrowserContext) -> bool:
    """Checks if the user has an active Instagram sessionid cookie."""
    for cookie in context.cookies():
        if cookie.get("name") == "sessionid" and cookie.get("value"):
            return True
    return False


def wait_for_login(context: BrowserContext, page: Page) -> bool:
    """
    Ensures Instagram session is authenticated.
    Prompts user to log in via browser window if running interactively.
    """
    if is_instagram_logged_in(context):
        print("✅ Active Instagram session found.")
        return True

    if HEADLESS:
        print("\n❌ No active session found and running with HEADLESS=True.")
        print("Please run once with HEADLESS=0 to log in interactively:")
        print("HEADLESS=0 python3 story_monitor.py")
        return False

    print("\n==============================")
    print("INSTAGRAM LOGIN")
    print("==============================")

    page.goto(
        "https://www.instagram.com/accounts/login/",
        wait_until="domcontentloaded",
        timeout=60_000,
    )

    print("\nPlease log in to your Instagram account in the opened browser window.")
    print("The script will automatically detect the login and proceed...")

    max_wait_seconds = 600
    waited = 0

    while waited < max_wait_seconds:
        if is_instagram_logged_in(context):
            print("\n✅ Instagram login successful!")
            page.wait_for_timeout(2000)
            return True

        if waited % 10 == 0 and waited > 0:
            print(f"Waiting for login... ({waited}/{max_wait_seconds}s)")

        time.sleep(2)
        waited += 2

    print("\n❌ Login timed out.")
    return False


def get_story_fingerprint(page: Page) -> str:
    """Computes a unique SHA-256 fingerprint for the current story view."""
    try:
        text = page.locator("body").inner_text(timeout=2000)
    except Exception:
        text = ""

    try:
        media = page.locator("img, video").evaluate_all(
            """
            elements => elements.map(el => {
                const r = el.getBoundingClientRect();
                return [el.currentSrc || el.src || el.poster || '', r.width, r.height].join(':');
            }).join('|')
            """
        )
    except Exception:
        media = ""

    raw = f"{page.url}|{text[:3000]}|{media[:3000]}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def find_post_in_story(page: Page) -> Optional[str]:
    """Finds shared /p/ or /reel/ links inside the current story."""
    found = []

    for selector in ['a[href*="/p/"]', 'a[href*="/reel/"]']:
        locator = page.locator(selector)
        try:
            count = locator.count()
        except Exception:
            continue

        for i in range(count):
            try:
                href = locator.nth(i).get_attribute("href")
            except Exception:
                continue

            url = normalize_instagram_url(href)
            if url and ("/p/" in url or "/reel/" in url):
                found.append(url)

    # Return first unique post URL
    unique = list(dict.fromkeys(found))
    return unique[0] if unique else None


def go_to_next_story(page: Page) -> bool:
    """Navigates to the next story slide with randomized anti-bot delay."""
    before = get_story_fingerprint(page)

    # Human-like random delay before next slide
    delay = random.uniform(STORY_DELAY_MIN, STORY_DELAY_MAX)
    time.sleep(delay)

    try:
        page.keyboard.press("ArrowRight")
        page.wait_for_timeout(1000)
    except Exception:
        pass

    after = get_story_fingerprint(page)
    if before != after:
        return True

    # Fallback to mouse click on right edge of story viewport
    try:
        viewport = page.viewport_size
        if viewport:
            page.mouse.click(
                viewport["width"] - 120,
                viewport["height"] // 2,
            )
            page.wait_for_timeout(1000)
    except Exception:
        pass

    return before != get_story_fingerprint(page)


def clean_raw_caption(raw: str) -> str:
    """Strips likes, comments, and date wrappers from Instagram captions."""
    if not raw:
        return ""

    # Strip og:description wrapper: 'XX likes, YY comments - username on Date: "..."'
    cleaned = re.sub(
        r"^\d+[\s\w,]*likes?,[\s\w,]*comments?\s*[-–—]\s*[\w.]+(?:\s+on\s+[^:]+)?:\s*[\"“']?",
        "",
        raw.strip(),
        flags=re.IGNORECASE,
    )
    # Strip trailing quotes
    cleaned = re.sub(r"[\"”']+$", "", cleaned.strip())
    return cleaned.strip()


def get_post_info(context: BrowserContext, post_url: str) -> Tuple[str, Optional[str]]:
    """
    Opens the shared post/reel in a separate tab with anti-bot delay to extract clean caption and cover image,
    then closes the tab without disrupting the active story loop.
    """
    post_page = context.new_page()

    try:
        post_page.goto(
            post_url,
            wait_until="domcontentloaded",
            timeout=45_000,
        )

        # Human-like delay while post renders
        delay = random.uniform(POST_DELAY_MIN, POST_DELAY_MAX)
        time.sleep(delay)

        caption = ""
        image_url = None

        # 1. Caption extraction from article
        article = post_page.locator("article")
        if article.count() > 0:
            try:
                caption = article.first.inner_text(timeout=5000).strip()
            except Exception:
                pass

        # 2. Fallback to meta og:description
        if not caption:
            og_desc = post_page.locator('meta[property="og:description"]')
            if og_desc.count() > 0:
                caption = (og_desc.first.get_attribute("content") or "").strip()

        # Clean any likes/comments wrapper noise
        caption = clean_raw_caption(caption)

        # 3. Image extraction (og:image or largest article image)
        og_image = post_page.locator('meta[property="og:image"]')
        if og_image.count() > 0:
            image_url = og_image.first.get_attribute("content")

        if not image_url:
            try:
                image_url = post_page.locator("article img").evaluate_all(
                    """
                    elements => elements.map(el => {
                        const r = el.getBoundingClientRect();
                        return {
                            url: el.currentSrc || el.src || '',
                            area: r.width * r.height
                        };
                    }).filter(x => x.url && x.area > 30000)
                      .sort((a, b) => b.area - a.area)[0]?.url || null
                    """
                )
            except Exception:
                pass

        return caption, image_url

    finally:
        post_page.close()
