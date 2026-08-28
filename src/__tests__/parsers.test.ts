import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCarText,
  isValidListing,
  parsePhoneNumber,
} from '../parsers.js';

test('Test Case 1: Labeled TOYOTA RAV4 caption', () => {
  const caption = `🚘Модель TOYOTA RAV4
📆Год:2023.07
🏁Производство: USA
🐎Пробег: 35.000
⚙Трансмиссия: Автомат
⛽️Топливо: Бензин Гибрид
🔋Двигатель: 2.5
🛠Состояние: с пробегом
💵Цена: 327 .000c
Тел.+992 907 77 01 10
`;

  const data = parseCarText(caption);
  assert.equal(isValidListing(data), true);
  assert.equal(data.brand, 'Toyota');
  assert.equal(data.model, 'RAV4');
  assert.equal(data.year, 2023);
  assert.equal(data.month, 7);
  assert.equal(data.mileage, 35000);
  assert.equal(data.engine, 2.5);
  assert.equal(data.price_tjs, 327000);
  assert.equal(data.production, 'USA');
  assert.equal(data.transmission, 'Автомат');
  assert.equal(data.fuel, 'Бензин Гибрид');
  assert.equal(data.condition, 'с пробегом');
  assert.equal(data.phone_number, '+992 907 77 01 10');
});

test('Test Case 2: Unlabeled story text with dual USD / TJS prices', () => {
  const storyText = `BMW M6 4.4 V8 COMPETITION 2014 FULL
23.900$ 222.900c`;

  const data = parseCarText(storyText);
  assert.equal(isValidListing(data), true);
  assert.equal(data.brand, 'BMW');
  assert.equal(data.model, 'M6');
  assert.equal(data.year, 2014);
  assert.equal(data.engine, 4.4);
  assert.equal(data.price_usd, 23900);
  assert.equal(data.price_tjs, 222900);
});

test('Test Case 3: Non-listing post with no price -> rejected', () => {
  const text = 'M5 ё CLS ? 😍❤️';
  const data = parseCarText(text);
  assert.equal(isValidListing(data), false);
});

test('Test Case 4: RENGE ROVER P550E fuzzy normalization', () => {
  const text = `Модель RENGE ROVER P550E
Год:2024
Цена:835.000c
Тел: +992 557 94 49 49`;

  const data = parseCarText(text);
  assert.equal(isValidListing(data), true);
  assert.equal(data.brand, 'Land Rover');
  assert.equal(data.model, 'Range Rover P550e');
  assert.equal(data.year, 2024);
  assert.equal(data.price_tjs, 835000);
  assert.equal(data.phone_number, '+992 557 94 49 49');
});

test('Test Case 5: Noisy story OCR with stickers and watermarks', () => {
  const ocrText = `Instagzam
X
4444mk01 @ 12h
LC PRAD0 D3 2.5 TT EUROPA 2026.5 FULL
82.900$ 770.900C
AUTOTUNING
TAJIKISTAN
TOYOTA
4444MKO1
TEL 901404444
TEL 028246767
Reply to 4444mk01..`;

  const data = parseCarText(ocrText);
  assert.equal(isValidListing(data), true);
  assert.equal(data.brand, 'Toyota');
  assert.equal(data.model, 'Land Cruiser Prado');
  assert.equal(data.year, 2026);
  assert.equal(data.month, 5);
  assert.equal(data.engine, 2.5);
  assert.equal(data.price_usd, 82900);
  assert.equal(data.price_tjs, 770900);
  assert.equal(data.phone_number, '+992 901 40 44 44');
});

test('Test Case 6: RR DEFENDER shorthand', () => {
  const ocrText = `Instagzam X 4444mk01 19h RR DEFENDER P525 V8 BLACK EDITION EUROPA 2023 FULL 84.900$ 789.900C AUTOTUNING TAJIKISTAN ©4444MK01 TEL 901404444 TEL 028246767 Reply to 4444mk01...`;

  const data = parseCarText(ocrText);
  assert.equal(isValidListing(data), true);
  assert.equal(data.brand, 'Land Rover');
  assert.equal(data.model, 'Defender');
  assert.equal(data.year, 2023);
  assert.equal(data.price_usd, 84900);
  assert.equal(data.price_tjs, 789900);
  assert.equal(data.phone_number, '+992 901 40 44 44');
});

test('Test Phone Number formats', () => {
  assert.equal(parsePhoneNumber('Тел.+992 557 94 49 49'), '+992 557 94 49 49');
  assert.equal(parsePhoneNumber('WhatsApp: +992 974 44 44 54'), '+992 974 44 44 54');
  assert.equal(parsePhoneNumber('Тел: 907 77 01 10'), '+992 907 77 01 10');
  assert.equal(parsePhoneNumber('+992907491044'), '+992 907 49 10 44');
  assert.equal(parsePhoneNumber('TEL 901404444'), '+992 901 40 44 44');
});
