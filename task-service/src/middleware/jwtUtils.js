const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

function verifyToken(req, res, next) {
  // ดึง Token จาก Header "Authorization: Bearer <token>"
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'ต้องใช้ Token ในการเข้าถึง (Unauthorized)' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // เก็บข้อมูล user (sub, username, role) ไว้ใน req.user เพื่อให้ route อื่นใช้ต่อ
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Token ไม่ถูกต้องหรือหมดอายุ' });
  }
}

module.exports = { verifyToken };