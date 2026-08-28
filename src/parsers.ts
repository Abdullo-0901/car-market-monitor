import { BRAND_MAPPING, normalizeCarModel } from './carNormalizer.js';
import type { CarParseResult } from './types.js';

// =========================================================
// HELPER FUNCTIONS
// =========================================================

export function cleanNumber(value: string | null | undefined): number | null {
  if (!value) return null;
  const digits = value.replace(/[^\d]/g, '');
  return digits ? parseInt(digits, 10) : null;
}

export function normalizeInstagramUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  let clean = url.trim();
  if (clean.startsWith('/')) {
    clean = 'https://www.instagram.com' + clean;
  }

  clean = clean.split('?')[0];
  if (!clean.endsWith('/')) {
    clean += '/';
  }

  return clean;
}

export function cleanCaptionText(text: string): string {
  if (!text) return '';
  let cleaned = text
    .trim()
    .replace(
      /^\d+[\s\w,]*likes?,[\s\w,]*comments?\s*[-–—]\s*[\w.]+(?:\s+on\s+[^:]+)?:\s*["“']?/i,
      ''
    );
  cleaned = cleaned.replace(/["”']+$/, '').trim();
  return cleaned;
}

export function cleanUiNoise(text: string): string {
  if (!text) return '';

  let cleaned = cleanCaptionText(text);

  // Remove UI headers and footers
  cleaned = cleaned.replace(/\b(?:Instagzam|Instagram|Insta)\b/gi, ' ');
  cleaned = cleaned.replace(/\bReply to\b.*/gi, ' ');
  cleaned = cleaned.replace(/\bSend message\b.*/gi, ' ');
  cleaned = cleaned.replace(/\bAUTOTUNING\b/gi, ' ');
  cleaned = cleaned.replace(/\bTAJIKISTAN\b/gi, ' ');
  cleaned = cleaned.replace(/[@©]\w+/g, ' ');

  return cleaned.replace(/[ \t]+/g, ' ').trim();
}

// =========================================================
// PHONE NUMBER PARSER
// =========================================================

export function parsePhoneNumber(text: string): string | null {
  if (!text) return null;

  // 1. Explicit labeled phone prefix
  const labeledPattern =
    /(?:Тел|Tel|Телефон|WhatsApp|W\/A|Вайбер|Viber|Номер|Мурочиат|Тамос)\s*[:.\-]?\s*(\+?992[\d\s.\-]{8,16}|\b[05789]\d[\d\s.\-]{7,13})/i;
  const match = text.match(labeledPattern);
  if (match) {
    let digits = match[1].replace(/[^\d]/g, '');
    if (digits.length === 9) {
      digits = '992' + digits;
    }
    if (digits.length === 12 && digits.startsWith('992')) {
      return `+${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 8)} ${digits.slice(8, 10)} ${digits.slice(10, 12)}`;
    }
  }

  // 2. Explicit +992 or 992 international pattern
  const directPattern = /(?:\+992|(?<!\d)992)[\s.\-]?([5789]\d{2})[\s.\-]?(\d{2})[\s.\-]?(\d{2})[\s.\-]?(\d{2})/;
  const m2 = text.match(directPattern);
  if (m2) {
    return `+992 ${m2[1]} ${m2[2]} ${m2[3]} ${m2[4]}`;
  }

  // 3. Standalone pattern without spaces
  const rawDigits = text.replace(/[\s.\-]/g, '');
  const genericMatch = rawDigits.match(/(?:\+992|(?<!\d)992)(\d{9})/);
  if (genericMatch) {
    const d = '992' + genericMatch[1];
    return `+${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 8)} ${d.slice(8, 10)} ${d.slice(10, 12)}`;
  }

  return null;
}

// =========================================================
// PRICE PARSER
// =========================================================

export function parsePrices(text: string): { priceTjs: number | null; priceUsd: number | null } {
  let priceTjs: number | null = null;
  let priceUsd: number | null = null;

  if (!text) return { priceTjs, priceUsd };

  // 1. Explicit labeled price: e.g. "Цена: 327 .000c"
  const labelMatch = text.match(
    /(?:Цена|Нарх|Price|Нархи|Нархш)\s*[:\-]?\s*([\d\s.,]+)\s*([cс$]|сомони|tjs|usd)?/i
  );
  if (labelMatch) {
    const val = cleanNumber(labelMatch[1]);
    const curr = (labelMatch[2] || '').toLowerCase();
    const contextAround = text.slice(labelMatch.index, (labelMatch.index || 0) + 30).toLowerCase();

    if (val && val >= 1000) {
      if (contextAround.includes('$') || contextAround.includes('usd') || curr === '$') {
        priceUsd = val;
      } else if (
        ['c', 'с', 'сомони', 'tjs'].some((k) => contextAround.includes(k)) ||
        ['c', 'с', 'сомони', 'tjs'].includes(curr)
      ) {
        priceTjs = val;
      } else {
        priceTjs = val;
      }
    }
  }

  // 2. USD regex: e.g. 23.900$, 82.900$, $82,900
  const usdRegex = /(?:\$\s*(\d{1,3}(?:[.\s,]\d{3})+|\d{4,7})|(\d{1,3}(?:[.\s,]\d{3})+|\d{4,7})\s*\$)/gi;
  let usdMatch;
  while ((usdMatch = usdRegex.exec(text)) !== null) {
    const rawVal = usdMatch[1] || usdMatch[2];
    const val = cleanNumber(rawVal);
    if (val && val >= 1000 && val <= 2000000) {
      priceUsd = val;
      break;
    }
  }

  // 3. TJS regex: e.g. 77 .000c, 770.900C, 1.487.900C, 77 000 сомони, 77000 TJS
  const tjsPatterns = [
    /(?<!\d)(\d{1,3}(?:[.\s,]\s*\d{3})+|\d{4,8})\s*[cсCС](?![A-Za-zА-Яа-я0-9])/g,
    /(?<!\d)(\d{1,3}(?:[.\s,]\s*\d{3})+|\d{4,8})\s*(?:сомони|tjs)\b/gi,
  ];

  for (const pat of tjsPatterns) {
    let tjsMatch;
    while ((tjsMatch = pat.exec(text)) !== null) {
      const val = cleanNumber(tjsMatch[1]);
      if (val && val >= 5000 && val <= 20000000) {
        priceTjs = val;
        break;
      }
    }
    if (priceTjs) break;
  }

  return { priceTjs, priceUsd };
}

// =========================================================
// YEAR & MONTH PARSER
// =========================================================

export function parseYearMonth(text: string): { year: number | null; month: number | null } {
  let year: number | null = null;
  let month: number | null = null;

  if (!text) return { year, month };

  // Labeled year: Год: 2023.07 or Год: 2024
  const yearMatch = text.match(
    /(?:Год выпуска|Год|Year|Соли баромад|Сол)\s*[:\-]?\s*(19\d{2}|20\d{2})(?:[\s./-]+(\d{1,2}))?/i
  );
  if (yearMatch) {
    year = parseInt(yearMatch[1], 10);
    if (yearMatch[2]) {
      const m = parseInt(yearMatch[2], 10);
      if (m >= 1 && m <= 12) month = m;
    }
    return { year, month };
  }

  // Standalone year
  const standaloneMatch = text.match(/\b(19[89]\d|20[0-3]\d)(?:[./-](\d{1,2}))?\b/);
  if (standaloneMatch) {
    year = parseInt(standaloneMatch[1], 10);
    if (standaloneMatch[2]) {
      const m = parseInt(standaloneMatch[2], 10);
      if (m >= 1 && m <= 12) month = m;
    }
  }

  return { year, month };
}

// =========================================================
// MILEAGE PARSER
// =========================================================

export function parseMileage(text: string): number | null {
  if (!text) return null;

  // Labeled mileage: Пробег: 35.000
  const match = text.match(
    /(?:Пробег|Mileage|Пробегш|Масофа)\s*[:\-]?\s*([\d\s.,]+)\s*(?:km|км|ml|mp|mil|mi)?/i
  );
  if (match) {
    const val = cleanNumber(match[1]);
    if (val !== null && val < 2000000) {
      return val;
    }
  }

  // Standalone mileage: 244.000km, 35 000 km, 35.000mp
  const standaloneMatch = text.match(
    /(?<!\d)(\d{1,3}(?:[.\s]\d{3})+|\d{2,6})\s*(?:km|км|ml|mp|миль|km\/ч)\b/i
  );
  if (standaloneMatch) {
    const val = cleanNumber(standaloneMatch[1]);
    if (val !== null && val < 2000000) {
      return val;
    }
  }

  return null;
}

// =========================================================
// ENGINE PARSER
// =========================================================

export function parseEngine(text: string): number | null {
  if (!text) return null;

  // Labeled engine: Двигатель: 2.5
  const match = text.match(
    /(?:Двигатель|Мотор|Объем|Объём|Engine)\s*[:\-]?\s*([\d.,]+)\s*(?:L|л|V[468]|V12)?/i
  );
  if (match) {
    const eng = parseFloat(match[1].replace(',', '.'));
    if (!isNaN(eng) && eng >= 0.6 && eng <= 8.5) {
      return eng;
    }
  }

  // Free engine: 4.4 V8, 2.5L, 3.5 V6
  const freeMatch = text.match(/\b([1-7][.,]\d)\s*(?:V[468]|L\b|л\b|TT\b|турбо|turbo|twin)/i);
  if (freeMatch) {
    const eng = parseFloat(freeMatch[1].replace(',', '.'));
    if (!isNaN(eng) && eng >= 0.6 && eng <= 8.5) {
      return eng;
    }
  }

  // Standalone: 'BMW M6 4.4 ...'
  const standalone = text.match(/\b([1-6][.,]\d)\b/);
  if (standalone) {
    const eng = parseFloat(standalone[1].replace(',', '.'));
    if (!isNaN(eng) && eng >= 0.8 && eng <= 6.5) {
      return eng;
    }
  }

  return null;
}

// =========================================================
// BRAND & MODEL PARSER
// =========================================================

export function parseBrandAndModel(text: string): [string | null, string | null] {
  if (!text) return [null, null];

  const cleanedText = cleanUiNoise(text);
  let rawBrand: string | null = null;
  let rawModel: string | null = null;

  // 1. Labeled model: e.g. "Модель TOYOTA RAV4"
  const modelLabelMatch = cleanedText.match(
    /(?:Модель автомобиля|Модель|Model|Марка)\s*[:\-]?\s*([^\n\r]+)/i
  );

  const sortedAliases = Object.keys(BRAND_MAPPING).sort((a, b) => b.length - a.length);

  if (modelLabelMatch) {
    const line = modelLabelMatch[1].replace(/\s+/g, ' ').trim();
    const upperLine = line.toUpperCase();

    for (const alias of sortedAliases) {
      if (upperLine.startsWith(alias)) {
        rawBrand = BRAND_MAPPING[alias];
        rawModel = line.slice(alias.length).replace(/^[\s:\-]+/, '').trim();

        if (['CAMRY', 'CAMRY-6'].includes(alias)) {
          rawModel = `Camry ${rawModel}`.trim();
        } else if (['LC PRADO', 'LC PRAD0', 'PRADO', 'LAND CRUISER PRADO'].includes(alias)) {
          rawModel = `Land Cruiser Prado ${rawModel}`.trim();
        } else if (['LC300', 'LC 300'].includes(alias)) {
          rawModel = `Land Cruiser 300 ${rawModel}`.trim();
        } else if (['RR DEFENDER', 'DEFENDER'].includes(alias)) {
          rawModel = `Defender ${rawModel}`.trim();
        } else if (['SANTAFE', 'SANTA FE', 'SANTAFEE'].includes(alias)) {
          rawModel = `Santa Fe ${rawModel}`.trim();
        }
        break;
      }
    }

    if (!rawBrand) {
      const parts = line.split(' ');
      rawBrand = parts[0];
      rawModel = parts.slice(1).join(' ') || null;
    }
  }

  // 2. Unlabeled / Story text
  if (!rawBrand) {
    const upperText = cleanedText.replace(/\s+/g, ' ').toUpperCase();

    for (const alias of sortedAliases) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`(?:\\b|^)${escaped}(?:\\b|$)`, 'i');
      const match = upperText.match(pattern);

      if (match && match.index !== undefined) {
        rawBrand = BRAND_MAPPING[alias];
        const origSegment = cleanedText.replace(/\s+/g, ' ').slice(match.index + alias.length);

        // Split delimiters
        const splitRegex =
          /[\n\r]|(?:\b\d{1,3}(?:[.\s]\d{3})+\s*[$сcCС])|(?:\b\d{4,7}\s*[$сcCС])|(?:\b(19\d{2}|20\d{2})\b)|\b(?:TEL|Тел|WhatsApp|Phone|Номер|Цена|Нарх|Price|Год|Пробег|Reply|Send|AUTOTUNING|TAJIKISTAN)\b/i;

        const parts = origSegment.split(splitRegex);
        rawModel = (parts[0] || '').replace(/^[\s:\-]+/, '').trim();

        if (['CAMRY', 'CAMRY-6'].includes(alias)) {
          rawModel = `Camry ${rawModel}`.trim();
        } else if (['LC PRADO', 'LC PRAD0', 'PRADO', 'LAND CRUISER PRADO'].includes(alias)) {
          rawModel = `Land Cruiser Prado ${rawModel}`.trim();
        } else if (['LC300', 'LC 300'].includes(alias)) {
          rawModel = `Land Cruiser 300 ${rawModel}`.trim();
        } else if (['RR DEFENDER', 'DEFENDER'].includes(alias)) {
          rawModel = `Defender ${rawModel}`.trim();
        } else if (['SANTAFE', 'SANTA FE', 'SANTAFEE'].includes(alias)) {
          rawModel = `Santa Fe ${rawModel}`.trim();
        }
        break;
      }
    }
  }

  // Clean trailing specification keywords and phone digits
  if (rawModel) {
    rawModel = rawModel.replace(
      /\b(?:FULL|ABTOCAЛOH|АВТОСАЛОН|EUROPA|AMERIKA|KOREA|БЕ ГУМРУК|РАСТАМОЖКА|M PACKET|M SPORT|COMPETITION|EDITION)\b/gi,
      ''
    );
    rawModel = rawModel.replace(/\b\d{6,}\b/g, '');
    rawModel = rawModel.replace(/\s+/g, ' ').replace(/^[\s:\-.,]+|[\s:\-.,]+$/g, '');
  }

  return normalizeCarModel(rawBrand, rawModel);
}

// =========================================================
// FULL CAR TEXT PARSER
// =========================================================

export function parseCarText(text: string): CarParseResult {
  const [brand, model] = parseBrandAndModel(text);
  const { year, month } = parseYearMonth(text);
  const mileage = parseMileage(text);
  const engine = parseEngine(text);
  const { priceTjs, priceUsd } = parsePrices(text);
  const phoneNumber = parsePhoneNumber(text);

  let production: string | null = null;
  let transmission: string | null = null;
  let fuel: string | null = null;
  let condition: string | null = null;

  const prodMatch = text.match(/(?:Производство|Истехсол|Production)\s*[:\-]?\s*([^\n\r]+)/i);
  if (prodMatch) production = prodMatch[1].trim();

  const transMatch = text.match(/(?:Трансмиссия|Коробка|Transmission)\s*[:\-]?\s*([^\n\r]+)/i);
  if (transMatch) transmission = transMatch[1].trim();

  const fuelMatch = text.match(/(?:Топливо|Сулхо|Fuel)\s*[:\-]?\s*([^\n\r]+)/i);
  if (fuelMatch) fuel = fuelMatch[1].trim();

  const condMatch = text.match(/(?:Состояние|Холат|Condition)\s*[:\-]?\s*([^\n\r]+)/i);
  if (condMatch) condition = condMatch[1].trim();

  return {
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
    price_tjs: priceTjs,
    price_usd: priceUsd,
    phone_number: phoneNumber,
  };
}

// =========================================================
// VALIDATION
// =========================================================

export function isValidListing(data: CarParseResult): boolean {
  const hasCar = Boolean(data.brand || data.model);
  const hasPrice = Boolean(data.price_tjs || data.price_usd);
  return hasCar && hasPrice;
}
