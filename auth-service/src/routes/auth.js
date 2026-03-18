const express  = require('express');
const bcrypt   = require('bcryptjs');
const { pool } = require('../db/db');
const { generateToken, verifyToken } = require('../middleware/jwtUtils');
const router = express.Router();

const ACTIVITY_URL = process.env.ACTIVITY_SERVICE_URL || 'http://activity-service:3003';

// ── Helper: ส่ง activity log (fire-and-forget) ────────────────────────
function logActivity({ userId, username, eventType, entityType, entityId, summary }) {
  fetch(ACTIVITY_URL + '/api/activity/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: userId,
      username: username || null,
      event_type: eventType,
      entity_type: entityType || null,
      entity_id: entityId || null,
      summary: summary || null
    })
  }).catch(() => {});
}

// ── POST /api/auth/register ───────────────────────────────────────────
router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;

  try {
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
    }

    const checkUser = await pool.query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email.toLowerCase().trim(), username.trim()]
    );
    if (checkUser.rows.length > 0) {
      return res.status(400).json({ error: 'อีเมลหรือชื่อผู้ใช้งานนี้ถูกใช้ไปแล้ว' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, email, password_hash, role) VALUES ($1,$2,$3,$4) RETURNING id, username, email, role',
      [username.trim(), email.toLowerCase().trim(), hashedPassword, 'member']
    );
    const newUser = result.rows[0];

    res.status(201).json({ message: 'สมัครสมาชิกสำเร็จ!', user: newUser });

    logActivity({
      userId: newUser.id,
      username: newUser.username,
      eventType: 'USER_REGISTERED',
      entityType: 'user',
      entityId: newUser.id,
      summary: newUser.username + ' สมัครสมาชิกใหม่'
    });

  } catch (err) {
    console.error('❌ REGISTER ERROR:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// ── POST /api/auth/login ──────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: 'ไม่พบอีเมลนี้ในระบบ' });
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'รหัสผ่านไม่ถูกต้อง' });
    }

    const token = generateToken({
      sub: user.id,
      email: user.email,
      role: user.role || 'member',
      username: user.username
    });

    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });

    logActivity({
      userId: user.id,
      username: user.username,
      eventType: 'USER_LOGIN',
      entityType: 'user',
      entityId: user.id,
      summary: user.username + ' เข้าสู่ระบบ'
    });

  } catch (err) {
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// ── GET /api/auth/verify ──────────────────────────────────────────────
router.get('/verify', (req, res) => {
  const token = (req.headers['authorization'] || '').split(' ')[1];
  try {
    const decoded = verifyToken(token);
    res.json({ valid: true, user: decoded });
  } catch (err) {
    res.status(401).json({ valid: false });
  }
});

// ── GET /api/auth/users ───────────────────────────────────────────────
router.get('/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, username, email, role FROM users ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// ── DELETE /api/auth/users/:id ────────────────────────────────────────
router.delete('/users/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'ไม่พบผู้ใช้งานที่ต้องการลบ' });
    }
    res.json({ message: 'ลบผู้ใช้งานสำเร็จ' });
  } catch (err) {
    res.status(500).json({ error: 'ไม่สามารถลบได้ เนื่องจากมีข้อมูลที่เกี่ยวข้องอยู่ในระบบ' });
  }
});

module.exports = router;
