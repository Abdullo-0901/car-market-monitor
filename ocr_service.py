from pathlib import Path
from typing import List, Optional
from paddleocr import PaddleOCR


class OCRService:
    def __init__(self):
        self._ocr: Optional[PaddleOCR] = None

    @property
    def ocr(self) -> PaddleOCR:
        if self._ocr is None:
            print("Loading PaddleOCR...", flush=True)
            self._ocr = PaddleOCR(
                lang="ru",
                use_doc_orientation_classify=False,
                use_doc_unwarping=False,
                use_textline_orientation=False,
            )
            print("PaddleOCR ready ✅", flush=True)
        return self._ocr

    def extract_text_from_image(self, image_path: Path) -> List[str]:
        """
        Runs OCR on the specified image path and returns unique extracted text lines.
        """
        if not image_path or not Path(image_path).exists():
            return []

        try:
            results = self.ocr.predict(str(image_path))
        except Exception as e:
            print(f"⚠️ PaddleOCR error: {e}")
            return []

        raw_lines = []
        for result in results:
            try:
                rec_texts = result.get("rec_texts", [])
            except Exception:
                rec_texts = []
            raw_lines.extend(rec_texts)

        # Deduplicate lines while preserving order
        seen = set()
        unique_lines = []
        for line in raw_lines:
            line_str = str(line).strip()
            if line_str and line_str not in seen:
                seen.add(line_str)
                unique_lines.append(line_str)

        return unique_lines


# Singleton instance
ocr_service = OCRService()
