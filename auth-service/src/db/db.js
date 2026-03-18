const { Pool } = require('pg');

// ใช้ connectionString เป็นหลัก ถ้าไม่มีค่อยแยกเป็นส่วนๆ
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, 
  // ถ้าบนเครื่อง Local ไม่ได้ใช้ DATABASE_URL ก็จะ fallback มาใช้พวกนี้
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 5432,
});

// ตรวจสอบการเชื่อมต่อ (สำคัญมากในการ Debug)
pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle client', err);
  process.exit(-1);
});

module.exports = { pool };