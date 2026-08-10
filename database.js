const mysql = require('mysql2/promise');
require('dotenv').config();

const host = process.env.DB_HOST || 'localhost';
const user = process.env.DB_USER || 'root';
const password = process.env.DB_PASSWORD || '';
const database = process.env.DB_NAME || 'table';

const pool = mysql.createPool({
  host,
  user,
  password,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

async function initializeDatabase() {
  const connection = await pool.getConnection();
  try {
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\``);
    await connection.query(`USE \`${database}\``);
    await connection.query(`
      CREATE TABLE IF NOT EXISTS login (
        id INT AUTO_INCREMENT PRIMARY KEY,
        fullName VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        provider VARCHAR(50),
        googleId VARCHAR(255),
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const [providerColumns] = await connection.query("SHOW COLUMNS FROM login LIKE 'provider'");
    if (providerColumns.length === 0) {
      await connection.query('ALTER TABLE login ADD COLUMN provider VARCHAR(50)');
    }

    const [googleIdColumns] = await connection.query("SHOW COLUMNS FROM login LIKE 'googleId'");
    if (googleIdColumns.length === 0) {
      await connection.query('ALTER TABLE login ADD COLUMN googleId VARCHAR(255)');
    }

    console.log(`Database '${database}' is ready on ${host}`);
  } finally {
    connection.release();
  }
}

async function execute(sql, params = []) {
  const connection = await pool.getConnection();
  try {
    await connection.query(`USE \`${database}\``);
    return connection.execute(sql, params);
  } finally {
    connection.release();
  }
}

module.exports = {
  execute,
  initializeDatabase,
};
