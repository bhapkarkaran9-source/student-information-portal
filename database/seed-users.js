require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../src/config/db');

const ROLES = [
  { name: 'ADMIN', description: 'System Administrator with full access' },
  { name: 'TEACHER', description: 'Faculty and instructors' },
  { name: 'STUDENT', description: 'Enrolled students' }
];

const USERS = [
  {
    username: 'admin',
    email: 'admin@studentportal.local',
    plainPassword: 'Admin@123',
    firstName: 'System',
    lastName: 'Admin',
    roleName: 'ADMIN'
  },
  {
    username: 'teacher',
    email: 'teacher@studentportal.local',
    plainPassword: 'Teacher@123',
    firstName: 'Faculty',
    lastName: 'Teacher',
    roleName: 'TEACHER'
  },
  {
    username: 'student',
    email: 'student@studentportal.local',
    plainPassword: 'Student@123',
    firstName: 'Enrolled',
    lastName: 'Student',
    roleName: 'STUDENT'
  }
];

async function seed() {
  let connection;
  try {
    connection = await pool.getConnection();
    console.log('Connected to database for development user seeding...');

    // 1. Ensure Roles exist and read role_id dynamically
    for (const r of ROLES) {
      const [existingRole] = await connection.query(
        'SELECT role_id FROM roles WHERE role_name = ? LIMIT 1',
        [r.name]
      );
      if (existingRole.length === 0) {
        await connection.query(
          'INSERT INTO roles (role_name, description) VALUES (?, ?)',
          [r.name, r.description]
        );
        console.log(`Role created: ${r.name}`);
      }
    }

    // 2. Fetch all role IDs dynamically
    const [roleRows] = await connection.query('SELECT role_id, role_name FROM roles');
    const roleMap = {};
    roleRows.forEach((row) => {
      roleMap[row.role_name] = row.role_id;
    });

    // 3. Insert development accounts safely
    for (const u of USERS) {
      const [existingUser] = await connection.query(
        'SELECT user_id FROM users WHERE username = ? OR email = ? LIMIT 1',
        [u.username, u.email]
      );

      if (existingUser.length > 0) {
        console.log(`User already exists (skipped duplicate): ${u.username}`);
        continue;
      }

      const roleId = roleMap[u.roleName];
      if (!roleId) {
        throw new Error(`Role ID not found for role: ${u.roleName}`);
      }

      // Hash password using bcryptjs with 10 salt rounds
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(u.plainPassword, salt);

      await connection.query(
        `INSERT INTO users (role_id, username, email, password_hash, first_name, last_name, is_active)
         VALUES (?, ?, ?, ?, ?, ?, TRUE)`,
        [roleId, u.username, u.email, passwordHash, u.firstName, u.lastName]
      );

      console.log(`User created: ${u.username} (Role: ${u.roleName})`);
    }

    console.log('Development user seed process completed successfully.');
  } catch (error) {
    console.error('Seeding error:', error.message);
    process.exitCode = 1;
  } finally {
    if (connection) connection.release();
    await pool.end();
  }
}

seed();
