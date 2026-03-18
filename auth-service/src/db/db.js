const { Pool } = require('pg');
const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false }
    : { host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, port: process.env.DB_PORT || 5432 }
);
pool.on('error', (err) => { console.error('❌ Unexpected error on idle client', err); process.exit(-1); });
module.exports = { pool };
