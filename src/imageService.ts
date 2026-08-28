import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { BrowserContext, Page } from 'playwright';
import { CAR_IMAGES_DIR, TEMP_DIR } from './config.js';

export function safeFilename(text: string): string {
  return text.replace(/[^A-Za-z0-9_.-]/g, '_');
}

export function getImageHashFilename(sourceKey: string, ext = '.jpg'): string {
  const digest = crypto.createHash('sha256').update(sourceKey).digest('hex').slice(0, 16);
  return `${digest}${ext}`;
}

export async function downloadImage(
  context: BrowserContext,
  imageUrl: string | null | undefined,
  sellerUsername: string,
  sourceKey: string
): Promise<string | null> {
  if (!imageUrl) return null;

  const sellerFolder = safeFilename(sellerUsername);
  const sellerDir = path.join(CAR_IMAGES_DIR, sellerFolder);
  fs.mkdirSync(sellerDir, { recursive: true });

  try {
    const response = await context.request.get(imageUrl, {
      timeout: 30000,
      headers: {
        Referer: 'https://www.instagram.com/',
      },
    });

    if (!response.ok()) return null;

    const contentType = (response.headers()['content-type'] || '').toLowerCase();
    let ext = '.jpg';
    if (contentType.includes('png')) ext = '.png';
    else if (contentType.includes('webp')) ext = '.webp';

    const filename = getImageHashFilename(sourceKey, ext);
    const targetPath = path.join(sellerDir, filename);

    const bodyBuffer = await response.body();
    fs.writeFileSync(targetPath, bodyBuffer);

    return `car_images/${sellerFolder}/${filename}`;
  } catch (err) {
    console.warn(`⚠️ Image download error:`, err);
    return null;
  }
}

export async function saveStoryScreenshot(
  page: Page,
  sellerUsername: string,
  sourceKey: string
): Promise<string | null> {
  const sellerFolder = safeFilename(sellerUsername);
  const sellerDir = path.join(CAR_IMAGES_DIR, sellerFolder);
  fs.mkdirSync(sellerDir, { recursive: true });

  const filename = getImageHashFilename(sourceKey, '_story.png');
  const targetPath = path.join(sellerDir, filename);

  try {
    await page.screenshot({ path: targetPath, fullPage: false });
    return `car_images/${sellerFolder}/${filename}`;
  } catch (err) {
    console.warn(`⚠️ Story screenshot error:`, err);
    return null;
  }
}

export async function getStoryMediaImageUrl(page: Page): Promise<string | null> {
  try {
    const candidateUrl = await page.locator('img, video').evaluateAll((elements) => {
      const candidates = elements
        .map((el) => {
          const r = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          const visible =
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            r.width > 250 &&
            r.height > 250;

          let url = '';
          if (el.tagName === 'VIDEO') {
            url = (el as HTMLVideoElement).poster || '';
          } else {
            url = (el as HTMLImageElement).currentSrc || (el as HTMLImageElement).src || '';
          }

          return {
            url,
            area: r.width * r.height,
            visible,
          };
        })
        .filter((x) => x.visible && x.url)
        .sort((a, b) => b.area - a.area);

      return candidates[0]?.url || null;
    });

    return candidateUrl;
  } catch {
    return null;
  }
}

export async function createTempScreenshot(
  page: Page,
  sellerUsername: string,
  index: number
): Promise<string> {
  const urlHash = crypto.createHash('sha256').update(page.url()).digest('hex').slice(0, 8);
  const filename = `${safeFilename(sellerUsername)}_${index}_${urlHash}.png`;
  const target = path.join(TEMP_DIR, filename);
  await page.screenshot({ path: target, fullPage: false });
  return target;
}

export function cleanTempFile(filePath: string | null | undefined): void {
  if (filePath && fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch {}
  }
}

export function cleanAllTempFiles(): void {
  try {
    const files = fs.readdirSync(TEMP_DIR);
    for (const f of files) {
      const fullPath = path.join(TEMP_DIR, f);
      if (fs.statSync(fullPath).isFile()) {
        fs.unlinkSync(fullPath);
      }
    }
  } catch {}
}
