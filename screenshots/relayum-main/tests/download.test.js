const request = require('supertest');
const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const downloadRoutes = require('../routes/download');
const { dbUtils, authUtils } = require('./testUtils');

// Set test environment variables
process.env.STREAM_CHUNK_SIZE = '8192'; // Smaller chunks for testing
process.env.STREAM_BUFFER_SIZE = '16384';
process.env.MAX_DOWNLOAD_SIZE = '10485760'; // 10MB for testing

// Create test app
const app = express();
app.use(express.json());
app.use('/api/download', downloadRoutes);

describe('Download Routes with Streaming', () => {
  let testUser, testUser2;
  let authHeader, authHeader2;

  beforeEach(async () => {
    await dbUtils.cleanDatabase();
    await dbUtils.cleanupTestFiles();
    
    testUser = await dbUtils.createTestUser({
      username: 'downloaduser',
      email: 'download@example.com'
    });
    
    testUser2 = await dbUtils.createTestUser({
      username: 'downloaduser2', 
      email: 'download2@example.com'
    });
    
    authHeader = authUtils.getAuthHeader(testUser);
    authHeader2 = authUtils.getAuthHeader(testUser2);
  });

  afterEach(async () => {
    await dbUtils.cleanupTestFiles();
  });

  describe('GET /api/download/file/:fileId', () => {
    it('should stream download encrypted file successfully', async () => {
      // Create a test encrypted file
      const testContent = 'This is test content for streaming download. '.repeat(100); // ~4KB
      const encryptedFile = await dbUtils.createTestEncryptedFile(testUser.id, {
        filename: 'stream-test.txt',
        content: testContent,
        mimeType: 'text/plain'
      });

      const response = await request(app)
        .get(`/api/download/file/${encryptedFile.id}`)
        .set('Authorization', authHeader)
        .expect(200);

      expect(response.headers['content-disposition']).toContain('stream-test.txt');
      expect(response.headers['content-type']).toBe('text/plain');
      expect(response.headers['content-length']).toBe(testContent.length.toString());
      expect(response.text).toBe(testContent);
    });

    it('should stream download large encrypted file without memory issues', async () => {
      // Create a larger test file (~100KB)
      const largeContent = 'Large file content test line. '.repeat(3000);
      const encryptedFile = await dbUtils.createTestEncryptedFile(testUser.id, {
        filename: 'large-stream-test.txt',
        content: largeContent,
        mimeType: 'text/plain'
      });

      const startMemory = process.memoryUsage().heapUsed;
      
      const response = await request(app)
        .get(`/api/download/file/${encryptedFile.id}`)
        .set('Authorization', authHeader)
        .expect(200);

      const endMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = endMemory - startMemory;

      expect(response.headers['content-disposition']).toContain('large-stream-test.txt');
      expect(response.text).toBe(largeContent);
      
      // Memory increase should be reasonable (less than 1MB for streaming)
      expect(memoryIncrease).toBeLessThan(1024 * 1024);
    });

    it('should handle stream errors gracefully', async () => {
      // Create file with invalid file_id to trigger error
      const file = await dbUtils.createTestFile(testUser.id, {
        filename: 'invalid.txt',
        file_id: 'invalid-file-id',
        encrypted: true
      });

      const response = await request(app)
        .get(`/api/download/file/${file.id}`)
        .set('Authorization', authHeader)
        .expect(500);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('decryption failed');
    });

    it('should reject unauthorized access', async () => {
      const encryptedFile = await dbUtils.createTestEncryptedFile(testUser.id);

      // Try to access with different user
      const response = await request(app)
        .get(`/api/download/file/${encryptedFile.id}`)
        .set('Authorization', authHeader2)
        .expect(404);

      expect(response.body).toHaveProperty('error', 'File not found or access denied');
    });

    it('should fail without authentication', async () => {
      const encryptedFile = await dbUtils.createTestEncryptedFile(testUser.id);

      const response = await request(app)
        .get(`/api/download/file/${encryptedFile.id}`)
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Access token required');
    });

    it('should fail for non-existent file', async () => {
      const response = await request(app)
        .get('/api/download/file/999999')
        .set('Authorization', authHeader)
        .expect(404);

      expect(response.body).toHaveProperty('error', 'File not found or access denied');
    });
  });

  describe('Folder Downloads with Size Limits', () => {
    it('should create ZIP for folder download within size limits', async () => {
      // Create folder with small files
      const folder = await dbUtils.createTestFolder(testUser.id, { name: 'Test Folder' });
      
      const file1 = await dbUtils.createTestEncryptedFile(testUser.id, {
        filename: 'file1.txt',
        content: 'Small file 1',
        folder_id: folder.id
      });
      
      const file2 = await dbUtils.createTestEncryptedFile(testUser.id, {
        filename: 'file2.txt', 
        content: 'Small file 2',
        folder_id: folder.id
      });

      const response = await request(app)
        .get(`/api/download/folder/${folder.id}`)
        .set('Authorization', authHeader)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/zip');
      expect(response.headers['content-disposition']).toContain('Test Folder.zip');
    });

    it('should fail folder download when size exceeds limit', async () => {
      // Create folder with large content that exceeds MAX_DOWNLOAD_SIZE
      const folder = await dbUtils.createTestFolder(testUser.id, { name: 'Large Folder' });
      
      // Create a file larger than 10MB limit
      const largeContent = 'x'.repeat(11 * 1024 * 1024); // 11MB
      
      const largeFile = await dbUtils.createTestEncryptedFile(testUser.id, {
        filename: 'large.txt',
        content: largeContent,
        folder_id: folder.id
      });

      const response = await request(app)
        .get(`/api/download/folder/${folder.id}`)
        .set('Authorization', authHeader)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('too large to download');
    });
  });

  describe('Public Share Downloads', () => {
    it('should stream download file from public share', async () => {
      const testContent = 'Public share test content';
      const encryptedFile = await dbUtils.createTestEncryptedFile(testUser.id, {
        filename: 'public-test.txt',
        content: testContent
      });

      // Create public share
      const share = await dbUtils.createTestShare({
        file_id: encryptedFile.id,
        shared_by: testUser.id,
        public_token: 'test-public-token-' + Date.now()
      });

      const response = await request(app)
        .get(`/api/download/public/${share.public_token}`)
        .expect(200);

      expect(response.headers['content-disposition']).toContain('public-test.txt');
      expect(response.text).toBe(testContent);
    });

    it('should handle single file in folder share as direct download', async () => {
      const folder = await dbUtils.createTestFolder(testUser.id, { name: 'Single File Folder' });
      
      const testContent = 'Single file in folder content';
      const encryptedFile = await dbUtils.createTestEncryptedFile(testUser.id, {
        filename: 'single.txt',
        content: testContent,
        folder_id: folder.id
      });

      // Create public folder share
      const share = await dbUtils.createTestShare({
        folder_id: folder.id,
        shared_by: testUser.id,
        public_token: 'test-folder-token-' + Date.now()
      });

      const response = await request(app)
        .get(`/api/download/public/${share.public_token}`)
        .expect(200);

      // Should download directly, not as ZIP
      expect(response.headers['content-disposition']).toContain('single.txt');
      expect(response.headers['content-type']).toBe('text/plain');
      expect(response.text).toBe(testContent);
    });

    it('should fail for expired public share', async () => {
      const encryptedFile = await dbUtils.createTestEncryptedFile(testUser.id);

      // Create expired share
      const share = await dbUtils.createTestShare({
        file_id: encryptedFile.id,
        shared_by: testUser.id,
        public_token: 'expired-token',
        expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000) // Yesterday
      });

      const response = await request(app)
        .get('/api/download/public/expired-token')
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Share not found or expired');
    });

    it('should fail for non-existent public share', async () => {
      const response = await request(app)
        .get('/api/download/public/non-existent-token')
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Share not found or expired');
    });
  });

  describe('Password Protected Shares', () => {
    it('should check password requirements correctly', async () => {
      const encryptedFile = await dbUtils.createTestEncryptedFile(testUser.id);

      const share = await dbUtils.createTestShare({
        file_id: encryptedFile.id,
        shared_by: testUser.id,
        public_token: 'password-protected-token',
        share_password: 'secret123'
      });

      // Check without password
      const checkResponse = await request(app)
        .get(`/api/download/public/${share.public_token}/check`)
        .expect(200);

      expect(checkResponse.body).toHaveProperty('requires_password', true);
      expect(checkResponse.body).toHaveProperty('type', 'file');
    });

    it('should verify password correctly', async () => {
      const encryptedFile = await dbUtils.createTestEncryptedFile(testUser.id);

      const share = await dbUtils.createTestShare({
        file_id: encryptedFile.id,
        shared_by: testUser.id,
        public_token: 'password-verify-token',
        share_password: 'secret123'
      });

      // Verify correct password
      const verifyResponse = await request(app)
        .post(`/api/download/public/${share.public_token}/verify`)
        .send({ password: 'secret123' })
        .expect(200);

      expect(verifyResponse.body).toHaveProperty('verified', true);

      // Verify incorrect password
      const wrongPasswordResponse = await request(app)
        .post(`/api/download/public/${share.public_token}/verify`)
        .send({ password: 'wrong' })
        .expect(401);

      expect(wrongPasswordResponse.body).toHaveProperty('error', 'Invalid password');
    });

    it('should download with correct password in query', async () => {
      const testContent = 'Password protected content';
      const encryptedFile = await dbUtils.createTestEncryptedFile(testUser.id, {
        filename: 'protected.txt',
        content: testContent
      });

      const share = await dbUtils.createTestShare({
        file_id: encryptedFile.id,
        shared_by: testUser.id,
        public_token: 'password-download-token',
        share_password: 'secret123'
      });

      const response = await request(app)
        .get(`/api/download/public/${share.public_token}?password=secret123`)
        .expect(200);

      expect(response.text).toBe(testContent);
    });
  });

  describe('Performance and Memory Tests', () => {
    it('should handle concurrent downloads efficiently', async () => {
      const testContent = 'Concurrent download test content. '.repeat(500); // ~15KB
      const files = [];
      
      // Create multiple encrypted files
      for (let i = 0; i < 5; i++) {
        const file = await dbUtils.createTestEncryptedFile(testUser.id, {
          filename: `concurrent-${i}.txt`,
          content: testContent
        });
        files.push(file);
      }

      const startTime = Date.now();
      const startMemory = process.memoryUsage().heapUsed;

      // Download all files concurrently
      const downloadPromises = files.map(file => 
        request(app)
          .get(`/api/download/file/${file.id}`)
          .set('Authorization', authHeader)
          .expect(200)
      );

      const responses = await Promise.all(downloadPromises);
      
      const endTime = Date.now();
      const endMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = endMemory - startMemory;

      // All downloads should succeed
      responses.forEach((response, i) => {
        expect(response.headers['content-disposition']).toContain(`concurrent-${i}.txt`);
        expect(response.text).toBe(testContent);
      });

      // Memory usage should be reasonable even with concurrent downloads
      expect(memoryIncrease).toBeLessThan(5 * 1024 * 1024); // Less than 5MB

      // Performance should be reasonable
      expect(endTime - startTime).toBeLessThan(5000); // Less than 5 seconds
    });

    it('should verify hash integrity during streaming', async () => {
      const testContent = 'Hash integrity test content for streaming verification';
      const encryptedFile = await dbUtils.createTestEncryptedFile(testUser.id, {
        filename: 'hash-test.txt',
        content: testContent
      });

      const response = await request(app)
        .get(`/api/download/file/${encryptedFile.id}`)
        .set('Authorization', authHeader)
        .expect(200);

      // Verify content matches exactly
      expect(response.text).toBe(testContent);
      
      // Verify hash matches what was stored
      const downloadedHash = crypto.createHash('sha256').update(response.text).digest('hex');
      expect(downloadedHash).toBe(encryptedFile.file_hash);
    });
  });
});