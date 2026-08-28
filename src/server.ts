import express from 'express';
import cors from 'cors';
import path from 'node:path';
import {
  CAR_IMAGES_DIR,
  WEB_DIR,
} from './config.js';
import {
  initDb,
  queryCars,
  getDashboardStats,
  getFilterOptions,
  getDailyChecksSummary,
} from './database.js';

const app = express();
const PORT = Number(process.env.PORT) || 8000;

app.use(cors());
app.use(express.json());

// Initialize DB schema on startup
initDb();

// =========================================================
// REST API ENDPOINTS
// =========================================================

app.get('/api/cars', (req, res) => {
  try {
    const data = queryCars(req.query);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/stats', (_req, res) => {
  try {
    const data = getDashboardStats();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/filters', (_req, res) => {
  try {
    const data = getFilterOptions();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/daily-checks', (_req, res) => {
  try {
    const data = getDailyChecksSummary();
    res.json({ checks: data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// =========================================================
// STATIC ASSETS & WEB DASHBOARD
// =========================================================

// Serve local vehicle images
app.use('/car_images', express.static(CAR_IMAGES_DIR));

// Serve frontend static files
app.use(express.static(WEB_DIR));

app.get('*', (_req, res) => {
  res.sendFile(path.join(WEB_DIR, 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log('=======================================================');
  console.log(`🚀 TypeScript Car Market Dashboard Server running at:`);
  console.log(`👉 http://localhost:${PORT}`);
  console.log(`👉 http://127.0.0.1:${PORT}`);
  console.log('=======================================================');
});
