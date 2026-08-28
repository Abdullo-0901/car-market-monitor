import crypto from 'node:crypto';
import type { BrowserContext, Page } from 'playwright';
import {
  HEADLESS,
  STORY_DELAY_MIN,
  STORY_DELAY_MAX,
  POST_DELAY_MIN,
  POST_DELAY_MAX,
} from './config.js';
import { normalizeInstagramUrl, cleanCaptionText } from './parsers.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

export async function isInstagramLoggedIn(context: BrowserContext): Promise<boolean> {
  const cookies = await context.cookies();
  return cookies.some((c) => c.name === 'sessionid' && Boolean(c.value));
}

export async function waitForLogin(context: BrowserContext, page: Page): Promise<boolean> {
  const loggedIn = await isInstagramLoggedIn(context);
  if (loggedIn) {
    console.log('✅ Active Instagram session found.');
    return true;
  }

  if (HEADLESS) {
    console.log('\n❌ No active session found and running with HEADLESS=true.');
    console.log('Please run once with HEADLESS=0 to log in interactively:');
    console.log('HEADLESS=0 npm start');
    return false;
  }

  console.log('\n==============================');
  console.log('INSTAGRAM LOGIN');
  console.log('==============================');

  await page.goto('https://www.instagram.com/accounts/login/', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });

  console.log('\nPlease log in to your Instagram account in the opened browser window.');
  console.log('The script will automatically detect the login and proceed...');

  const maxWaitSeconds = 600;
  let waited = 0;

  while (waited < maxWaitSeconds) {
    if (await isInstagramLoggedIn(context)) {
      console.log('\n✅ Instagram login successful!');
      await page.waitForTimeout(2000);
      return true;
    }

    if (waited % 10 === 0 && waited > 0) {
      console.log(`Waiting for login... (${waited}/${maxWaitSeconds}s)`);
    }

    await sleep(2000);
    waited += 2;
  }

  console.log('\n❌ Login timed out.');
  return false;
}

export async function getStoryFingerprint(page: Page): Promise<string> {
  let text = '';
  try {
    text = await page.locator('body').innerText({ timeout: 2000 });
  } catch {}

  let media = '';
  try {
    const list = await page.locator('img, video').evaluateAll((elements) =>
      elements.map((el) => {
        const r = el.getBoundingClientRect();
        const src =
          (el as HTMLImageElement).currentSrc ||
          (el as HTMLImageElement).src ||
          (el as HTMLVideoElement).poster ||
          '';
        return `${src}:${r.width}:${r.height}`;
      })
    );
    media = list.join('|');
  } catch {}

  const raw = `${page.url()}|${text.slice(0, 3000)}|${media.slice(0, 3000)}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export async function findPostInStory(page: Page): Promise<string | null> {
  const found: string[] = [];

  for (const selector of ['a[href*="/p/"]', 'a[href*="/reel/"]']) {
    const locator = page.locator(selector);
    let count = 0;
    try {
      count = await locator.count();
    } catch {
      continue;
    }

    for (let i = 0; i < count; i++) {
      try {
        const href = await locator.nth(i).getAttribute('href');
        const url = normalizeInstagramUrl(href);
        if (url && (url.includes('/p/') || url.includes('/reel/'))) {
          found.push(url);
        }
      } catch {}
    }
  }

  const unique = Array.from(new Set(found));
  return unique[0] || null;
}

export async function goToNextStory(page: Page): Promise<boolean> {
  const before = await getStoryFingerprint(page);

  // Human-like random delay
  const delay = randomBetween(STORY_DELAY_MIN, STORY_DELAY_MAX);
  await sleep(delay * 1000);

  try {
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(1000);
  } catch {}

  const after = await getStoryFingerprint(page);
  if (before !== after) return true;

  // Fallback to mouse click on right side of viewport
  try {
    const viewport = page.viewportSize();
    if (viewport) {
      await page.mouse.click(viewport.width - 120, Math.floor(viewport.height / 2));
      await page.waitForTimeout(1000);
    }
  } catch {}

  const finalCheck = await getStoryFingerprint(page);
  return before !== finalCheck;
}

export async function getPostInfo(
  context: BrowserContext,
  postUrl: string
): Promise<[string, string | null]> {
  const postPage = await context.newPage();

  try {
    await postPage.goto(postUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });

    const delay = randomBetween(POST_DELAY_MIN, POST_DELAY_MAX);
    await sleep(delay * 1000);

    let caption = '';
    let imageUrl: string | null = null;

    // 1. Extract from article
    const article = postPage.locator('article');
    if ((await article.count()) > 0) {
      try {
        caption = (await article.first().innerText({ timeout: 5000 })).trim();
      } catch {}
    }

    // 2. Fallback to meta og:description
    if (!caption) {
      const ogDesc = postPage.locator('meta[property="og:description"]');
      if ((await ogDesc.count()) > 0) {
        caption = ((await ogDesc.first().getAttribute('content')) || '').trim();
      }
    }

    // Clean caption wrapper noise
    caption = cleanCaptionText(caption);

    // 3. Image extraction (og:image or largest article image)
    const ogImage = postPage.locator('meta[property="og:image"]');
    if ((await ogImage.count()) > 0) {
      imageUrl = await ogImage.first().getAttribute('content');
    }

    if (!imageUrl) {
      try {
        imageUrl = await postPage.locator('article img').evaluateAll((elements) => {
          const candidates = elements
            .map((el) => {
              const r = el.getBoundingClientRect();
              return {
                url: (el as HTMLImageElement).currentSrc || (el as HTMLImageElement).src || '',
                area: r.width * r.height,
              };
            })
            .filter((x) => x.url && x.area > 30000)
            .sort((a, b) => b.area - a.area);

          return candidates[0]?.url || null;
        });
      } catch {}
    }

    return [caption, imageUrl];
  } finally {
    await postPage.close();
  }
}
