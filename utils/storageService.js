const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const EncryptionService = require('./encryptionService');

/**
 * Storage Service for Relayum
 * Manages per-user encrypted storage with secure directory isolation
 */
class StorageService {
  constructor() {
    this.encryptionService = new EncryptionService();
    this.baseUploadPath = process.env.UPLOAD_PATH || './uploads';
    this.usersPath = path.join(this.baseUploadPath, 'users');
    this.sharedPath = path.join(this.baseUploadPath, 'shared');
    this.tempPath = path.join(this.baseUploadPath, 'temp');
  }

  /**
   * Initialize storage directories
   * @returns {Promise<void>}
   */
  async initializeStorage() {
    await fs.mkdir(this.usersPath, { recursive: true });
    await fs.mkdir(this.sharedPath, { recursive: true });
    await fs.mkdir(this.tempPath, { recursive: true });
  }

  /**
   * Generate a secure hash for user directory
   * @param {number} userId - User ID
   * @returns {string} - Hashed user directory name
   */
  generateUserHash(userId) {
    return crypto.createHash('sha256').update(`user:${userId}`).digest('hex');
  }

  /**
   * Get user's storage directory path
   * @param {number} userId - User ID
   * @returns {string} - User storage directory path
   */
  getUserStoragePath(userId) {
    const userHash = this.generateUserHash(userId);
    return path.join(this.usersPath, userHash);
  }

  /**
   * Get user's files directory path
   * @param {number} userId - User ID
   * @returns {string} - User files directory path
   */
  getUserFilesPath(userId) {
    return path.join(this.getUserStoragePath(userId), 'files');
  }

  /**
   * Get user's metadata directory path
   * @param {number} userId - User ID
   * @returns {string} - User metadata directory path
   */
  getUserMetadataPath(userId) {
    return path.join(this.getUserStoragePath(userId), 'metadata');
  }

  /**
   * Initialize user storage directories
   * @param {number} userId - User ID
   * @returns {Promise<void>}
   */
  async initializeUserStorage(userId) {
    const userPath = this.getUserStoragePath(userId);
    const filesPath = this.getUserFilesPath(userId);
    const metadataPath = this.getUserMetadataPath(userId);

    await fs.mkdir(userPath, { recursive: true });
    await fs.mkdir(filesPath, { recursive: true });
    await fs.mkdir(metadataPath, { recursive: true });

    // Set restrictive permissions (owner read/write only) - skip in Docker
    try {
      if (process.env.NODE_ENV !== 'production') {
        await fs.chmod(userPath, 0o700);
        await fs.chmod(filesPath, 0o700);
        await fs.chmod(metadataPath, 0o700);
      }
    } catch (error) {
      // Silently ignore permission errors in Docker/production
    }
  }

  /**
   * Store encrypted file for user (always encrypted with system-generated keys)
   * @param {number} userId - User ID
   * @param {string} sourcePath - Path to source file
   * @param {string} originalName - Original filename
   * @param {string} mimeType - File MIME type
   * @param {number} originalSize - Original file size
   * @returns {Promise<Object>} - Storage metadata
   */
  async storeFile(userId, sourcePath, originalName, mimeType, originalSize) {
    try {
      // Initialize user storage if needed
      await this.initializeUserStorage(userId);

      // Generate file ID and paths
      const fileId = this.encryptionService.generateFileId(originalName, userId);
      const filesPath = this.getUserFilesPath(userId);
      const metadataPath = this.getUserMetadataPath(userId);
      const encryptedFilePath = path.join(filesPath, `${fileId}.enc`);
      const metadataFilePath = path.join(metadataPath, `${fileId}.meta`);

      // Generate system encryption keys (no user password needed)
      const masterKey = crypto.randomBytes(32); // 256-bit random key
      const salt = crypto.randomBytes(32); // Random salt for storage
      const fileKey = this.encryptionService.deriveFileKey(masterKey, fileId);

      // Skip validation for system-generated keys (they're always secure)
      // System-generated random keys don't need validation

      // Encrypt and store file using streaming for better memory efficiency
      const encryptionResult = await this.encryptionService.encryptFileStream(
        sourcePath, 
        encryptedFilePath, 
        fileKey
      );

      // Create metadata object with encryption keys
      const metadata = {
        fileId,
        originalName,
        mimeType,
        originalSize,
        encryptedSize: encryptionResult.size,
        iv: encryptionResult.iv,
        tag: encryptionResult.tag,
        hash: encryptionResult.hash,
        masterKey: masterKey.toString('hex'), // Store the key for system access
        uploadedAt: new Date().toISOString(),
        version: '1.0'
      };

      // Store metadata as JSON (no need to encrypt since files are on isolated system)
      await fs.writeFile(metadataFilePath, JSON.stringify(metadata, null, 2), 'utf8');

      // Clean up source file
      try {
        await fs.unlink(sourcePath);
      } catch (error) {
        // File might already be deleted, that's ok
        if (error.code !== 'ENOENT') {
          console.warn('Could not delete source file:', error.message);
        }
      }

      return {
        fileId,
        encryptedPath: encryptedFilePath,
        metadataPath: metadataFilePath,
        originalSize,
        encryptedSize: encryptionResult.size,
        hash: encryptionResult.hash
      };
    } catch (error) {
      throw new Error(`File storage failed: ${error.message}`);
    }
  }

  /**
   * Retrieve and decrypt file for user
   * @param {number} userId - User ID
   * @param {string} fileId - File identifier
   * @returns {Promise<Buffer>} - Decrypted file data
   */
  async retrieveFile(userId, fileId) {
    try {
      const filesPath = this.getUserFilesPath(userId);
      const metadataPath = this.getUserMetadataPath(userId);
      const encryptedFilePath = path.join(filesPath, `${fileId}.enc`);
      const metadataFilePath = path.join(metadataPath, `${fileId}.meta`);

      // Check if files exist
      try {
        await fs.access(encryptedFilePath);
        await fs.access(metadataFilePath);
      } catch (error) {
        throw new Error('File not found');
      }

      // Read metadata file (plain JSON with encryption keys)
      const metadataContent = await fs.readFile(metadataFilePath, 'utf8');
      const metadata = JSON.parse(metadataContent);
      
      // Get master key from metadata
      const masterKey = Buffer.from(metadata.masterKey, 'hex');
      
      // Derive file key and decrypt
      const fileKey = this.encryptionService.deriveFileKey(masterKey, fileId);
      const decryptedData = await this.encryptionService.decryptFile(encryptedFilePath, fileKey);

      return {
        data: decryptedData,
        metadata: {
          originalName: metadata.originalName,
          mimeType: metadata.mimeType,
          originalSize: metadata.originalSize,
          hash: metadata.hash
        }
      };
    } catch (error) {
      throw new Error(`File retrieval failed: ${error.message}`);
    }
  }

  /**
   * Retrieve file as a stream for memory-efficient downloads
   * @param {number} userId - User ID
   * @param {string} fileId - File identifier
   * @returns {Promise<Object>} - {stream: ReadableStream, metadata: Object}
   */
  async retrieveFileStream(userId, fileId) {
    try {
      const filesPath = this.getUserFilesPath(userId);
      const metadataPath = this.getUserMetadataPath(userId);
      const encryptedFilePath = path.join(filesPath, `${fileId}.enc`);
      const metadataFilePath = path.join(metadataPath, `${fileId}.meta`);

      // Check if files exist
      try {
        await fs.access(encryptedFilePath);
        await fs.access(metadataFilePath);
      } catch (error) {
        throw new Error('File not found');
      }

      // Read metadata file (plain JSON with encryption keys)
      const metadataContent = await fs.readFile(metadataFilePath, 'utf8');
      const metadata = JSON.parse(metadataContent);
      
      // Get master key from metadata
      const masterKey = Buffer.from(metadata.masterKey, 'hex');
      
      // Derive file key and create streaming decryption
      const fileKey = this.encryptionService.deriveFileKey(masterKey, fileId);
      const streamResult = await this.encryptionService.decryptFileStream(encryptedFilePath, fileKey);

      return {
        stream: streamResult.stream,
        metadata: {
          originalName: metadata.originalName,
          mimeType: metadata.mimeType,
          originalSize: metadata.originalSize,
          hash: metadata.hash,
          verified: streamResult.metadata.verified
        }
      };
    } catch (error) {
      throw new Error(`File streaming failed: ${error.message}`);
    }
  }

  /**
   * Get file metadata without loading file content
   * @param {number} userId - User ID
   * @param {string} fileId - File identifier
   * @returns {Promise<Object>} - File metadata
   */
  async getFileMetadata(userId, fileId) {
    try {
      const metadataPath = this.getUserMetadataPath(userId);
      const metadataFilePath = path.join(metadataPath, `${fileId}.meta`);

      // Check if metadata file exists
      try {
        await fs.access(metadataFilePath);
      } catch (error) {
        throw new Error('File not found');
      }

      // Read metadata file
      const metadataContent = await fs.readFile(metadataFilePath, 'utf8');
      const metadata = JSON.parse(metadataContent);

      return {
        originalName: metadata.originalName,
        mimeType: metadata.mimeType,
        originalSize: metadata.originalSize,
        hash: metadata.hash,
        uploadedAt: metadata.uploadedAt,
        version: metadata.version
      };
    } catch (error) {
      throw new Error(`Failed to get file metadata: ${error.message}`);
    }
  }

  /**
   * Delete encrypted file and metadata
   * @param {number} userId - User ID
   * @param {string} fileId - File identifier
   * @returns {Promise<void>}
   */
  async deleteFile(userId, fileId) {
    try {
      const filesPath = this.getUserFilesPath(userId);
      const metadataPath = this.getUserMetadataPath(userId);
      const encryptedFilePath = path.join(filesPath, `${fileId}.enc`);
      const metadataFilePath = path.join(metadataPath, `${fileId}.meta`);

      // Securely delete files
      await Promise.all([
        this.encryptionService.secureDelete(encryptedFilePath),
        this.encryptionService.secureDelete(metadataFilePath)
      ]);
    } catch (error) {
      throw new Error(`File deletion failed: ${error.message}`);
    }
  }

  /**
   * Check if user has storage initialized
   * @param {number} userId - User ID
   * @returns {Promise<boolean>} - True if storage exists
   */
  async userStorageExists(userId) {
    try {
      const userPath = this.getUserStoragePath(userId);
      await fs.access(userPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get storage statistics for user
   * @param {number} userId - User ID
   * @returns {Promise<Object>} - Storage statistics
   */
  async getUserStorageStats(userId) {
    try {
      const filesPath = this.getUserFilesPath(userId);
      const metadataPath = this.getUserMetadataPath(userId);

      // Check if storage exists
      if (!await this.userStorageExists(userId)) {
        return {
          totalFiles: 0,
          totalSize: 0,
          encryptedSize: 0
        };
      }

      // Count files and calculate sizes
      const filesList = await fs.readdir(filesPath);
      const encryptedFiles = filesList.filter(file => file.endsWith('.enc'));

      let totalEncryptedSize = 0;
      for (const file of encryptedFiles) {
        try {
          const stats = await fs.stat(path.join(filesPath, file));
          totalEncryptedSize += stats.size;
        } catch (error) {
          console.warn(`Could not stat file ${file}:`, error.message);
        }
      }

      return {
        totalFiles: encryptedFiles.length,
        totalSize: 0, // Would need to decrypt metadata to get original sizes
        encryptedSize: totalEncryptedSize
      };
    } catch (error) {
      throw new Error(`Could not get storage stats: ${error.message}`);
    }
  }

  /**
   * Migrate plain text file to encrypted storage
   * @param {number} userId - User ID
   * @param {string} plainFilePath - Path to plain text file
   * @param {Object} fileMetadata - File metadata {originalName, mimeType, size}
   * @returns {Promise<Object>} - Migration result
   */
  async migratePlainFile(userId, plainFilePath, fileMetadata) {
    try {
      // Store the plain file as encrypted
      const result = await this.storeFile(
        userId,
        plainFilePath,
        fileMetadata.originalName,
        fileMetadata.mimeType,
        fileMetadata.size
      );

      return {
        success: true,
        fileId: result.fileId,
        originalSize: result.originalSize,
        encryptedSize: result.encryptedSize
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create a temporary file for processing
   * @param {string} prefix - Filename prefix
   * @returns {Promise<string>} - Temporary file path
   */
  async createTempFile(prefix = 'temp') {
    const tempFileName = `${prefix}-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
    const tempFilePath = path.join(this.tempPath, tempFileName);
    
    // Ensure temp directory exists
    await fs.mkdir(this.tempPath, { recursive: true });
    
    return tempFilePath;
  }

  /**
   * Clean up temporary files older than specified age
   * @param {number} maxAgeMs - Maximum age in milliseconds (default: 1 hour)
   * @returns {Promise<number>} - Number of files cleaned up
   */
  async cleanupTempFiles(maxAgeMs = 60 * 60 * 1000) {
    try {
      const tempFiles = await fs.readdir(this.tempPath);
      let cleanedCount = 0;
      const cutoffTime = Date.now() - maxAgeMs;

      for (const file of tempFiles) {
        try {
          const filePath = path.join(this.tempPath, file);
          const stats = await fs.stat(filePath);
          
          if (stats.mtime.getTime() < cutoffTime) {
            await this.encryptionService.secureDelete(filePath);
            cleanedCount++;
          }
        } catch (error) {
          console.warn(`Could not clean temp file ${file}:`, error.message);
        }
      }

      return cleanedCount;
    } catch (error) {
      console.warn('Temp file cleanup failed:', error.message);
      return 0;
    }
  }

  /**
   * Validate storage integrity for user
   * @param {number} userId - User ID
   * @returns {Promise<Object>} - Validation results
   */
  async validateUserStorage(userId) {
    try {
      const filesPath = this.getUserFilesPath(userId);
      const metadataPath = this.getUserMetadataPath(userId);
      
      if (!await this.userStorageExists(userId)) {
        return { valid: true, files: [], errors: [] };
      }

      const filesList = await fs.readdir(filesPath);
      const encryptedFiles = filesList.filter(file => file.endsWith('.enc'));
      
      const results = {
        valid: true,
        files: [],
        errors: []
      };

      for (const file of encryptedFiles) {
        const fileId = path.basename(file, '.enc');
        try {
          // Try to retrieve file metadata
          const metadataFilePath = path.join(metadataPath, `${fileId}.meta`);
          await fs.access(metadataFilePath);
          
          // Try to read and validate metadata
          const metadataContent = await fs.readFile(metadataFilePath, 'utf8');
          const metadata = JSON.parse(metadataContent);
          
          // Validate metadata has required fields
          if (!metadata.masterKey || !metadata.originalName || !metadata.fileId) {
            throw new Error('Invalid metadata structure');
          }
          
          results.files.push({
            fileId,
            status: 'valid',
            originalName: metadata.originalName,
            size: metadata.originalSize
          });
        } catch (error) {
          results.valid = false;
          results.errors.push({
            fileId,
            error: error.message
          });
        }
      }

      return results;
    } catch (error) {
      return {
        valid: false,
        files: [],
        errors: [{ general: error.message }]
      };
    }
  }
}

module.exports = StorageService;