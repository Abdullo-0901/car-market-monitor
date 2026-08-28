import unittest
from parsers import parse_car_text, is_valid_listing, parse_phone_number


class TestCarParsers(unittest.TestCase):

    def test_case_1_toyota_rav4(self):
        """
        Test 1: Labeled TOYOTA RAV4 caption with year.month, mileage, engine, price, and phone.
        """
        caption = """🚘Модель TOYOTA RAV4
📆Год:2023.07
🏁Производство: USA
🐎Пробег: 35.000
⚙Трансмиссия: Автомат
⛽️Топливо: Бензин Гибрид
🔋Двигатель: 2.5
🛠Состояние: с пробегом
💵Цена: 327 .000c
Тел.+992 907 77 01 10
"""
        data = parse_car_text(caption)
        self.assertTrue(is_valid_listing(data))
        self.assertEqual(data["brand"], "Toyota")
        self.assertEqual(data["model"], "RAV4")
        self.assertEqual(data["year"], 2023)
        self.assertEqual(data["month"], 7)
        self.assertEqual(data["mileage"], 35000)
        self.assertEqual(data["engine"], 2.5)
        self.assertEqual(data["price_tjs"], 327000)
        self.assertEqual(data["production"], "USA")
        self.assertEqual(data["transmission"], "Автомат")
        self.assertEqual(data["fuel"], "Бензин Гибрид")
        self.assertEqual(data["condition"], "с пробегом")
        self.assertEqual(data["phone_number"], "+992 907 77 01 10")

    def test_case_2_bmw_m6_story_text(self):
        """
        Test 2: Unlabeled story text with dual USD / TJS prices.
        """
        story_text = """BMW M6 4.4 V8 COMPETITION 2014 FULL
23.900$ 222.900c"""
        data = parse_car_text(story_text)
        self.assertTrue(is_valid_listing(data))
        self.assertEqual(data["brand"], "BMW")
        self.assertEqual(data["model"], "M6")
        self.assertEqual(data["year"], 2014)
        self.assertEqual(data["engine"], 4.4)
        self.assertEqual(data["price_usd"], 23900)
        self.assertEqual(data["price_tjs"], 222900)

    def test_case_3_non_valid_post(self):
        """
        Test 3: Non-listing post with no price or full spec -> Must be rejected.
        """
        text = "M5 ё CLS ? 😍❤️"
        data = parse_car_text(text)
        self.assertFalse(is_valid_listing(data), "Conversational post without price should be rejected")

    def test_case_4_renge_rover_fuzzy_normalization(self):
        """
        Test 4: Typos like RENGE ROVER P550E normalized via RapidFuzz.
        """
        text = """Модель RENGE ROVER P550E
Год:2024
Цена:835.000c
Тел: +992 557 94 49 49"""
        data = parse_car_text(text)
        self.assertTrue(is_valid_listing(data))
        self.assertEqual(data["brand"], "Land Rover")
        self.assertEqual(data["model"], "Range Rover P550e")
        self.assertEqual(data["year"], 2024)
        self.assertEqual(data["price_tjs"], 835000)
        self.assertEqual(data["phone_number"], "+992 557 94 49 49")

    def test_case_5_story_noisy_ocr_toyota_prado(self):
        """
        Test 5: Noisy story OCR with stickers, phone numbers, and watermark footers.
        """
        ocr_text = """Instagzam
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
Reply to 4444mk01.."""
        data = parse_car_text(ocr_text)
        self.assertTrue(is_valid_listing(data))
        self.assertEqual(data["brand"], "Toyota")
        self.assertEqual(data["model"], "Land Cruiser Prado")
        self.assertEqual(data["year"], 2026)
        self.assertEqual(data["month"], 5)
        self.assertEqual(data["engine"], 2.5)
        self.assertEqual(data["price_usd"], 82900)
        self.assertEqual(data["price_tjs"], 770900)
        self.assertEqual(data["phone_number"], "+992 901 40 44 44")

    def test_case_6_rr_defender_shorthand(self):
        """
        Test 6: RR DEFENDER shorthand.
        """
        ocr_text = """Instagzam X 4444mk01 19h RR DEFENDER P525 V8 BLACK EDITION EUROPA 2023 FULL 84.900$ 789.900C AUTOTUNING TAJIKISTAN ©4444MK01 TEL 901404444 TEL 028246767 Reply to 4444mk01..."""
        data = parse_car_text(ocr_text)
        self.assertTrue(is_valid_listing(data))
        self.assertEqual(data["brand"], "Land Rover")
        self.assertEqual(data["model"], "Defender")
        self.assertEqual(data["year"], 2023)
        self.assertEqual(data["price_usd"], 84900)
        self.assertEqual(data["price_tjs"], 789900)
        self.assertEqual(data["phone_number"], "+992 901 40 44 44")

    def test_phone_number_formats(self):
        """
        Additional Test: Verify multiple phone number format extractions.
        """
        self.assertEqual(parse_phone_number("Тел.+992 557 94 49 49"), "+992 557 94 49 49")
        self.assertEqual(parse_phone_number("WhatsApp: +992 974 44 44 54"), "+992 974 44 44 54")
        self.assertEqual(parse_phone_number("Тел: 907 77 01 10"), "+992 907 77 01 10")
        self.assertEqual(parse_phone_number("+992907491044"), "+992 907 49 10 44")
        self.assertEqual(parse_phone_number("TEL 901404444"), "+992 901 40 44 44")


if __name__ == "__main__":
    unittest.main()
