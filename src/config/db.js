const mysql = require('mysql2/promise');
require('dotenv').config();

// Create MySQL connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'student_portal_db',
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

// Helper function to test database connectivity safely
const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    connection.release();
    return { success: true };
  } catch (error) {
    return {
      success: false,
      code: error.code || 'CONNECTION_FAILED',
      message: 'Failed to connect to MySQL database'
    };
  }
};

pool.testConnection = testConnection;

module.exports = pool;
