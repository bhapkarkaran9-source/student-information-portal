const performanceModel = require('../models/performance.model');

/**
 * Admin Performance Controller
 * Read-only analytics endpoints combining Attendance + Grades + Courses + Students
 */

// Helper to strictly validate positive integers (avoiding parseInt leading digit bypass)
const isPositiveInteger = (val) => {
  if (val === undefined || val === null) return false;
  const str = String(val).trim();
  if (!/^\d+$/.test(str)) return false;
  return parseInt(str, 10) > 0;
};

// Helper to strictly validate semester between 1 and 12
const isValidSemester = (val) => {
  if (val === undefined || val === null) return false;
  const str = String(val).trim();
  if (!/^\d+$/.test(str)) return false;
  const sem = parseInt(str, 10);
  return sem >= 1 && sem <= 12;
};

/**
 * 1. GET /api/performance/overview
 * Overall academic analytics KPIs
 */
const getOverview = async (req, res) => {
  try {
    const { academic_year, semester, department_id } = req.query;

    if (semester !== undefined && semester !== '') {
      if (!isValidSemester(semester)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid semester parameter. Must be between 1 and 12.'
        });
      }
    }

    if (department_id !== undefined && department_id !== '') {
      if (!isPositiveInteger(department_id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid department_id parameter. Must be a positive integer.'
        });
      }
    }

    const data = await performanceModel.getOverviewStats({
      academic_year,
      semester,
      department_id
    });

    return res.status(200).json({
      success: true,
      message: 'Academic performance overview fetched successfully',
      data
    });
  } catch (error) {
    console.error('Performance overview error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch academic performance overview',
      error: error.message
    });
  }
};

/**
 * 2. GET /api/performance/student/:studentId
 * Student academic summary, course breakdown & attendance %
 */
const getStudentPerformance = async (req, res) => {
  try {
    const { studentId } = req.params;

    if (!isPositiveInteger(studentId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid student ID. Must be a positive integer.'
      });
    }

    const sid = parseInt(studentId, 10);
    const data = await performanceModel.getStudentPerformance(sid);

    if (!data) {
      return res.status(404).json({
        success: false,
        message: `Student with ID ${sid} was not found`
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Student performance details fetched successfully',
      data
    });
  } catch (error) {
    console.error('Student performance error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch student performance',
      error: error.message
    });
  }
};

/**
 * 3. GET /api/performance/course/:courseId
 * Course-level analytics & grade distribution
 */
const getCoursePerformance = async (req, res) => {
  try {
    const { courseId } = req.params;

    if (!isPositiveInteger(courseId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid course ID. Must be a positive integer.'
      });
    }

    const cid = parseInt(courseId, 10);
    const { academic_year, semester } = req.query;

    if (semester !== undefined && semester !== '') {
      if (!isValidSemester(semester)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid semester parameter. Must be between 1 and 12.'
        });
      }
    }

    const data = await performanceModel.getCoursePerformance(cid, {
      academic_year,
      semester
    });

    if (!data) {
      return res.status(404).json({
        success: false,
        message: `Course with ID ${cid} was not found`
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Course performance details fetched successfully',
      data
    });
  } catch (error) {
    console.error('Course performance error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch course performance',
      error: error.message
    });
  }
};

/**
 * 4. GET /api/performance/department/:departmentId
 * Department-level performance & grade distribution
 */
const getDepartmentPerformance = async (req, res) => {
  try {
    const { departmentId } = req.params;

    if (!isPositiveInteger(departmentId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid department ID. Must be a positive integer.'
      });
    }

    const did = parseInt(departmentId, 10);
    const data = await performanceModel.getDepartmentPerformance(did);

    if (!data) {
      return res.status(404).json({
        success: false,
        message: `Department with ID ${did} was not found`
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Department performance details fetched successfully',
      data
    });
  } catch (error) {
    console.error('Department performance error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch department performance',
      error: error.message
    });
  }
};

/**
 * 5. GET /api/performance/semester
 * Semester-level performance aggregated
 */
const getSemesterPerformance = async (req, res) => {
  try {
    const { academic_year, semester, department_id } = req.query;

    if (semester !== undefined && semester !== '') {
      if (!isValidSemester(semester)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid semester parameter. Must be between 1 and 12.'
        });
      }
    }

    if (department_id !== undefined && department_id !== '') {
      if (!isPositiveInteger(department_id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid department_id parameter. Must be a positive integer.'
        });
      }
    }

    const data = await performanceModel.getSemesterPerformance({
      academic_year,
      semester,
      department_id
    });

    return res.status(200).json({
      success: true,
      message: 'Semester performance details fetched successfully',
      data
    });
  } catch (error) {
    console.error('Semester performance error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch semester performance',
      error: error.message
    });
  }
};

/**
 * 6. GET /api/performance/at-risk
 * Rule-based low-performance detection
 */
const getAtRisk = async (req, res) => {
  try {
    const { department_id, semester, risk_level } = req.query;

    if (semester !== undefined && semester !== '') {
      if (!isValidSemester(semester)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid semester parameter. Must be between 1 and 12.'
        });
      }
    }

    if (department_id !== undefined && department_id !== '') {
      if (!isPositiveInteger(department_id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid department_id parameter. Must be a positive integer.'
        });
      }
    }

    const data = await performanceModel.getAtRiskStudents({
      department_id,
      semester,
      risk_level
    });

    return res.status(200).json({
      success: true,
      message: 'At-risk students fetched successfully',
      data
    });
  } catch (error) {
    console.error('At-risk performance error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch at-risk students',
      error: error.message
    });
  }
};

/**
 * 7. GET /api/performance/top-performers
 * Students ranked by SGPA or percentage
 */
const getTopPerformers = async (req, res) => {
  try {
    const { limit, department_id, semester, academic_year } = req.query;

    let limitNum = 10;
    if (limit !== undefined && limit !== '') {
      if (!isPositiveInteger(limit)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid limit parameter. Must be a positive integer.'
        });
      }
      limitNum = parseInt(limit, 10);
    }

    if (semester !== undefined && semester !== '') {
      if (!isValidSemester(semester)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid semester parameter. Must be between 1 and 12.'
        });
      }
    }

    if (department_id !== undefined && department_id !== '') {
      if (!isPositiveInteger(department_id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid department_id parameter. Must be a positive integer.'
        });
      }
    }

    const data = await performanceModel.getTopPerformers({
      limit: limitNum,
      department_id,
      semester,
      academic_year
    });

    return res.status(200).json({
      success: true,
      message: 'Top performers fetched successfully',
      data
    });
  } catch (error) {
    console.error('Top performers error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch top performers',
      error: error.message
    });
  }
};

/**
 * 8. GET /api/performance/grade-distribution
 * Counts and percentages across all 8 grades
 */
const getGradeDistribution = async (req, res) => {
  try {
    const { department_id, course_id, semester, academic_year } = req.query;

    if (semester !== undefined && semester !== '') {
      if (!isValidSemester(semester)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid semester parameter. Must be between 1 and 12.'
        });
      }
    }

    if (department_id !== undefined && department_id !== '') {
      if (!isPositiveInteger(department_id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid department_id parameter. Must be a positive integer.'
        });
      }
    }

    if (course_id !== undefined && course_id !== '') {
      if (!isPositiveInteger(course_id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid course_id parameter. Must be a positive integer.'
        });
      }
    }

    const data = await performanceModel.getGradeDistribution({
      department_id,
      course_id,
      semester,
      academic_year
    });

    return res.status(200).json({
      success: true,
      message: 'Grade distribution fetched successfully',
      data
    });
  } catch (error) {
    console.error('Grade distribution error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch grade distribution',
      error: error.message
    });
  }
};

/**
 * 9. GET /api/performance/attendance-vs-performance
 * Attendance % and Marks/GP correlation data
 */
const getAttendanceVsPerformance = async (req, res) => {
  try {
    const { department_id, course_id, semester } = req.query;

    if (semester !== undefined && semester !== '') {
      if (!isValidSemester(semester)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid semester parameter. Must be between 1 and 12.'
        });
      }
    }

    if (department_id !== undefined && department_id !== '') {
      if (!isPositiveInteger(department_id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid department_id parameter. Must be a positive integer.'
        });
      }
    }

    if (course_id !== undefined && course_id !== '') {
      if (!isPositiveInteger(course_id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid course_id parameter. Must be a positive integer.'
        });
      }
    }

    const data = await performanceModel.getAttendanceVsPerformance({
      department_id,
      course_id,
      semester
    });

    return res.status(200).json({
      success: true,
      message: 'Attendance vs performance data fetched successfully',
      data
    });
  } catch (error) {
    console.error('Attendance vs performance error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch attendance vs performance data',
      error: error.message
    });
  }
};

/**
 * 10. GET /api/performance/students
 * Paginated student performance roster for ERP table
 */
const getStudents = async (req, res) => {
  try {
    const { page, limit, search, department_id, semester, risk_status } = req.query;

    if (semester !== undefined && semester !== '') {
      if (!isValidSemester(semester)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid semester parameter. Must be between 1 and 12.'
        });
      }
    }

    if (department_id !== undefined && department_id !== '') {
      if (!isPositiveInteger(department_id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid department_id parameter. Must be a positive integer.'
        });
      }
    }

    const data = await performanceModel.getStudentsPerformanceList({
      page,
      limit,
      search,
      department_id,
      semester,
      risk_status
    });

    return res.status(200).json({
      success: true,
      message: 'Student performance list fetched successfully',
      data
    });
  } catch (error) {
    console.error('Students performance list error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch students performance list',
      error: error.message
    });
  }
};

module.exports = {
  getOverview,
  getStudentPerformance,
  getCoursePerformance,
  getDepartmentPerformance,
  getSemesterPerformance,
  getAtRisk,
  getTopPerformers,
  getGradeDistribution,
  getAttendanceVsPerformance,
  getStudents
};
