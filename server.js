require('dotenv').config();
const app = require('./src/app');

const PORT = process.env.PORT || 5000;
const db = require('./src/config/db');
const academicEventModel = require('./src/models/academicEvent.model');
const timetableReminderScheduler = require('./src/services/timetableReminderScheduler.service');
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
  timetableReminderScheduler.start();
});

// Automated academic event reminder evaluator (every 30 minutes)
const reminderInterval = setInterval(async () => {
  try {
    const res = await academicEventModel.triggerReminders();
    if (res.dispatchedCount > 0) {
      console.log(`[AcademicCalendar] Periodic reminder check: ${res.dispatchedCount} dispatched`);
    }
  } catch (err) {
    console.warn('[AcademicCalendar] Periodic reminder check non-fatal error:', err.message);
  }
}, 30 * 60 * 1000);

// Graceful shutdown handling for SIGINT and SIGTERM
let isShuttingDown = false;

async function gracefulShutdown(signal) {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;
  console.log(`[Server] Received ${signal}. Initiating graceful shutdown...`);

  // 1. Clear background reminder interval
  if (reminderInterval) {
    clearInterval(reminderInterval);
    console.log('[Server] Cleared background reminder interval');
  }

  timetableReminderScheduler.stop();
  console.log('[Server] Cleared timetable reminder scheduler interval');

  // 2. Safety timeout to force termination if pending requests hang
  const shutdownTimeout = setTimeout(() => {
    console.warn('[Server] Graceful shutdown timed out; forcing exit');
    process.exit(1);
  }, 10000);
  if (typeof shutdownTimeout.unref === 'function') {
    shutdownTimeout.unref();
  }

  // 3. Stop accepting new HTTP requests and close server cleanly
  server.close(async (err) => {
    if (err) {
      console.error('[Server] Error while closing HTTP server:', err.message);
    } else {
      console.log('[Server] HTTP server closed cleanly');
    }

    // 4. Gracefully close database connection pool
    try {
      if (db && typeof db.end === 'function') {
        await db.end();
        console.log('[Server] Database pool closed cleanly');
      }
    } catch (dbErr) {
      console.error('[Server] Error while closing database pool:', dbErr.message);
    }

    clearTimeout(shutdownTimeout);
    console.log('[Server] Graceful shutdown complete');
    process.exit(err ? 1 : 0);
  });
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

module.exports = { server, reminderInterval, gracefulShutdown };

