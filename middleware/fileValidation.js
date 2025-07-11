const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const { logger } = require('./security');
const { parseFileSize } = require('../utils/fileSizeUtils');

/**
 * Enhanced file validation middleware
 * Provides comprehensive security checks for uploaded files
 */
class FileValidationService {
  constructor() {
    // Load dangerous file extensions from environment variable or use defaults
    const defaultDangerousExtensions = [
      '.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.vb',
      '.js', '.jse', '.ws', '.wsf', '.wsc', '.wsh', '.ps1', '.ps1xml',
      '.ps2', '.ps2xml', '.psc1', '.psc2', '.msh', '.msh1', '.msh2',
      '.mshxml', '.msh1xml', '.msh2xml', '.scf', '.lnk', '.inf',
      '.reg', '.doc', '.xls', '.ppt', '.docm', '.xlsm', '.pptm',
      '.jar', '.class', '.app', '.deb', '.pkg', '.dmg', '.msi',
      '.rpm', '.run', '.bin', '.elf', '.so', '.dylib'
    ];
    
    // Check if FILE_BLACKLIST environment variable is set
    const fileBlacklist = process.env.FILE_BLACKLIST;
    if (fileBlacklist && fileBlacklist.trim()) {
      // Parse comma-separated extensions from environment variable
      const blacklistedExtensions = fileBlacklist
        .split(',')
        .map(ext => ext.trim())
        .filter(ext => ext.length > 0)
        .map(ext => ext.startsWith('.') ? ext : '.' + ext); // Ensure extensions start with dot
      
      this.dangerousExtensions = new Set(blacklistedExtensions);
    } else {
      // Use default blacklist
      this.dangerousExtensions = new Set(defaultDangerousExtensions);
    }

    // Content validation removed - ClamAV handles malicious content detection
    // Normal file format headers (PE, ELF, etc.) are not malicious signatures

    // MIME type validation removed - unreliable for security purposes

    // Maximum file sizes by type (in bytes) - now using environment variables
    let defaultMaxSize;
    try {
      defaultMaxSize = parseFileSize(process.env.MAX_FILE_SIZE || '1GB');
      console.log('FileValidationService: Successfully parsed MAX_FILE_SIZE:', process.env.MAX_FILE_SIZE, '→', defaultMaxSize, 'bytes');
    } catch (error) {
      console.error('FileValidationService: Error parsing MAX_FILE_SIZE:', process.env.MAX_FILE_SIZE, error.message);
      defaultMaxSize = parseFileSize('1GB'); // Fallback
    }
    
    // Helper function to safely parse size with fallback
    const safeParseFileSize = (envVar, envVarName, fallback) => {
      try {
        if (envVar) {
          const size = parseFileSize(envVar);
          console.log(`FileValidationService: Successfully parsed ${envVarName}:`, envVar, '→', size, 'bytes');
          return size;
        }
        return parseFileSize(fallback);
      } catch (error) {
        console.error(`FileValidationService: Error parsing ${envVarName}:`, envVar, error.message, '- using fallback:', fallback);
        return parseFileSize(fallback);
      }
    };
    
    this.typeSizeLimits = {
      'image': safeParseFileSize(process.env.MAX_IMAGE_SIZE || process.env.MAX_FILE_SIZE, 'MAX_IMAGE_SIZE', '1GB'),
      'video': safeParseFileSize(process.env.MAX_VIDEO_SIZE || process.env.MAX_FILE_SIZE, 'MAX_VIDEO_SIZE', '1GB'),
      'audio': safeParseFileSize(process.env.MAX_AUDIO_SIZE || process.env.MAX_FILE_SIZE, 'MAX_AUDIO_SIZE', '1GB'),
      'document': safeParseFileSize(process.env.MAX_DOCUMENT_SIZE || process.env.MAX_FILE_SIZE, 'MAX_DOCUMENT_SIZE', '1GB'),
      'archive': safeParseFileSize(process.env.MAX_ARCHIVE_SIZE || process.env.MAX_FILE_SIZE, 'MAX_ARCHIVE_SIZE', '1GB'),
      'default': defaultMaxSize
    };
    
    console.log('FileValidationService: Initialized with type size limits:', this.typeSizeLimits);
  }

  /**
   * Validate file extension
   */
  validateExtension(filename) {
    const ext = path.extname(filename).toLowerCase();
    
    if (this.dangerousExtensions.has(ext)) {
      return {
        valid: false,
        reason: `File extension ${ext} is not allowed for security reasons`
      };
    }

    return { valid: true };
  }

  // MIME type validation removed - MIME types are unreliable for security
  // Extension blacklist and virus scanning provide better protection

  /**
   * Validate file size based on type
   */
  validateFileSize(size, mimeType) {
    let category = 'default';
    
    if (mimeType.startsWith('image/')) {
      category = 'image';
    } else if (mimeType.startsWith('video/')) {
      category = 'video';
    } else if (mimeType.startsWith('audio/')) {
      category = 'audio';
    } else if (mimeType.includes('zip') || mimeType.includes('compressed') || mimeType.includes('archive')) {
      category = 'archive';
    } else if (mimeType.includes('document') || mimeType.includes('pdf') || mimeType.includes('text')) {
      category = 'document';
    }

    const limit = this.typeSizeLimits[category];
    
    if (size > limit) {
      return {
        valid: false,
        reason: `File size ${this.formatBytes(size)} exceeds limit for ${category} files (${this.formatBytes(limit)})`
      };
    }

    return { valid: true };
  }

  // Content validation removed - ClamAV provides comprehensive malicious content detection
  // Normal file format headers (PE, ELF, Mach-O, etc.) are not malicious

  /**
   * Validate filename for directory traversal and other attacks
   */
  validateFilename(filename) {
    // Check for directory traversal attempts
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return {
        valid: false,
        reason: 'Filename contains invalid characters'
      };
    }

    // Check for extremely long filenames
    if (filename.length > 255) {
      return {
        valid: false,
        reason: 'Filename is too long (max 255 characters)'
      };
    }

    // Check for suspicious patterns
    const suspiciousPatterns = [
      /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i, // Windows reserved names
      /\s+$/, // Trailing whitespace
      /^\s+/, // Leading whitespace
      /[<>:"|?*\x00-\x1f]/, // Invalid characters
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(filename)) {
        return {
          valid: false,
          reason: 'Filename contains invalid or suspicious characters'
        };
      }
    }

    return { valid: true };
  }

  /**
   * Generate file hash for integrity checking
   */
  async generateFileHash(filePath) {
    try {
      const fileBuffer = await fs.readFile(filePath);
      const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
      return hash;
    } catch (error) {
      logger.error('File hash generation failed', {
        filePath,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Comprehensive file validation
   */
  async validateFile(file) {
    const results = {
      valid: true,
      warnings: [],
      errors: []
    };

    try {
      // 1. Validate filename
      const filenameValidation = this.validateFilename(file.originalname);
      if (!filenameValidation.valid) {
        results.valid = false;
        results.errors.push(filenameValidation.reason);
      }

      // 2. Validate extension
      const extensionValidation = this.validateExtension(file.originalname);
      if (!extensionValidation.valid) {
        results.valid = false;
        results.errors.push(extensionValidation.reason);
      }

      // 3. Validate MIME type
      const mimeValidation = this.validateMimeType(file.mimetype, file.originalname);
      if (!mimeValidation.valid) {
        results.valid = false;
        results.errors.push(mimeValidation.reason);
      }

      // 4. Validate file size
      const sizeValidation = this.validateFileSize(file.size, file.mimetype);
      if (!sizeValidation.valid) {
        results.valid = false;
        results.errors.push(sizeValidation.reason);
      }

      // 5. Validate file content (if file exists)
      if (file.path) {
        const contentValidation = await this.validateFileContent(file.path);
        if (!contentValidation.valid) {
          results.valid = false;
          results.errors.push(contentValidation.reason);
        }
      }

      // Log validation results
      if (!results.valid) {
        logger.warn('File validation failed', {
          filename: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          errors: results.errors
        });
      } else {
        logger.info('File validation passed', {
          filename: file.originalname,
          mimetype: file.mimetype,
          size: file.size
        });
      }

      return results;
    } catch (error) {
      logger.error('File validation error', {
        filename: file.originalname,
        error: error.message
      });
      
      return {
        valid: false,
        errors: ['File validation failed due to internal error'],
        warnings: []
      };
    }
  }

  /**
   * Format bytes for human readable output
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Express middleware for file validation
   */
  createValidationMiddleware() {
    return async (req, res, next) => {
      if (!req.files || req.files.length === 0) {
        return next();
      }

      const validationResults = [];
      
      // Validate each uploaded file
      for (const file of req.files) {
        const validation = await this.validateFile(file);
        validationResults.push({
          file: file.originalname,
          ...validation
        });
      }

      // Check if any files failed validation
      const failedFiles = validationResults.filter(result => !result.valid);
      
      if (failedFiles.length > 0) {
        // Clean up uploaded files that failed validation
        for (const file of req.files) {
          try {
            await fs.unlink(file.path);
          } catch (error) {
            logger.error('Failed to clean up invalid file', {
              path: file.path,
              error: error.message
            });
          }
        }

        return res.status(400).json({
          error: 'File validation failed',
          details: failedFiles.map(f => ({
            filename: f.file,
            errors: f.errors
          }))
        });
      }

      // Attach validation results to request for further processing
      req.fileValidation = validationResults;
      next();
    };
  }
}

module.exports = FileValidationService;