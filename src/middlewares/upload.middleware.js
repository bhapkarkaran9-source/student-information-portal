const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Base directories
const BASE_UPLOADS = path.resolve(__dirname, '..', '..', 'uploads');
const MATERIALS_DIR = path.resolve(BASE_UPLOADS, 'materials');
const SUBMISSIONS_DIR = path.resolve(BASE_UPLOADS, 'submissions');
const AVATARS_DIR = path.resolve(__dirname, '..', '..', 'public', 'uploads', 'avatars');

// Ensure directories exist
if (!fs.existsSync(BASE_UPLOADS)) fs.mkdirSync(BASE_UPLOADS, { recursive: true });
if (!fs.existsSync(MATERIALS_DIR)) fs.mkdirSync(MATERIALS_DIR, { recursive: true });
if (!fs.existsSync(SUBMISSIONS_DIR)) fs.mkdirSync(SUBMISSIONS_DIR, { recursive: true });
if (!fs.existsSync(AVATARS_DIR)) fs.mkdirSync(AVATARS_DIR, { recursive: true });

// Allowed extensions for study materials
const ALLOWED_MATERIAL_EXTS = new Set([
  '.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.txt', '.csv'
]);

// Allowed extensions for assignment submissions
const ALLOWED_SUBMISSION_EXTS = new Set([
  '.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.txt', '.zip', '.rar', '.7z', '.tar', '.gz'
]);

// Allowed extensions and MIME types for Profile Avatars
const ALLOWED_AVATAR_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const ALLOWED_AVATAR_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

// Dangerous extensions explicitly prohibited
const DANGEROUS_EXTS = new Set([
  '.exe', '.bat', '.cmd', '.sh', '.vbs', '.msi', '.ps1', '.com', '.scr', '.pif', '.reg', '.js', '.jsx', '.ts', '.tsx', '.php', '.py', '.rb', '.pl', '.jsp', '.asp', '.aspx', '.cgi', '.jar', '.war', '.html', '.htm', '.svg'
]);

/**
 * Generate safe, unique filename
 */
const safeFilename = (file) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const randomHex = crypto.randomBytes(8).toString('hex');
  const timestamp = Date.now();
  return `${timestamp}-${randomHex}${ext}`;
};

// Storage configuration for Study Materials
const materialStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, MATERIALS_DIR);
  },
  filename: (req, file, cb) => {
    cb(null, safeFilename(file));
  }
});

// Storage configuration for Submissions
const submissionStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, SUBMISSIONS_DIR);
  },
  filename: (req, file, cb) => {
    cb(null, safeFilename(file));
  }
});

// Filter for Study Materials
const materialFileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (DANGEROUS_EXTS.has(ext)) {
    return cb(new Error('Security violation: Dangerous file type detected and prohibited.'));
  }
  if (!ALLOWED_MATERIAL_EXTS.has(ext)) {
    return cb(new Error(`Invalid file type. Allowed formats: ${Array.from(ALLOWED_MATERIAL_EXTS).join(', ')}`));
  }
  cb(null, true);
};

// Filter for Submissions
const submissionFileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (DANGEROUS_EXTS.has(ext)) {
    return cb(new Error('Security violation: Dangerous file type detected and prohibited.'));
  }
  if (!ALLOWED_SUBMISSION_EXTS.has(ext)) {
    return cb(new Error(`Invalid file type. Allowed formats: ${Array.from(ALLOWED_SUBMISSION_EXTS).join(', ')}`));
  }
  cb(null, true);
};

// Storage configuration for Profile Avatars
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, AVATARS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const userId = (req.user && req.user.user_id) ? req.user.user_id : 'anon';
    const timestamp = Date.now();
    const randomHex = crypto.randomBytes(6).toString('hex');
    cb(null, `avatar-${userId}-${timestamp}-${randomHex}${ext}`);
  }
});

// Filter for Profile Avatars (strictly validated image types only)
const avatarFileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = (file.mimetype || '').toLowerCase();

  if (DANGEROUS_EXTS.has(ext)) {
    return cb(new Error('Security violation: Dangerous file type detected and prohibited.'));
  }
  if (!ALLOWED_AVATAR_EXTS.has(ext) || !ALLOWED_AVATAR_MIMES.has(mime)) {
    return cb(new Error('Invalid image format. Allowed formats: JPG, JPEG, PNG, WEBP.'));
  }
  cb(null, true);
};

// 10MB size limit for materials/submissions, 5MB for avatars
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

const uploadMaterialMulter = multer({
  storage: materialStorage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: materialFileFilter
}).single('file');

const uploadSubmissionMulter = multer({
  storage: submissionStorage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: submissionFileFilter
}).single('file');

const uploadAvatarMulter = multer({
  storage: avatarStorage,
  limits: { fileSize: MAX_AVATAR_SIZE },
  fileFilter: avatarFileFilter
}).fields([
  { name: 'photo', maxCount: 1 },
  { name: 'file', maxCount: 1 },
  { name: 'avatar', maxCount: 1 }
]);

/**
 * Middleware wrapper for Material Upload with clean error handling
 */
const uploadMaterialFile = (req, res, next) => {
  uploadMaterialMulter(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'File size exceeds the 10MB maximum allowed limit.'
        });
      }
      return res.status(400).json({
        success: false,
        message: `Upload error: ${err.message}`
      });
    } else if (err) {
      return res.status(400).json({
        success: false,
        message: err.message
      });
    }
    next();
  });
};

/**
 * Middleware wrapper for Submission Upload with clean error handling
 */
const uploadSubmissionFile = (req, res, next) => {
  uploadSubmissionMulter(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'File size exceeds the 10MB maximum allowed limit.'
        });
      }
      return res.status(400).json({
        success: false,
        message: `Upload error: ${err.message}`
      });
    } else if (err) {
      return res.status(400).json({
        success: false,
        message: err.message
      });
    }
    next();
  });
};

/**
 * Middleware wrapper for Avatar Profile Photo Upload with clean error handling
 */
const uploadAvatarFile = (req, res, next) => {
  uploadAvatarMulter(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'File size exceeds the 5MB maximum allowed limit.'
        });
      }
      return res.status(400).json({
        success: false,
        message: `Upload error: ${err.message}`
      });
    } else if (err) {
      return res.status(400).json({
        success: false,
        message: err.message
      });
    }

    // Normalize req.file from fields
    if (req.files) {
      req.file = (req.files['photo'] && req.files['photo'][0]) ||
                 (req.files['file'] && req.files['file'][0]) ||
                 (req.files['avatar'] && req.files['avatar'][0]) || null;
    }

    next();
  });
};

module.exports = {
  BASE_UPLOADS,
  MATERIALS_DIR,
  SUBMISSIONS_DIR,
  AVATARS_DIR,
  uploadMaterialFile,
  uploadSubmissionFile,
  uploadAvatarFile
};
