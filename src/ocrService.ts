import { createWorker } from 'tesseract.js';

class OCRService {
  private worker: any = null;
  private isInitializing = false;

  public async getWorker() {
    if (this.worker) return this.worker;

    if (!this.isInitializing) {
      this.isInitializing = true;
      try {
        console.log('Loading Tesseract OCR engine (rus+eng)...');
        this.worker = await createWorker(['rus', 'eng']);
        console.log('Tesseract OCR engine ready ✅');
      } catch (err) {
        console.error('⚠️ Failed to initialize Tesseract worker:', err);
      } finally {
        this.isInitializing = false;
      }
    } else {
      // Wait if already initializing
      while (this.isInitializing) {
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    return this.worker;
  }

  public async extractTextFromImage(imagePath: string): Promise<string[]> {
    try {
      const worker = await this.getWorker();
      if (!worker) return [];

      const { data } = await worker.recognize(imagePath);
      const rawText = data?.text || '';

      const lines = rawText
        .split('\n')
        .map((l: string) => l.trim())
        .filter((l: string) => l.length > 0);

      return lines;
    } catch (err) {
      console.warn(`⚠️ OCR error on ${imagePath}:`, err);
      return [];
    }
  }

  public async terminate(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
  }
}

export const ocrService = new OCRService();
