import fuzzysort from 'fuzzysort';
import { loadCarCatalog } from './carCatalog.js';
import type { CatalogEntry } from './types.js';

// =========================================================
// BRAND CANONICAL MAPPING
// =========================================================
export const BRAND_MAPPING: Record<string, string> = {
  // Standard Make Names
  'BMW': 'BMW',
  'MERCEDES': 'Mercedes-Benz',
  'MERCEDES-BENZ': 'Mercedes-Benz',
  'MERCEDES BENZ': 'Mercedes-Benz',
  'МЕРСЕДЕС': 'Mercedes-Benz',
  'TOYOTA': 'Toyota',
  'ТОЙОТА': 'Toyota',
  'LEXUS': 'Lexus',
  'ЛЕКСУС': 'Lexus',
  'HYUNDAI': 'Hyundai',
  'ХУНДАЙ': 'Hyundai',
  'KIA': 'Kia',
  'КИА': 'Kia',
  'CHEVROLET': 'Chevrolet',
  'ШЕВРОЛЕ': 'Chevrolet',
  'AUDI': 'Audi',
  'АУДИ': 'Audi',
  'PORSCHE': 'Porsche',
  'ПОРШ': 'Porsche',
  'HONDA': 'Honda',
  'ХОНДА': 'Honda',
  'NISSAN': 'Nissan',
  'НИССАН': 'Nissan',
  'INFINITI': 'Infiniti',
  'ИНФИНИТИ': 'Infiniti',
  'MAZDA': 'Mazda',
  'МАЗДА': 'Mazda',
  'MITSUBISHI': 'Mitsubishi',
  'МИТСУБИСИ': 'Mitsubishi',
  'VOLKSWAGEN': 'Volkswagen',
  'ФОЛЬКСВАГЕН': 'Volkswagen',
  'VW': 'Volkswagen',
  'VOLVO': 'Volvo',
  'ВОЛЬВО': 'Volvo',
  'FORD': 'Ford',
  'ФОРД': 'Ford',
  'TESLA': 'Tesla',
  'ТЕСЛА': 'Tesla',
  'BYD': 'BYD',
  'БИД': 'BYD',
  'ZEEKR': 'Zeekr',
  'ЗИКР': 'Zeekr',
  'GEELY': 'Geely',
  'ДЖИЛИ': 'Geely',
  'CHERY': 'Chery',
  'ЧЕРИ': 'Chery',
  'HAVAL': 'Haval',
  'ХАВАЛ': 'Haval',
  'EXEED': 'Exeed',
  'ЭКСИД': 'Exeed',
  'CHANGAN': 'Changan',
  'ЧАНГАН': 'Changan',
  'HONGQI': 'Hongqi',
  'ХОНЧИ': 'Hongqi',
  'LI AUTO': 'Li Auto',
  'LIXIANG': 'Li Auto',
  'ЛИ АВТО': 'Li Auto',
  'LAND ROVER': 'Land Rover',
  'RANGE ROVER': 'Land Rover',
  'RENGE ROVER': 'Land Rover',
  'ЛЕНД РОВЕР': 'Land Rover',
  'РЕЙНДЖ РОВЕР': 'Land Rover',
  'GENESIS': 'Genesis',
  'ДЖЕНЕЗИС': 'Genesis',
  'GAC': 'GAC',
  'JETOUR': 'Jetour',
  'ДЖЕТУР': 'Jetour',
  'OMODA': 'Omoda',
  'JAECOO': 'Jaecoo',
  'VOYAH': 'Voyah',
  'NIO': 'NIO',
  'XPENG': 'XPeng',
  'DENZA': 'Denza',
  'AVATR': 'Avatr',
  'TANK': 'Tank',
  'ТАНК': 'Tank',
  'ROX': 'Rox',
  'MG': 'MG',
  'BENTLEY': 'Bentley',
  'FERRARI': 'Ferrari',
  'LAMBORGHINI': 'Lamborghini',
  'ROLLS-ROYCE': 'Rolls-Royce',
  'ROLLS ROYCE': 'Rolls-Royce',
  'ASTON MARTIN': 'Aston Martin',

  // Popular Model-First & Shorthand Aliases
  'LC PRADO': 'Toyota',
  'LC PRAD0': 'Toyota',
  'LAND CRUISER PRADO': 'Toyota',
  'LC300': 'Toyota',
  'LC 300': 'Toyota',
  'LC200': 'Toyota',
  'LC 200': 'Toyota',
  'CAMRY': 'Toyota',
  'CAMRY-6': 'Toyota',
  'COROLLA': 'Toyota',
  'HIGHLANDER': 'Toyota',
  'AVALON': 'Toyota',

  'RR DEFENDER': 'Land Rover',
  'DEFENDER': 'Land Rover',
  'RR SPORT': 'Land Rover',
  'RR VOGUE': 'Land Rover',
  'RR VELAR': 'Land Rover',
  'RR AUTOBIOGRAPHY': 'Land Rover',
  'RR': 'Land Rover',

  'SANTAFE': 'Hyundai',
  'SANTA FE': 'Hyundai',
  'SANTAFEE': 'Hyundai',
  'PALISADE': 'Hyundai',

  'GELIK': 'Mercedes-Benz',
  'GELANDEWAGEN': 'Mercedes-Benz',
  'G63': 'Mercedes-Benz',
  'G 63': 'Mercedes-Benz',
  'G500': 'Mercedes-Benz',
  'G 500': 'Mercedes-Benz',
  'MAYBACH': 'Mercedes-Benz',

  'COBALT': 'Chevrolet',
  'MALIBU': 'Chevrolet',
  'MALIBU 2': 'Chevrolet',
  'GENTRA': 'Chevrolet',
  'NEXIA': 'Chevrolet',
};

export function normalizeBrandName(brand: string | null): string | null {
  if (!brand) return null;
  const cleaned = brand.replace(/\s+/g, ' ').trim();
  const upper = cleaned.toUpperCase();

  if (BRAND_MAPPING[upper]) {
    return BRAND_MAPPING[upper];
  }

  if (['BMW', 'BYD', 'NIO', 'GAC', 'MG', 'VW'].includes(upper)) {
    return upper;
  }

  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
}

export class CarCatalogNormalizer {
  private aliasMap = new Map<string, { brand: string; model: string }>();
  private searchTargets: Array<{ text: string; brand: string; model: string }> = [];

  constructor() {
    this.initCatalog();
  }

  private initCatalog(): void {
    const catalog: CatalogEntry[] = loadCarCatalog();

    for (const item of catalog) {
      const fullCanonical = `${item.brand} ${item.model}`.toUpperCase();
      this.aliasMap.set(fullCanonical, { brand: item.brand, model: item.model });
      this.searchTargets.push({ text: fullCanonical, brand: item.brand, model: item.model });

      for (const alias of item.aliases || []) {
        const upperAlias = alias.trim().toUpperCase();
        if (upperAlias) {
          this.aliasMap.set(upperAlias, { brand: item.brand, model: item.model });
          this.searchTargets.push({ text: upperAlias, brand: item.brand, model: item.model });
        }
      }
    }
  }

  public normalize(
    rawBrand: string | null,
    rawModel: string | null
  ): [string | null, string | null] {
    const normBrand = normalizeBrandName(rawBrand);
    let cleanModel = rawModel ? rawModel.replace(/\s+/g, ' ').trim() : null;

    const candidates: string[] = [];
    const words = cleanModel ? cleanModel.split(' ') : [];

    if (rawBrand && cleanModel) {
      candidates.push(`${rawBrand} ${cleanModel}`.toUpperCase());
    }
    if (cleanModel) {
      candidates.push(cleanModel.toUpperCase());
    }

    if (words.length > 0) {
      for (let i = 1; i <= Math.min(words.length, 3); i++) {
        const sub = words.slice(0, i).join(' ').toUpperCase();
        if (rawBrand) {
          candidates.push(`${rawBrand} ${sub}`.toUpperCase());
        }
        candidates.push(sub);
      }
    }

    if (rawBrand) {
      candidates.push(rawBrand.toUpperCase());
    }

    // 1. Exact lookup
    for (const cand of candidates) {
      if (this.aliasMap.has(cand)) {
        const match = this.aliasMap.get(cand)!;
        return [match.brand, match.model];
      }
    }

    // 2. Fuzzy search
    for (const cand of candidates) {
      const results = fuzzysort.go(cand, this.searchTargets, {
        key: 'text',
        threshold: -100,
        limit: 1,
      });

      if (results.length > 0 && results[0].score > -15) {
        return [results[0].obj.brand, results[0].obj.model];
      }
    }

    // Fallback for Range Rover / Land Rover
    if (rawBrand && ['RANGE ROVER', 'RENGE ROVER'].includes(rawBrand.toUpperCase())) {
      const b = 'Land Rover';
      let m = cleanModel;
      if (cleanModel && !cleanModel.toLowerCase().startsWith('range rover')) {
        m = `Range Rover ${cleanModel}`.trim();
      } else if (!cleanModel) {
        m = 'Range Rover';
      }
      return [b, m];
    }

    return [normBrand, cleanModel];
  }
}

const normalizer = new CarCatalogNormalizer();

export function normalizeCarModel(
  brand: string | null,
  model: string | null
): [string | null, string | null] {
  return normalizer.normalize(brand, model);
}
