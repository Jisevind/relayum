const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { logger } = require('../middleware/security');

/**
 * Quarantine Service for handling infected files
 */
class QuarantineService {
  constructor() {
    this.quarantineDir = process.env.QUARANTINE_PATH || path.join(process.cwd(), 'quarantine');
    this.initialized = false;
  }

  /**
   * Initialize the quarantine service
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Create quarantine directory if it doesn't exist
      await fs.mkdir(this.quarantineDir, { recursive: true });
      
      // Create subdirectories for organization
      await fs.mkdir(path.join(this.quarantineDir, 'infected'), { recursive: true });
      await fs.mkdir(path.join(this.quarantineDir, 'suspected'), { recursive: true });
      
      this.initialized = true;
      logger.info('Quarantine service initialized', { quarantineDir: this.quarantineDir });
    } catch (error) {
      logger.error('Failed to initialize quarantine service', { error: error.message });
      throw error;
    }
  }

  /**
   * Calculate file hash for integrity verification
   */
  async calculateFileHash(filePath) {
    try {
      const fileBuffer = await fs.readFile(filePath);
      const hash = crypto.createHash('sha256');
      hash.update(fileBuffer);
      return hash.digest('hex');
    } catch (error) {
      logger.error('Failed to calculate file hash', { filePath, error: error.message });
      throw error;
    }
  }

  /**
   * Generate unique quarantine filename
   */
  generateQuarantineFilename(originalFilename, threat) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const sanitizedThreat = threat.replace(/[^a-zA-Z0-9]/g, '_');
    const extension = path.extname(originalFilename);
    const basename = path.basename(originalFilename, extension);
    
    return `${timestamp}_${random}_${sanitizedThreat}_${basename}${extension}`;
  }

  /**
   * Quarantine an infected file
   */
  async quarantineFile(filePath, metadata) {
    await this.initialize();

    try {
      const {
        originalFilename,
        fileSize,
        mimeType,
        threat,
        uploaderId,
        scanResult
      } = metadata;

      // Calculate file hash for integrity
      const fileHash = await this.calculateFileHash(filePath);

      // Generate unique quarantine filename
      const quarantineFilename = this.generateQuarantineFilename(originalFilename, threat);
      const quarantinePath = path.join(this.quarantineDir, 'infected', quarantineFilename);

      // Move file to quarantine (copy + delete for cross-device compatibility)
      try {
        await fs.copyFile(filePath, quarantinePath);
        await fs.unlink(filePath);
      } catch (moveError) {
        // If copy succeeded but unlink failed, try to clean up the copy
        try {
          await fs.unlink(quarantinePath);
        } catch (cleanupError) {
          // Ignore cleanup errors
        }
        throw moveError;
      }

      // Record in database
      const db = require('../models/database');
      const quarantineRecord = await db.query(`
        INSERT INTO quarantine_files (
          original_filename, file_path, file_size, mime_type, threat_name, 
          uploader_id, quarantined_at, status, scan_details, file_hash
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8, $9)
        RETURNING id
      `, [
        originalFilename,
        quarantinePath,
        fileSize,
        mimeType,
        threat,
        uploaderId,
        'quarantined',
        JSON.stringify({
          scan_result: scanResult,
          quarantine_reason: 'virus_detected',
          original_path: filePath,
          quarantine_timestamp: new Date().toISOString()
        }),
        fileHash
      ]);

      const quarantineId = quarantineRecord.rows[0].id;

      logger.warn('File quarantined successfully', {
        quarantineId,
        originalFilename,
        threat,
        uploaderId,
        fileHash,
        quarantinePath
      });

      return {
        success: true,
        quarantineId,
        quarantinePath,
        fileHash,
        message: `File ${originalFilename} quarantined due to threat: ${threat}`
      };

    } catch (error) {
      logger.error('Failed to quarantine file', {
        filePath,
        error: error.message,
        stack: error.stack
      });

      // If quarantine fails, try to clean up the original file
      try {
        await fs.unlink(filePath);
        logger.info('Cleaned up original file after quarantine failure', { filePath });
      } catch (cleanupError) {
        logger.error('Failed to clean up file after quarantine failure', {
          filePath,
          error: cleanupError.message
        });
      }

      throw error;
    }
  }

  /**
   * Get quarantine file info
   */
  async getQuarantineFileInfo(quarantineId) {
    try {
      const db = require('../models/database');
      const result = await db.query(`
        SELECT q.*, u.username as uploader_username
        FROM quarantine_files q
        LEFT JOIN users u ON q.uploader_id = u.id
        WHERE q.id = $1
      `, [quarantineId]);

      if (result.rows.length === 0) {
        throw new Error('Quarantine file not found');
      }

      return result.rows[0];
    } catch (error) {
      logger.error('Failed to get quarantine file info', {
        quarantineId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Delete quarantine file (permanently)
   */
  async deleteQuarantineFile(quarantineId) {
    try {
      const fileInfo = await this.getQuarantineFileInfo(quarantineId);
      
      // Delete physical file
      try {
        await fs.unlink(fileInfo.file_path);
        logger.info('Quarantine file deleted from filesystem', {
          quarantineId,
          filePath: fileInfo.file_path
        });
      } catch (fsError) {
        logger.warn('Failed to delete quarantine file from filesystem', {
          quarantineId,
          filePath: fileInfo.file_path,
          error: fsError.message
        });
        // Continue with database deletion even if file doesn't exist
      }

      // Delete database record
      const db = require('../models/database');
      await db.query('DELETE FROM quarantine_files WHERE id = $1', [quarantineId]);

      logger.info('Quarantine file deleted completely', {
        quarantineId,
        originalFilename: fileInfo.original_filename
      });

      return {
        success: true,
        message: `Quarantine file ${fileInfo.original_filename} deleted permanently`
      };

    } catch (error) {
      logger.error('Failed to delete quarantine file', {
        quarantineId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Update quarantine file status
   */
  async updateQuarantineStatus(quarantineId, status, reviewerId, notes = null) {
    try {
      const db = require('../models/database');
      const result = await db.query(`
        UPDATE quarantine_files 
        SET status = $1, reviewed_by = $2, reviewed_at = NOW()
        WHERE id = $3
        RETURNING *
      `, [status, reviewerId, quarantineId]);

      if (result.rows.length === 0) {
        throw new Error('Quarantine file not found');
      }

      logger.info('Quarantine file status updated', {
        quarantineId,
        status,
        reviewerId,
        notes
      });

      return result.rows[0];
    } catch (error) {
      logger.error('Failed to update quarantine status', {
        quarantineId,
        status,
        reviewerId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get quarantine statistics
   */
  async getQuarantineStats() {
    try {
      const db = require('../models/database');
      const result = await db.query(`
        SELECT 
          status,
          COUNT(*) as count,
          SUM(file_size) as total_size
        FROM quarantine_files
        GROUP BY status
      `);

      const stats = {
        total: 0,
        by_status: {},
        total_size: 0
      };

      result.rows.forEach(row => {
        stats.by_status[row.status] = {
          count: parseInt(row.count),
          size: parseInt(row.total_size || 0)
        };
        stats.total += parseInt(row.count);
        stats.total_size += parseInt(row.total_size || 0);
      });

      return stats;
    } catch (error) {
      logger.error('Failed to get quarantine statistics', { error: error.message });
      throw error;
    }
  }

  /**
   * Cleanup old quarantine files based on retention policy
   */
  async cleanupOldFiles(retentionDays = 30) {
    try {
      const db = require('../models/database');
      
      // Get files to be cleaned up
      const filesToCleanup = await db.query(`
        SELECT id, file_path, original_filename
        FROM quarantine_files
        WHERE quarantined_at < NOW() - INTERVAL '${retentionDays} days'
        AND status IN ('confirmed_threat', 'deleted')
      `);

      let cleanedUp = 0;
      let errors = 0;

      for (const file of filesToCleanup.rows) {
        try {
          // Delete physical file
          await fs.unlink(file.file_path);
          
          // Delete database record
          await db.query('DELETE FROM quarantine_files WHERE id = $1', [file.id]);
          
          cleanedUp++;
          logger.info('Cleaned up old quarantine file', {
            id: file.id,
            filename: file.original_filename
          });
        } catch (cleanupError) {
          errors++;
          logger.error('Failed to cleanup quarantine file', {
            id: file.id,
            filename: file.original_filename,
            error: cleanupError.message
          });
        }
      }

      logger.info('Quarantine cleanup completed', {
        totalFiles: filesToCleanup.rows.length,
        cleanedUp,
        errors,
        retentionDays
      });

      return {
        success: true,
        totalFiles: filesToCleanup.rows.length,
        cleanedUp,
        errors
      };

    } catch (error) {
      logger.error('Failed to cleanup old quarantine files', { error: error.message });
      throw error;
    }
  }
}

// Create singleton instance
let quarantineInstance = null;

function getQuarantineService() {
  if (!quarantineInstance) {
    quarantineInstance = new QuarantineService();
  }
  return quarantineInstance;
}

module.exports = {
  QuarantineService,
  getQuarantineService
};