require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const { pool } = require('./db/db');
const authRouter = require('./routes/auth');

const app  = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json()); // ✅ ต้องมี ไม่งั้น req.body จะเป็น undefined

// Routes
app.use('/api/auth', authRouter);

// Health
app.get('/api/auth/health', (_, res) =>
  res.json({ status: 'ok', service: 'auth-service', time: new Date() })
);

async function start() {
  let retries = 10;
  while (retries > 0) {
    try { 
      await pool.query('SELECT 1'); 
      console.log('✅ [auth-service] Database connected');
      break; 
    } catch (e) {
      console.log(`❌ [auth] Waiting DB... (${retries} left)`);
      retries--;
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  app.listen(PORT, () => console.log(`🚀 [auth-service] Running on :${PORT}`));
}

start();