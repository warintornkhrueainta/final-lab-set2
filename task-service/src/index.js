const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { pool } = require('./db/db');
const taskRoutes = require('./routes/tasks');

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Health route (ไม่ต้องมี JWT)
app.get('/api/tasks/health', (_, res) =>
  res.json({ status: 'ok', service: 'task-service', time: new Date() })
);

app.use('/api/tasks', taskRoutes);

const PORT = process.env.PORT || 3002;

// ✅ รอ DB ก่อน start
async function start() {
  let retries = 10;
  while (retries > 0) {
    try {
      await pool.query('SELECT 1');
      console.log('✅ [task-service] Database connected');
      break;
    } catch (e) {
      console.log(`❌ [task] Waiting DB... (${retries} left)`);
      retries--;
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  app.listen(PORT, () => console.log(`🚀 [task-service] Running on :${PORT}`));
}

start();