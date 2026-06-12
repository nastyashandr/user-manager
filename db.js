const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: 'postgre',
    password: 'xTv0Nw35AcorKuFK7AiXFPBccXL3moHT',
    host: 'dpg-d8lui7mgvqtc73cfb5q0-a.ohio-postgres.render.com',
    database: 'user_manager_zr1g',
    port: 5432,
    ssl: {
        rejectUnauthorized: false  // Обязательно для Render!
    }
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