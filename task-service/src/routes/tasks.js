const express = require('express');
const { pool } = require('../db/db');
// ⚠️ สมมติว่าคุณมี Middleware ตรวจสอบ Token อยู่ที่ path นี้นะครับ (เพื่อให้มี req.user)
const { verifyToken } = require('../middleware/jwtUtils'); 
const router = express.Router();

// เปิดใช้งานตรวจสอบ Token ทุก Route ในไฟล์นี้ (ต้องล็อกอินถึงจัดการ Task ได้)
router.use(verifyToken);

// ── Helper: log ลง task-db ────────────────────────────────────────────
async function logToDB({ level, event, userId, message, meta }) {
  try {
    await pool.query(
      `INSERT INTO logs (level, event, user_id, message, meta) VALUES ($1,$2,$3,$4,$5)`,
      [level, event, userId || null, message || null,
       meta ? JSON.stringify(meta) : null]
    );
  } catch (e) { 
    console.error('[task-log]', e.message); 
  }
}

// ── Helper: ส่ง activity event (fire-and-forget) ──────────────────────
async function logActivity({ userId, username, eventType, entityId, summary, meta }) {
  const ACTIVITY_URL = process.env.ACTIVITY_SERVICE_URL || 'http://activity-service:3003';
  fetch(`${ACTIVITY_URL}/api/activity/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: userId, 
      username: username, 
      event_type: eventType,
      entity_type: 'task', 
      entity_id: entityId || null,
      summary: summary, 
      meta: meta || null
    })
  }).catch(() => {
    console.warn('[task] activity-service unreachable — skipping event log');
  });
}

// ── GET /api/tasks (ดึงข้อมูล Task ของตัวเอง) ──────────────────────────
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM tasks WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.sub]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// ── POST /api/tasks (สร้าง Task) ──────────────────────────────────────
router.post('/', async (req, res) => {
  const { title, description, priority } = req.body;
  
  if (!title) return res.status(400).json({ error: 'Title is required' });

  // ดึง userId จาก Token (sub)
  const userId = req.user.sub || req.user.id;

  try {
    // 📍 ตรวจสอบ: ลอง Query ดูว่าตาราง tasks มีอยู่จริงไหม
    const result = await pool.query(
      `INSERT INTO tasks (user_id, title, description, priority) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [userId, title, description || null, priority || 'medium']
    );
    const task = result.rows[0];

    // 1. ตอบกลับ Client ทันที
    res.status(201).json(task);

    // 2. ส่ง Activity Log (Fire-and-forget)
    // ใช้ summary ให้ตรงตามที่ Checklist ต้องการ
    logActivity({
      userId: userId, 
      username: req.user.username,
      eventType: 'TASK_CREATED', 
      entityId: task.id,
      summary: `TASK_CREATED: ${title}`, 
      meta: { task_id: task.id, title, priority }
    });

  } catch (err) {
    // 📍 จุดสำคัญ: พ่น Error ออกมาดูใน Docker Log
    console.error('❌ [Task Service] INSERT ERROR:', err.message);
    
    // ถ้าขึ้นว่า relation "tasks" does not exist แสดงว่าลืมสร้าง Table
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// ── PUT /api/tasks/:id (แก้ไข Task) ───────────────────────────────────
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { title, description, status, priority } = req.body;

  try {
    // เช็คก่อนว่ามี Task นี้ไหม และเป็นของ User คนนี้จริงๆ หรือเปล่า
    const check = await pool.query('SELECT * FROM tasks WHERE id = $1 AND user_id = $2', [id, req.user.sub]);
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found or unauthorized' });
    }

    const result = await pool.query(
      `UPDATE tasks SET 
        title = COALESCE($1, title), 
        description = COALESCE($2, description), 
        status = COALESCE($3, status), 
        priority = COALESCE($4, priority), 
        updated_at = NOW() 
       WHERE id = $5 AND user_id = $6 RETURNING *`,
      [title, description, status, priority, id, req.user.sub]
    );
    const updatedTask = result.rows[0];

    // 1. ตอบกลับ Client
    res.json(updatedTask);

    // 2. ส่ง Activity Log (เฉพาะถ้า status เปลี่ยน)
    if (status && status !== check.rows[0].status) {
      logActivity({
        userId: req.user.sub, 
        username: req.user.username,
        eventType: 'TASK_STATUS_CHANGED', 
        entityId: parseInt(id),
        summary: `${req.user.username} เปลี่ยนสถานะ task #${id} เป็น ${status}`,
        meta: { task_id: parseInt(id), old_status: check.rows[0].status, new_status: status }
      });
    }

  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── DELETE /api/tasks/:id (ลบ Task) ───────────────────────────────────
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM tasks WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, req.user.sub]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found or unauthorized' });
    }

    // 1. ตอบกลับ Client
    res.json({ message: 'Task deleted successfully' });

    // 2. ส่ง Activity Log
    logActivity({
      userId: req.user.sub, 
      username: req.user.username,
      eventType: 'TASK_DELETED', 
      entityId: parseInt(id),
      summary: `${req.user.username} ลบ task #${id}`,
      meta: { task_id: parseInt(id) }
    });

  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;