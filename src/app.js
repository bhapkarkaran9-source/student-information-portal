const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./config/db');
const apiRoutes = require('./routes');
const { errorHandler } = require('./middlewares/error.middleware');

const app = express();

// Parse and normalize allowed origins from environment (comma-separated, default: http://localhost:5000)
const rawAllowedOrigins = process.env.ALLOWED_ORIGINS || 'http://localhost:5000';
const allowedOrigins = rawAllowedOrigins
  .split(',')
  .map(origin => origin.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no Origin header (same-origin requests, mobile apps, curl, internal server requests)
    if (!origin) {
      return callback(null, true);
    }

    const normalizedOrigin = origin.trim().replace(/\/+$/, '');
    if (allowedOrigins.includes(normalizedOrigin)) {
      return callback(null, true);
    }

    // Disallow cross-origin requests from unapproved origins (omits Access-Control-Allow-Origin)
    return callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  credentials: true,
  optionsSuccessStatus: 204
};

// Enable Configured Cross-Origin Resource Sharing
app.use(cors(corsOptions));

// Parse incoming JSON request bodies
app.use(express.json());

// Serve frontend static files from the public folder
app.use(express.static(path.join(__dirname, '..', 'public')));

// Server Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'Student Information Portal API is running',
    timestamp: new Date().toISOString()
  });
});

// Database Connection Test Endpoint
app.get('/api/db-test', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT 1 AS result');
    return res.status(200).json({
      status: 'OK',
      message: 'Database connection successful'
    });
  } catch (error) {
    console.error('Database connection test error:', error.message);
    return res.status(500).json({
      status: 'ERROR',
      message: 'Database connection failed',
      code: error.code || 'DB_ERROR'
    });
  }
});

// Mount All API Routes
app.use('/api', apiRoutes);

// Global Error Handling Middleware (Registered AFTER all routes)
app.use(errorHandler);

module.exports = app;
