const db = require('../models/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Database utilities for tests
const dbUtils = {
  // Clean all test data
  async cleanDatabase() {
    await db.query('TRUNCATE TABLE shares RESTART IDENTITY CASCADE');
    await db.query('TRUNCATE TABLE files RESTART IDENTITY CASCADE');
    await db.query('TRUNCATE TABLE folders RESTART IDENTITY CASCADE');
    await db.query('TRUNCATE TABLE users RESTART IDENTITY CASCADE');
    await db.query('TRUNCATE TABLE admin_overrides RESTART IDENTITY CASCADE');
  },

  // Clean up test files and directories
  async cleanupTestFiles() {
    const fs = require('fs').promises;
    const path = require('path');
    
    try {
      const tempDir = path.join(__dirname, 'temp');
      await fs.rmdir(tempDir, { recursive: true });
    } catch (e) {
      // Directory might not exist, that's ok
    }
    
    try {
      const uploadsDir = path.join(__dirname, '..', 'uploads_tmp', 'users');
      const users = await fs.readdir(uploadsDir);
      
      for (const userDir of users) {
        const userPath = path.join(uploadsDir, userDir);
        await fs.rmdir(userPath, { recursive: true });
      }
    } catch (e) {
      // Uploads might not exist, that's ok
    }
  },

  // Create test user
  async createTestUser(userData = {}) {
    const timestamp = Date.now();
    const defaultUser = {
      username: `testuser_${timestamp}_${Math.random().toString(36).substr(2, 9)}`,
      email: `test_${timestamp}@example.com`,
      password: 'password123',
      role: 'user'
    };
    
    const user = { ...defaultUser, ...userData };
    const hashedPassword = await bcrypt.hash(user.password, 10);
    
    const result = await db.query(
      `INSERT INTO users (username, email, password_hash, role) 
       VALUES ($1, $2, $3, $4) RETURNING id, username, email, role`,
      [user.username, user.email, hashedPassword, user.role]
    );
    
    return result.rows[0];
  },

  // Create test admin user
  async createTestAdmin(userData = {}) {
    return this.createTestUser({ 
      username: 'admin',
      email: 'admin@example.com',
      role: 'admin',
      ...userData 
    });
  },

  // Create test folder
  async createTestFolder(userId, folderData = {}) {
    const defaultFolder = {
      name: 'Test Folder',
      parent_id: null
    };
    
    const folder = { ...defaultFolder, ...folderData };
    
    const result = await db.query(
      `INSERT INTO folders (name, parent_id, owner_id) 
       VALUES ($1, $2, $3) RETURNING *`,
      [folder.name, folder.parent_id, userId]
    );
    
    return result.rows[0];
  },

  // Create test file record (without actual file)
  async createTestFile(userId, fileData = {}) {
    const defaultFile = {
      filename: 'test.txt',
      filepath: '/test/path/test.txt',
      size: 1024,
      mime_type: 'text/plain',
      folder_id: null,
      encrypted: true,
      file_id: 'test-file-id-' + Math.random().toString(36).substr(2, 9),
      file_hash: 'sha256-test-hash-' + Math.random().toString(36).substr(2, 16)
    };
    
    const file = { ...defaultFile, ...fileData };
    
    const result = await db.query(
      `INSERT INTO files (filename, filepath, size, mime_type, folder_id, uploader_id, encrypted, file_id, file_hash) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [file.filename, file.filepath, file.size, file.mime_type, file.folder_id, userId, file.encrypted, file.file_id, file.file_hash]
    );
    
    return result.rows[0];
  },

  // Create test encrypted file with real encryption data
  async createTestEncryptedFile(userId, fileData = {}) {
    const StorageService = require('../utils/storageService');
    const fs = require('fs').promises;
    const path = require('path');
    const crypto = require('crypto');
    
    const storageService = new StorageService();
    await storageService.initializeStorage();
    
    // Create temporary test file
    const tempDir = path.join(__dirname, 'temp');
    await fs.mkdir(tempDir, { recursive: true });
    
    const testContent = fileData.content || 'Test file content for encryption';
    const tempFilePath = path.join(tempDir, `test-${Date.now()}.txt`);
    await fs.writeFile(tempFilePath, testContent);
    
    try {
      // Store the file using the storage service
      const storeResult = await storageService.storeFile(
        userId,
        tempFilePath,
        fileData.filename || 'test-encrypted.txt',
        fileData.mimeType || 'text/plain',
        Buffer.byteLength(testContent, 'utf8')
      );
      
      // Create database record
      const result = await db.query(
        `INSERT INTO files (filename, filepath, size, mime_type, folder_id, uploader_id, encrypted, file_id, file_hash) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [
          fileData.filename || 'test-encrypted.txt',
          storeResult.encryptedPath,
          storeResult.originalSize,
          fileData.mimeType || 'text/plain',
          fileData.folder_id || null,
          userId,
          true,
          storeResult.fileId,
          storeResult.hash
        ]
      );
      
      return {
        ...result.rows[0],
        originalContent: testContent
      };
    } finally {
      // Clean up temp file if it still exists
      try {
        await fs.unlink(tempFilePath);
      } catch (e) {
        // File might already be deleted by storage service
      }
    }
  },

  // Create test share
  async createTestShare(shareData = {}) {
    const defaultShare = {
      file_id: null,
      folder_id: null,
      shared_by: null,
      shared_with: null,
      public_token: null,
      expires_at: null,
      share_password: null
    };
    
    const share = { ...defaultShare, ...shareData };
    
    const result = await db.query(
      `INSERT INTO shares (file_id, folder_id, shared_by, shared_with, public_token, expires_at, share_password) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [share.file_id, share.folder_id, share.shared_by, share.shared_with, share.public_token, share.expires_at, share.share_password]
    );
    
    return result.rows[0];
  }
};

// Authentication utilities for tests
const authUtils = {
  // Generate JWT token for test user
  generateToken(user) {
    return jwt.sign(
      { 
        userId: user.id, 
        username: user.username, 
        role: user.role 
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  },

  // Get authorization header for test requests
  getAuthHeader(user) {
    const token = this.generateToken(user);
    return `Bearer ${token}`;
  }
};

module.exports = {
  dbUtils,
  authUtils
};