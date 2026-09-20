# Student Information Portal

A modular, multi-role web application built with **Node.js**, **Express.js**, **MySQL**, and **Vanilla JavaScript (HTML5/CSS3/ES6)**.

---

## Architecture Overview

The project uses a clean, beginner-friendly layered architecture where the Express server serves both the RESTful API endpoints and the static frontend client files.

```
Student Information Portal/
├── .env.example                # Environment variable configuration template
├── .gitignore                  # Files and folders to ignore in Git
├── package.json                # Project dependencies and npm scripts
├── README.md                   # Project documentation
├── server.js                   # Application entry point (starts HTTP server)
│
├── database/                   # Database scripts and schema definitions
│   └── schema.sql              # MySQL schema (tables, foreign keys, indexes)
│
├── src/                        # Backend Application Source Code
│   ├── app.js                  # Express app setup, middleware, and route mounting
│   ├── config/                 # Configuration files
│   │   └── db.js               # MySQL connection pool setup
│   ├── controllers/            # Request handlers (processes inputs & sends responses)
│   │   ├── admin.controller.js
│   │   ├── auth.controller.js
│   │   ├── student.controller.js
│   │   ├── teacher.controller.js
│   │   └── user.controller.js
│   ├── middlewares/            # Express request interceptors
│   │   ├── auth.middleware.js  # JWT token verification
│   │   ├── error.middleware.js # Centralized error handling
│   │   └── role.middleware.js  # Role-based access control (ADMIN, TEACHER, STUDENT)
│   ├── models/                 # Database interaction layer (SQL queries)
│   │   ├── attendance.model.js
│   │   ├── course.model.js
│   │   ├── student.model.js
│   │   ├── teacher.model.js
│   │   └── user.model.js
│   ├── routes/                 # Express route definitions
│   │   ├── admin.routes.js
│   │   ├── auth.routes.js
│   │   ├── index.js            # Main router aggregating all routes under /api
│   │   ├── student.routes.js
│   │   ├── teacher.routes.js
│   │   └── user.routes.js
│   └── utils/                  # Reusable backend helper functions
│       ├── response.js         # Standardized JSON response formatter
│       └── token.js            # JWT generator and token verification helpers
│
└── public/                     # Frontend Client (Vanilla HTML/CSS/JS)
    ├── index.html              # Landing page
    ├── login.html              # Role-based authentication page
    ├── css/                    # Modular stylesheets
    │   ├── auth.css            # Styles for login and auth forms
    │   ├── dashboard.css       # Styles for dashboard, navigation, tables, cards
    │   └── style.css           # Global CSS variables and reset
    ├── js/                     # Frontend JavaScript modules
    │   ├── api.js              # Fetch wrapper with automatic JWT headers
    │   ├── auth.js             # Client-side session and route guards
    │   └── utils.js            # DOM helpers, formatters, and notifications
    └── pages/                  # Role-specific dashboard views
        ├── admin/
        │   └── dashboard.html  # Administrator portal view
        ├── teacher/
        │   └── dashboard.html  # Teacher portal view
        └── student/
            └── dashboard.html  # Student portal view
```

---

## User Roles
1. **ADMIN**: Full system control (users, courses, departments, timetables, reports, audit logs, system backups).
2. **TEACHER**: Mark attendance, manage assignments, upload materials, record grades, respond to student queries.
3. **STUDENT**: View attendance records, course progress, grades, timetable, download study materials, submit queries.
