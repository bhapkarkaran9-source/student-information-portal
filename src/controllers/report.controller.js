const Report = require('../models/report.model');
const ExportService = require('../services/export.service');
const { createAuditLog } = require('../services/audit.service');

/**
 * Report Column Mappings for CSV & Excel Exporters
 */
const REPORT_COLUMNS = {
  'student-profile': [
    { header: 'Course Code', key: 'course_code' },
    { header: 'Course Name', key: 'course_name' },
    { header: 'Credits', key: 'credits' },
    { header: 'Type', key: 'course_type' },
    { header: 'Academic Year', key: 'academic_year' },
    { header: 'Semester', key: 'semester' },
    { header: 'Enrollment Status', key: 'status' }
  ],
  attendance: [
    { header: 'PRN', key: 'prn_number' },
    { header: 'Student Name', key: 'student_name' },
    { header: 'Class', key: 'class_name' },
    { header: 'Division', key: 'division' },
    { header: 'Course Code', key: 'course_code' },
    { header: 'Course Name', key: 'course_name' },
    { header: 'Department', key: 'department_name' },
    { header: 'Total Lectures', key: 'total_lectures' },
    { header: 'Present', key: 'present_count' },
    { header: 'Absent', key: 'absent_count' },
    { header: 'Late', key: 'late_count' },
    { header: 'Excused', key: 'excused_count' },
    { header: 'Attendance %', key: 'percentage' },
    { header: 'Status', key: 'status' }
  ],
  'attendance-sessions': [
    { header: 'Date', key: 'attendance_date' },
    { header: 'PRN', key: 'prn_number' },
    { header: 'Student Name', key: 'student_name' },
    { header: 'Class', key: 'class_name' },
    { header: 'Division', key: 'division' },
    { header: 'Course Code', key: 'course_code' },
    { header: 'Course Name', key: 'course_name' },
    { header: 'Department', key: 'department_name' },
    { header: 'Lecture Type', key: 'lecture_type' },
    { header: 'Session', key: 'session_name' },
    { header: 'Time Slot', key: 'time_slot' },
    { header: 'Status', key: 'status' },
    { header: 'Remarks', key: 'remarks' }
  ],
  grades: [
    { header: 'PRN', key: 'prn_number' },
    { header: 'Student Name', key: 'student_name' },
    { header: 'Course Code', key: 'course_code' },
    { header: 'Course Name', key: 'course_name' },
    { header: 'Credits', key: 'credits' },
    { header: 'Assessment', key: 'assessment_type' },
    { header: 'Internal', key: 'internal_marks' },
    { header: 'External', key: 'external_marks' },
    { header: 'Practical', key: 'practical_marks' },
    { header: 'Total Marks', key: 'total_marks' },
    { header: 'Max Marks', key: 'max_marks' },
    { header: 'Percentage %', key: 'percentage' },
    { header: 'Letter Grade', key: 'letter_grade' },
    { header: 'Grade Point', key: 'grade_point' },
    { header: 'Result Status', key: 'status' },
    { header: 'Exam Session', key: 'exam_session' }
  ],
  performance: [
    { header: 'PRN', key: 'prn_number' },
    { header: 'Student Name', key: 'student_name' },
    { header: 'Class', key: 'class_name' },
    { header: 'Department', key: 'department_name' },
    { header: 'Attendance %', key: 'attendance_percentage' },
    { header: 'Average Marks %', key: 'average_marks' },
    { header: 'SGPA', key: 'sgpa' },
    { header: 'Courses Evaluated', key: 'courses_evaluated' },
    { header: 'Failed Courses', key: 'failed_courses' },
    { header: 'Risk Level', key: 'risk_level' },
    { header: 'Risk Reason', key: 'risk_reason' },
    { header: 'Overall Status', key: 'overall_status' }
  ],
  'course-wise': [
    { header: 'Course Code', key: 'course_code' },
    { header: 'Course Name', key: 'course_name' },
    { header: 'Department', key: 'department_name' },
    { header: 'Credits', key: 'credits' },
    { header: 'Enrolled Students', key: 'enrolled_students' },
    { header: 'Total Lectures', key: 'total_lectures' },
    { header: 'Avg Attendance %', key: 'average_attendance' },
    { header: 'Defaulters (<75%)', key: 'defaulters_count' },
    { header: 'Evaluated Students', key: 'evaluated_students' },
    { header: 'Passed Count', key: 'passed_count' },
    { header: 'Pass Rate %', key: 'pass_rate' },
    { header: 'Avg Marks %', key: 'average_marks' }
  ],
  'student-wise': [
    { header: 'Course Code', key: 'course_code' },
    { header: 'Course Name', key: 'course_name' },
    { header: 'Credits', key: 'credits' },
    { header: 'Assessment', key: 'assessment_type' },
    { header: 'Total Marks', key: 'total_marks' },
    { header: 'Percentage %', key: 'percentage' },
    { header: 'Grade', key: 'letter_grade' },
    { header: 'Grade Point', key: 'grade_point' },
    { header: 'Status', key: 'status' }
  ],
  enrollment: [
    { header: 'Enrollment ID', key: 'enrollment_id' },
    { header: 'PRN', key: 'prn_number' },
    { header: 'Student Name', key: 'student_name' },
    { header: 'Course Code', key: 'course_code' },
    { header: 'Course Name', key: 'course_name' },
    { header: 'Credits', key: 'credits' },
    { header: 'Department', key: 'department_name' },
    { header: 'Academic Year', key: 'academic_year' },
    { header: 'Semester', key: 'semester' },
    { header: 'Enrollment Date', key: 'enrollment_date' },
    { header: 'Status', key: 'status' }
  ],
  timetable: [
    { header: 'Day', key: 'day_of_week' },
    { header: 'Start Time', key: 'start_time' },
    { header: 'End Time', key: 'end_time' },
    { header: 'Course Code', key: 'course_code' },
    { header: 'Course Name', key: 'course_name' },
    { header: 'Teacher', key: 'teacher_name' },
    { header: 'Designation', key: 'teacher_designation' },
    { header: 'Class', key: 'class_name' },
    { header: 'Division', key: 'division' },
    { header: 'Room No', key: 'room_no' },
    { header: 'Semester', key: 'semester' }
  ]
};

/**
 * Helper: Resolve and enforce RBAC and IDOR permissions on query parameters
 */
const resolveAndVerifyScope = async (req, reportType) => {
  const { role, user_id } = req.user;
  const filters = { ...req.query };

  // 1. STUDENT SCOPING
  if (role === 'STUDENT') {
    const studentId = await Report.getStudentIdByUserId(user_id);
    if (!studentId) {
      return { allowed: false, status: 403, message: 'No student record associated with this account' };
    }

    // Students are forbidden from viewing administrative course-wise aggregations
    if (reportType === 'course-wise') {
      return { allowed: false, status: 403, message: 'Course-level summary reports are restricted to faculty and administration' };
    }

    // IDOR Check: If user explicitly passed student_id, ensure it matches own studentId
    if (filters.student_id && parseInt(filters.student_id, 10) !== studentId) {
      return { allowed: false, status: 403, message: 'Access denied: You can only view your own reports' };
    }

    // Force student_id filter
    filters.student_id = studentId;
  }

  // 2. TEACHER SCOPING
  else if (role === 'TEACHER') {
    const teacherId = await Report.getTeacherIdByUserId(user_id);
    if (!teacherId) {
      return { allowed: false, status: 403, message: 'No faculty record associated with this account' };
    }

    const assignedCourseIds = await Report.getTeacherAssignedCourseIds(teacherId);
    filters.allowedCourseIds = assignedCourseIds;

    // If teacher selected a specific course, verify authorization
    if (filters.course_id) {
      const cid = parseInt(filters.course_id, 10);
      if (!assignedCourseIds.includes(cid)) {
        return { allowed: false, status: 403, message: 'Access denied: You are not authorized to view reports for this course' };
      }
    }

    // If teacher selected a specific student (for student-profile or student-wise report), verify enrollment
    if (filters.student_id && (reportType === 'student-profile' || reportType === 'student-wise')) {
      const sid = parseInt(filters.student_id, 10);
      const isAllowed = await Report.isStudentInTeacherCourses(teacherId, sid);
      if (!isAllowed) {
        return { allowed: false, status: 403, message: 'Access denied: You can only view reports for students enrolled in your assigned courses' };
      }
    }

    // For timetable: force teacher's own teacher_id unless requesting a specific assigned course
    if (reportType === 'timetable' && !filters.teacher_id) {
      filters.teacher_id = teacherId;
    }
  }

  return { allowed: true, filters };
};

/**
 * Helper: Generate raw report data bundle
 */
const fetchReportData = async (reportType, filters) => {
  switch (reportType) {
    case 'student-profile': {
      if (!filters.student_id) {
        return { error: 'Student ID is required for student profile report', status: 400 };
      }
      const data = await Report.getStudentProfileReport({ studentId: filters.student_id });
      if (!data) return { error: 'Student profile not found', status: 404 };
      return {
        title: `Student Profile Report - ${data.student.full_name} (${data.student.prn_number})`,
        data: data.enrollments,
        student: data.student,
        summary: data.summary
      };
    }

    case 'attendance': {
      if (filters.view === 'sessions' || filters.detailed === 'true') {
        const result = await Report.getAttendanceSessionReport(filters);
        return {
          title: 'Academic Lecture Attendance Sessions Report',
          data: result.items,
          summary: result.summary
        };
      }
      const result = await Report.getAttendanceReport(filters);
      return {
        title: 'Academic Attendance Report',
        data: result.items,
        summary: result.summary
      };
    }

    case 'attendance-sessions': {
      const result = await Report.getAttendanceSessionReport(filters);
      return {
        title: 'Academic Lecture Attendance Sessions Report',
        data: result.items,
        summary: result.summary
      };
    }

    case 'grades': {
      const result = await Report.getGradeReport(filters);
      return {
        title: 'Academic Grades & Examination Report',
        data: result.items,
        summary: result.summary
      };
    }

    case 'performance': {
      const result = await Report.getPerformanceReport(filters);
      return {
        title: 'Student Performance & Academic Standing Report',
        data: result.items,
        summary: result.summary
      };
    }

    case 'course-wise': {
      const result = await Report.getCourseWiseReport(filters);
      return {
        title: 'Course-wise Academic Evaluation Report',
        data: result.items,
        summary: result.summary
      };
    }

    case 'student-wise': {
      if (!filters.student_id) {
        return { error: 'Student ID is required for student academic report', status: 400 };
      }
      const data = await Report.getStudentWiseAcademicReport({
        studentId: filters.student_id,
        semester: filters.semester,
        academicYear: filters.academic_year
      });
      if (!data) return { error: 'Student academic record not found', status: 404 };
      return {
        title: `Comprehensive Academic Report - ${data.student.full_name} (${data.student.prn_number})`,
        data: data.grades.items,
        student: data.student,
        attendance: data.attendance,
        grades: data.grades,
        academic_evaluation: data.academic_evaluation,
        summary: {
          sgpa: data.academic_evaluation.sgpa,
          overall_attendance: `${data.academic_evaluation.overall_attendance_percentage}%`,
          pass_rate: `${data.academic_evaluation.pass_rate}%`,
          academic_standing: data.academic_evaluation.standing,
          cgpa: data.academic_evaluation.cgpa_status
        }
      };
    }

    case 'enrollment': {
      const result = await Report.getEnrollmentReport(filters);
      return {
        title: 'Course Enrollment Report',
        data: result.items,
        summary: result.summary
      };
    }

    case 'timetable': {
      const result = await Report.getTimetableReport(filters);
      return {
        title: 'Class Schedule & Timetable Report',
        data: result.items,
        summary: result.summary
      };
    }

    default:
      return { error: `Invalid report type: '${reportType}'`, status: 400 };
  }
};

/**
 * GET /api/reports/:reportType
 * JSON Preview Endpoint
 */
const getReport = async (req, res) => {
  try {
    const { reportType } = req.params;
    const scope = await resolveAndVerifyScope(req, reportType);
    if (!scope.allowed) {
      return res.status(scope.status).json({ success: false, message: scope.message });
    }

    const report = await fetchReportData(reportType, scope.filters);
    if (report.error) {
      return res.status(report.status || 400).json({ success: false, message: report.error });
    }

    const columns = REPORT_COLUMNS[reportType] || [];

    return res.status(200).json({
      success: true,
      message: `${report.title} generated successfully`,
      title: report.title,
      columns,
      data: report.data || [],
      summary: report.summary || {},
      student_profile: report.student || null,
      academic_evaluation: report.academic_evaluation || null,
      filters: scope.filters,
      generated_by: {
        id: req.user.user_id,
        name: req.user.full_name || req.user.username,
        role: req.user.role
      },
      generated_at: new Date().toISOString()
    });
  } catch (err) {
    console.error('Error generating report preview:', err);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while generating report'
    });
  }
};

/**
 * GET /api/reports/:reportType/csv
 * CSV Export Endpoint
 */
const exportReportCsv = async (req, res) => {
  try {
    const { reportType } = req.params;
    const scope = await resolveAndVerifyScope(req, reportType);
    if (!scope.allowed) {
      return res.status(scope.status).json({ success: false, message: scope.message });
    }

    const report = await fetchReportData(reportType, scope.filters);
    if (report.error) {
      return res.status(report.status || 400).json({ success: false, message: report.error });
    }

    const columns = REPORT_COLUMNS[reportType] || [];
    const csvContent = ExportService.generateCsv({
      title: report.title,
      columns,
      data: report.data || [],
      summary: report.summary
    });

    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `${reportType}-report-${dateStr}.csv`;

    await createAuditLog({
      userId: req.user.user_id,
      action: 'REPORT_EXPORTED_CSV',
      entity: 'REPORT',
      entityId: reportType,
      description: `Exported ${reportType} report as CSV`,
      details: { report_type: reportType, filename },
      req
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(csvContent);
  } catch (err) {
    console.error('Error exporting CSV report:', err);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while exporting CSV report'
    });
  }
};

/**
 * GET /api/reports/:reportType/excel
 * Excel (.xlsx) Export Endpoint
 */
const exportReportExcel = async (req, res) => {
  try {
    const { reportType } = req.params;
    const scope = await resolveAndVerifyScope(req, reportType);
    if (!scope.allowed) {
      return res.status(scope.status).json({ success: false, message: scope.message });
    }

    const report = await fetchReportData(reportType, scope.filters);
    if (report.error) {
      return res.status(report.status || 400).json({ success: false, message: report.error });
    }

    const columns = REPORT_COLUMNS[reportType] || [];
    const buffer = await ExportService.generateExcel({
      title: report.title,
      columns,
      data: report.data || [],
      summary: report.summary
    });

    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `${reportType}-report-${dateStr}.xlsx`;

    await createAuditLog({
      userId: req.user.user_id,
      action: 'REPORT_EXPORTED_XLSX',
      entity: 'REPORT',
      entityId: reportType,
      description: `Exported ${reportType} report as Excel (.xlsx)`,
      details: { report_type: reportType, filename },
      req
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(buffer);
  } catch (err) {
    console.error('Error exporting Excel report:', err);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while exporting Excel report'
    });
  }
};

/**
 * GET /api/reports/filters/options
 * Dropdown filter options helper
 */
const getFilterOptions = async (req, res) => {
  try {
    const courseId = req.query.course_id || req.query.courseId || null;
    const options = await Report.getReportFilterOptions({
      role: req.user.role,
      userId: req.user.user_id,
      courseId
    });

    return res.status(200).json({
      success: true,
      message: 'Filter options retrieved successfully',
      data: options
    });
  } catch (err) {
    console.error('Error fetching filter options:', err);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while fetching filter options'
    });
  }
};

module.exports = {
  getReport,
  exportReportCsv,
  exportReportExcel,
  getFilterOptions
};
