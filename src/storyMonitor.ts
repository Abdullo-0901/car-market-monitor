import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { chromium, type BrowserContext, type Page } from 'playwright';

import {
  SELLERS,
  DB_PATH,
  SESSION_DIR,
  HEADLESS,
  MAX_STORIES_PER_SELLER,
  CAR_IMAGES_DIR,
  SELLER_COOLDOWN_MIN,
  SELLER_COOLDOWN_MAX,
} from './config.js';
import {
  initDb,
  carExists,
  saveCar,
  getDbSummary,
  recordDailyCheck,
  getDailyChecksSummary,
  getLastStoryId,
  updateLastStoryId,
} from './database.js';
import { parseCarText, isValidListing } from './parsers.js';
import { ocrService } from './ocrService.js';
import {
  downloadImage,
  saveStoryScreenshot,
  getStoryMediaImageUrl,
  createTempScreenshot,
  cleanTempFile,
  cleanAllTempFiles,
  safeFilename,
} from './imageService.js';
import {
  waitForLogin,
  getStoryFingerprint,
  findPostInStory,
  goToNextStory,
  getPostInfo,
} from './instagramClient.js';
import type { CarParseResult, MonitoringStats } from './types.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function formatCarSummaryLine(carData: CarParseResult): string {
  const brand = carData.brand || '';
  const model = carData.model || '';
  const year = carData.year ? ` ${carData.year}` : '';
  return `🚗 ${brand} ${model}${year}`.trim();
}

function formatPriceLine(carData: CarParseResult): string {
  const prices: string[] = [];
  if (carData.price_tjs) prices.push(`${carData.price_tjs.toLocaleString('ru-RU')} TJS`);
  if (carData.price_usd) prices.push(`${carData.price_usd.toLocaleString('ru-RU')} USD`);
  return prices.length > 0 ? `💰 ${prices.join(' / ')}` : '💰 No price specified';
}

function extractStoryIdFromUrl(url: string): string | null {
  if (!url) return null;
  const match = url.match(/\/stories\/[^/]+\/(\d+)/);
  return match ? match[1] : null;
}

function isStoryIdOlderOrEqual(
  currentId: string | null,
  checkpointId: string | null
): boolean {
  if (!currentId || !checkpointId) return false;
  try {
    return BigInt(currentId) <= BigInt(checkpointId);
  } catch {
    return currentId === checkpointId;
  }
}

async function checkSeller(
  context: BrowserContext,
  page: Page,
  seller: string,
  stats: MonitoringStats
): Promise<void> {
  console.log('\n=========================================');
  console.log(`Checking @${seller}`);

  const storyUrl = `https://www.instagram.com/stories/${seller}/`;

  try {
    await page.goto(storyUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
  } catch (error) {
    console.log(`❌ Failed to open stories:`, error);
    stats.errors += 1;
    recordDailyCheck(seller, 0, 0);
    return;
  }

  await page.waitForTimeout(3000);

  if (!page.url().includes('/stories/')) {
    console.log(`ℹ️ No active stories found for @${seller}`);
    recordDailyCheck(seller, 0, 0);
    return;
  }

  const checkpointStoryId = getLastStoryId(seller);
  if (checkpointStoryId) {
    console.log(`📌 Last checkpoint Story ID: ${checkpointStoryId}`);
  }

  let highestStoryIdSeen = checkpointStoryId;
  const visitedFingerprints = new Set<string>();
  let sellerStoriesChecked = 0;
  let sellerCarsFound = 0;

  for (let index = 0; index < MAX_STORIES_PER_SELLER; index++) {
    console.log(`\nSTORY #${index + 1}`);
    stats.stories_checked += 1;
    sellerStoriesChecked += 1;

    const fingerprint = await getStoryFingerprint(page);
    if (visitedFingerprints.has(fingerprint)) {
      console.log('Duplicate story detected. Moving to next seller.');
      break;
    }
    visitedFingerprints.add(fingerprint);

    const currentStoryId = extractStoryIdFromUrl(page.url());

    // FAST CHECKPOINT SKIP
    if (
      currentStoryId &&
      checkpointStoryId &&
      isStoryIdOlderOrEqual(currentStoryId, checkpointStoryId)
    ) {
      console.log(
        `⏭ Story ID ${currentStoryId} <= checkpoint (${checkpointStoryId}). FAST SKIP.`
      );
      stats.duplicates_skipped += 1;
      const changed = await goToNextStory(page);
      if (!changed || !page.url().includes('/stories/')) {
        console.log(`✅ Finished stories for @${seller}.`);
        break;
      }
      continue;
    }

    // Track highest story ID
    if (currentStoryId) {
      if (!highestStoryIdSeen) {
        highestStoryIdSeen = currentStoryId;
      } else {
        try {
          if (BigInt(currentStoryId) > BigInt(highestStoryIdSeen)) {
            highestStoryIdSeen = currentStoryId;
          }
        } catch {
          highestStoryIdSeen = currentStoryId;
        }
      }
    }

    const postUrl = await findPostInStory(page);

    // =========================================================
    // VARIANT 1: POST / REEL SHARE
    // =========================================================
    if (postUrl) {
      const sourceKey = `POST|${seller}|${postUrl}`;
      console.log(`🔗 POST: ${postUrl}`);

      if (carExists(sourceKey)) {
        console.log('⏭ Already saved. SKIP.');
        stats.duplicates_skipped += 1;
      } else {
        try {
          const [caption, imageUrl] = await getPostInfo(context, postUrl);
          const carData = parseCarText(caption);

          if (isValidListing(carData)) {
            let imagePath = await downloadImage(context, imageUrl, seller, sourceKey);
            if (!imagePath) {
              imagePath = await saveStoryScreenshot(page, seller, sourceKey);
            }

            saveCar(
              seller,
              'POST_CAPTION',
              sourceKey,
              postUrl,
              carData,
              imageUrl,
              imagePath
            );

            console.log(formatCarSummaryLine(carData));
            console.log(formatPriceLine(carData));
            if (carData.phone_number) {
              console.log(`📞 Phone: ${carData.phone_number}`);
            }
            if (imagePath) {
              console.log(`🖼 Image saved: ${imagePath}`);
            }
            console.log('✅ Saved to DB');
            stats.cars_added += 1;
            sellerCarsFound += 1;
          } else {
            console.log('ℹ️ Model or price not found. SKIP.');
            stats.invalid_skipped += 1;
          }
        } catch (e) {
          console.warn(`⚠️ Post parse error:`, e);
          stats.errors += 1;
        }
      }
    }

    // =========================================================
    // VARIANT 2: STORY OCR
    // =========================================================
    else {
      const tempScreenshot = await createTempScreenshot(page, seller, index);
      try {
        const lines = await ocrService.extractTextFromImage(tempScreenshot);
        const rawText = lines.join('\n');

        console.log('📸 STORY OCR');
        console.log('TEXT:');
        console.log(rawText.trim() ? rawText : '(no text detected)');

        const carData = parseCarText(rawText);

        const cleanOcr = rawText.toLowerCase().replace(/\W+/g, '') || fingerprint;
        const storyHash = crypto
          .createHash('sha256')
          .update(`${seller}|${cleanOcr}`)
          .digest('hex')
          .slice(0, 24);
        const sourceKey = `STORY|${seller}|${storyHash}`;

        if (carExists(sourceKey)) {
          console.log('⏭ Already saved. SKIP.');
          stats.duplicates_skipped += 1;
          cleanTempFile(tempScreenshot);
        } else if (isValidListing(carData)) {
          const mediaUrl = await getStoryMediaImageUrl(page);
          let imagePath = await downloadImage(context, mediaUrl, seller, sourceKey);

          if (!imagePath && fs.existsSync(tempScreenshot)) {
            const sellerDir = path.join(CAR_IMAGES_DIR, safeFilename(seller));
            fs.mkdirSync(sellerDir, { recursive: true });
            const targetFile = path.join(sellerDir, `${storyHash.slice(0, 16)}_story.png`);
            try {
              fs.renameSync(tempScreenshot, targetFile);
              imagePath = `car_images/${safeFilename(seller)}/${storyHash.slice(0, 16)}_story.png`;
            } catch {
              imagePath = tempScreenshot;
            }
          } else {
            cleanTempFile(tempScreenshot);
          }

          saveCar(
            seller,
            'STORY_OCR',
            sourceKey,
            page.url(),
            carData,
            mediaUrl,
            imagePath
          );

          console.log(`\n${formatCarSummaryLine(carData)}`);
          console.log(formatPriceLine(carData));
          if (carData.phone_number) {
            console.log(`📞 Phone: ${carData.phone_number}`);
          }
          if (imagePath) {
            console.log(`🖼 Image saved: ${imagePath}`);
          }
          console.log('✅ Saved to DB');
          stats.cars_added += 1;
          sellerCarsFound += 1;
        } else {
          console.log('ℹ️ Model or price not found. SKIP.');
          stats.invalid_skipped += 1;
          cleanTempFile(tempScreenshot);
        }
      } catch (e) {
        console.warn(`⚠️ Story OCR error:`, e);
        stats.errors += 1;
        cleanTempFile(tempScreenshot);
      }
    }

    // Move to next slide
    const changed = await goToNextStory(page);
    if (!changed || !page.url().includes('/stories/')) {
      console.log(`✅ Finished stories for @${seller}.`);
      break;
    }
  }

  // Update last seen story checkpoint
  if (highestStoryIdSeen) {
    updateLastStoryId(seller, highestStoryIdSeen);
  }

  // Record daily check
  recordDailyCheck(seller, sellerStoriesChecked, sellerCarsFound);
}

export async function main(): Promise<void> {
  initDb();

  console.log(`Total sellers: ${SELLERS.length}`);
  console.log(`Database ready: ${DB_PATH}`);
  console.log(`Images folder: ${CAR_IMAGES_DIR}`);

  const stats: MonitoringStats = {
    sellers_checked: 0,
    stories_checked: 0,
    cars_added: 0,
    duplicates_skipped: 0,
    invalid_skipped: 0,
    errors: 0,
  };

  console.log('\nLaunching browser...');

  const context = await chromium.launchPersistentContext(SESSION_DIR, {
    headless: HEADLESS,
    viewport: { width: 1400, height: 1000 },
    args: ['--disable-notifications'],
  });

  const page = context.pages()[0] || (await context.newPage());

  const loggedIn = await waitForLogin(context, page);
  if (!loggedIn) {
    await context.close();
    return;
  }

  for (let index = 0; index < SELLERS.length; index++) {
    const seller = SELLERS[index];
    stats.sellers_checked += 1;

    try {
      await checkSeller(context, page, seller, stats);
    } catch (error) {
      console.log(`\n❌ Unexpected error while checking @${seller}:`, error);
      stats.errors += 1;
    }

    if (index < SELLERS.length - 1) {
      const cooldown = randomBetween(SELLER_COOLDOWN_MIN, SELLER_COOLDOWN_MAX);
      await sleep(cooldown * 1000);
    }
  }

  await context.close();
  await ocrService.terminate();
  cleanAllTempFiles();

  // Summary Report
  console.log('\n=========================================');
  console.log('MONITORING COMPLETE\n');
  console.log(`Sellers checked:    ${stats.sellers_checked}`);
  console.log(`Stories checked:    ${stats.stories_checked}`);
  console.log(`Cars added:         ${stats.cars_added}`);
  console.log(`Duplicates skipped: ${stats.duplicates_skipped}`);
  console.log(`Invalid skipped:    ${stats.invalid_skipped}`);
  console.log(`Errors:             ${stats.errors}`);
  console.log(`\nDatabase: ${DB_PATH}`);
  console.log(`Images: ${CAR_IMAGES_DIR}`);

  const summary = getDbSummary();
  console.log(
    `\n🚗 Total cars in DB: ${summary.total} (${summary.with_phone} with phone number)`
  );
  for (const [seller, count] of Object.entries(summary.breakdown)) {
    console.log(`  @${seller}: ${count}`);
  }

  const dailyChecks = getDailyChecksSummary();
  if (dailyChecks.length > 0) {
    console.log("\n📅 Today's Story Check Activity:");
    for (const check of dailyChecks) {
      console.log(
        `  @${check.seller_username}: ${check.stories_count} stories checked, ${check.cars_found} cars found (Last: ${check.last_checked_at})`
      );
    }
  }
  console.log('=========================================\n');
}

// Auto-run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Fatal execution error:', err);
    process.exit(1);
  });
}
