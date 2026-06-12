const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
});

async function initDB() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            email VARCHAR(255) NOT NULL,
            password VARCHAR(255) NOT NULL,
            status VARCHAR(20) DEFAULT 'unverified',
            last_login TIMESTAMP,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);

    // Create unique index
    await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_email 
        ON users (LOWER(email))
    `);
}

module.exports = { pool, initDB };