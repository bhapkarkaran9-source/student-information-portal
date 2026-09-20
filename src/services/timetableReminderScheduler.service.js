const pool = require('../config/db');
const timetableController = require('../controllers/timetable.controller');

const CHECK_INTERVAL_MS = 60 * 1000;

const createMockResponse = () => ({
  statusCode: 200,
  payload: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(data) {
    this.payload = data;
    return this;
  },
  send(data) {
    this.payload = data;
    return this;
  },
  end(data) {
    if (data !== undefined) {
      this.payload = data;
    }
    return this;
  }
});

async function runReminderCheckForUser(userId, role) {
  const req = {
    user: { user_id: userId, role },
    body: {},
    query: {}
  };
  const res = createMockResponse();

  try {
    await timetableController.checkAndDispatchReminders(req, res);
    const payload = res.payload || {};
    const dispatchedCount = Number(payload?.data?.reminders_dispatched || 0);

    if (dispatchedCount > 0) {
      console.log(`[TimetableReminderScheduler] ${role} user ${userId}: dispatched ${dispatchedCount} reminder(s)`);
    }

    return dispatchedCount;
  } catch (error) {
    console.warn(
      `[TimetableReminderScheduler] ${role} user ${userId} reminder check failed:`,
      error && error.message ? error.message : error
    );
    return 0;
  }
}

async function runReminderSweep() {
  let totalDispatched = 0;

  try {
    const [studentRows] = await pool.query(`
      SELECT DISTINCT s.user_id
      FROM students s
      INNER JOIN users u ON u.user_id = s.user_id
      WHERE u.is_active = 1
      ORDER BY s.user_id
    `);

    for (const row of studentRows) {
      totalDispatched += await runReminderCheckForUser(row.user_id, 'STUDENT');
    }

    const [teacherRows] = await pool.query(`
      SELECT DISTINCT t.user_id
      FROM teachers t
      INNER JOIN users u ON u.user_id = t.user_id
      WHERE u.is_active = 1
      ORDER BY t.user_id
    `);

    for (const row of teacherRows) {
      totalDispatched += await runReminderCheckForUser(row.user_id, 'TEACHER');
    }
  } catch (error) {
    console.warn('[TimetableReminderScheduler] reminder sweep failed:', error && error.message ? error.message : error);
  }

  return totalDispatched;
}

function start() {
  if (global.__timetableReminderSchedulerInterval) {
    return global.__timetableReminderSchedulerInterval;
  }

  console.log('Timetable reminder scheduler started');

  const interval = setInterval(() => {
    runReminderSweep().catch((error) => {
      console.warn('[TimetableReminderScheduler] scheduler tick failed:', error && error.message ? error.message : error);
    });
  }, CHECK_INTERVAL_MS);

  if (typeof interval.unref === 'function') {
    interval.unref();
  }

  global.__timetableReminderSchedulerInterval = interval;

  runReminderSweep().catch((error) => {
    console.warn('[TimetableReminderScheduler] startup sweep failed:', error && error.message ? error.message : error);
  });

  return interval;
}

function stop() {
  const interval = global.__timetableReminderSchedulerInterval;
  if (interval) {
    clearInterval(interval);
    delete global.__timetableReminderSchedulerInterval;
  }
}

module.exports = {
  CHECK_INTERVAL_MS,
  start,
  stop,
  runReminderSweep,
  runReminderCheckForUser
};
