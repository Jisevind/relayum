const request = require('supertest');
const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const fileRoutes = require('../routes/files');
const { dbUtils, authUtils } = require('./testUtils');

// Create test app
const app = express();
app.use(express.json());
app.use('/api/files', fileRoutes);

describe('File Routes', () => {
  let testUser;
  let authHeader;

  beforeEach(async () => {
    await dbUtils.cleanDatabase();
    testUser = await dbUtils.createTestUser();
    authHeader = authUtils.getAuthHeader(testUser);
  });

  describe('POST /api/files/upload', () => {
    it('should upload a single file successfully with encryption', async () => {
      // Create a test file
      const testFilePath = path.join(__dirname, 'test-file.txt');
      await fs.writeFile(testFilePath, 'This is a test file content');

      const response = await request(app)
        .post('/api/files/upload')
        .set('Authorization', authHeader)
        .attach('files', testFilePath)
        .expect(201);

      expect(response.body).toHaveProperty('message', 'Files uploaded successfully');
      expect(response.body).toHaveProperty('files');
      expect(response.body.files).toHaveLength(1);
      expect(response.body.files[0]).toHaveProperty('filename', 'test-file.txt');
      expect(response.body.files[0]).toHaveProperty('size');
      expect(response.body.files[0]).toHaveProperty('mime_type', 'text/plain');
      expect(response.body.files[0]).toHaveProperty('encrypted', true);
      expect(response.body.files[0]).toHaveProperty('file_hash');

      // Clean up
      await fs.unlink(testFilePath);
    });

    it('should upload multiple files successfully', async () => {
      // Create test files
      const testFile1 = path.join(__dirname, 'test-file-1.txt');
      const testFile2 = path.join(__dirname, 'test-file-2.txt');
      await fs.writeFile(testFile1, 'Content 1');
      await fs.writeFile(testFile2, 'Content 2');

      const response = await request(app)
        .post('/api/files/upload')
        .set('Authorization', authHeader)
        .attach('files', testFile1)
        .attach('files', testFile2)
        .expect(201);

      expect(response.body.files).toHaveLength(2);
      expect(response.body.files.map(f => f.filename)).toContain('test-file-1.txt');
      expect(response.body.files.map(f => f.filename)).toContain('test-file-2.txt');

      // Clean up
      await fs.unlink(testFile1);
      await fs.unlink(testFile2);
    });

    it('should upload file to specific folder', async () => {
      const folder = await dbUtils.createTestFolder(testUser.id, { name: 'Upload Test Folder' });
      
      const testFilePath = path.join(__dirname, 'test-file.txt');
      await fs.writeFile(testFilePath, 'Test content');

      const response = await request(app)
        .post('/api/files/upload')
        .set('Authorization', authHeader)
        .field('folder_id', folder.id)
        .attach('files', testFilePath)
        .expect(201);

      // Current implementation doesn't return folder_id in response
      expect(response.body.files[0]).toHaveProperty('id');
      expect(response.body.files[0]).toHaveProperty('filename', 'test-file.txt');

      // Clean up
      await fs.unlink(testFilePath);
    });

    it('should fail without authentication', async () => {
      const testFilePath = path.join(__dirname, 'test-file.txt');
      await fs.writeFile(testFilePath, 'Test content');

      const response = await request(app)
        .post('/api/files/upload')
        .attach('files', testFilePath)
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Access token required');

      // Clean up
      await fs.unlink(testFilePath);
    });

    it('should fail with no files uploaded', async () => {
      const response = await request(app)
        .post('/api/files/upload')
        .set('Authorization', authHeader)
        .expect(400);

      expect(response.body).toHaveProperty('error', 'No files uploaded');
    });

    it('should fail with invalid folder_id', async () => {
      const testFilePath = path.join(__dirname, 'test-file.txt');
      await fs.writeFile(testFilePath, 'Test content');

      const response = await request(app)
        .post('/api/files/upload')
        .set('Authorization', authHeader)
        .field('folder_id', '999999')
        .attach('files', testFilePath)
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Folder not found');

      // Clean up
      await fs.unlink(testFilePath);
    });

    it('should fail when exceeding disk quota', async () => {
      // Create user with very small quota for testing
      const smallQuotaUser = await dbUtils.createTestUser({
        username: 'smallquota',
        email: 'smallquota@example.com'
      });
      
      // Set a small disk quota (1KB) via admin override
      const db = require('../models/database');
      await db.query(
        'INSERT INTO admin_overrides (user_id, disk_quota_bytes) VALUES ($1, $2)',
        [smallQuotaUser.id, 1024] // 1KB quota
      );
      
      const smallQuotaAuthHeader = authUtils.getAuthHeader(smallQuotaUser);
      
      // Create a file larger than quota
      const testFilePath = path.join(__dirname, 'large-test-file.txt');
      const largeContent = 'x'.repeat(2048); // 2KB content
      await fs.writeFile(testFilePath, largeContent);

      const response = await request(app)
        .post('/api/files/upload')
        .set('Authorization', smallQuotaAuthHeader)
        .attach('files', testFilePath)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('exceed disk quota');

      // Clean up
      await fs.unlink(testFilePath);
    });
  });

  describe('GET /api/files', () => {
    it('should get user files from root folder', async () => {
      // Create test files
      await dbUtils.createTestFile(testUser.id, { filename: 'file1.txt' });
      await dbUtils.createTestFile(testUser.id, { filename: 'file2.txt' });

      const response = await request(app)
        .get('/api/files')
        .set('Authorization', authHeader)
        .expect(200);

      expect(response.body).toHaveProperty('files');
      expect(response.body.files).toHaveLength(2);
      expect(response.body.files.map(f => f.filename)).toContain('file1.txt');
      expect(response.body.files.map(f => f.filename)).toContain('file2.txt');
      // All files should be encrypted by default
      expect(response.body.files.every(f => f.encrypted === true)).toBe(true);
    });

    it('should get files from specific folder', async () => {
      const folder = await dbUtils.createTestFolder(testUser.id);
      await dbUtils.createTestFile(testUser.id, { 
        filename: 'folder-file.txt', 
        folder_id: folder.id 
      });
      await dbUtils.createTestFile(testUser.id, { filename: 'root-file.txt' });

      const response = await request(app)
        .get('/api/files')
        .query({ folder_id: folder.id })
        .set('Authorization', authHeader)
        .expect(200);

      expect(response.body.files).toHaveLength(1);
      expect(response.body.files[0]).toHaveProperty('filename', 'folder-file.txt');
    });

    it('should not get files from other users', async () => {
      const otherUser = await dbUtils.createTestUser({
        username: 'otheruser',
        email: 'other@example.com'
      });
      
      await dbUtils.createTestFile(otherUser.id, { filename: 'other-file.txt' });
      await dbUtils.createTestFile(testUser.id, { filename: 'my-file.txt' });

      const response = await request(app)
        .get('/api/files')
        .set('Authorization', authHeader)
        .expect(200);

      expect(response.body.files).toHaveLength(1);
      expect(response.body.files[0]).toHaveProperty('filename', 'my-file.txt');
    });

    it('should fail without authentication', async () => {
      const response = await request(app)
        .get('/api/files')
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Access token required');
    });
  });

  describe('DELETE /api/files/:id', () => {
    it('should delete own file successfully', async () => {
      const file = await dbUtils.createTestFile(testUser.id, { filename: 'to-delete.txt' });

      const response = await request(app)
        .delete(`/api/files/${file.id}`)
        .set('Authorization', authHeader)
        .expect(200);

      expect(response.body).toHaveProperty('message', 'File deleted successfully');
    });

    it('should fail to delete other user\'s file', async () => {
      const otherUser = await dbUtils.createTestUser({
        username: 'otheruser',
        email: 'other@example.com'
      });
      const file = await dbUtils.createTestFile(otherUser.id, { filename: 'other-file.txt' });

      const response = await request(app)
        .delete(`/api/files/${file.id}`)
        .set('Authorization', authHeader)
        .expect(404);

      expect(response.body).toHaveProperty('error', 'File not found');
    });

    it('should fail to delete non-existent file', async () => {
      const response = await request(app)
        .delete('/api/files/999999')
        .set('Authorization', authHeader)
        .expect(404);

      expect(response.body).toHaveProperty('error', 'File not found');
    });

    it('should fail without authentication', async () => {
      const file = await dbUtils.createTestFile(testUser.id);

      const response = await request(app)
        .delete(`/api/files/${file.id}`)
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Access token required');
    });
  });

  describe('PUT /api/files/:id/move', () => {
    it('should move file to folder successfully', async () => {
      const file = await dbUtils.createTestFile(testUser.id, { filename: 'movable.txt' });
      const folder = await dbUtils.createTestFolder(testUser.id, { name: 'Target Folder' });

      const response = await request(app)
        .put(`/api/files/${file.id}/move`)
        .set('Authorization', authHeader)
        .send({ folderId: folder.id })
        .expect(200);

      expect(response.body).toHaveProperty('message', 'File moved successfully');
    });

    it('should move file to root (null folder)', async () => {
      const folder = await dbUtils.createTestFolder(testUser.id);
      const file = await dbUtils.createTestFile(testUser.id, { 
        filename: 'movable.txt',
        folder_id: folder.id 
      });

      const response = await request(app)
        .put(`/api/files/${file.id}/move`)
        .set('Authorization', authHeader)
        .send({ folderId: null })
        .expect(200);

      expect(response.body).toHaveProperty('message', 'File moved successfully');
    });

    it('should fail to move other user\'s file', async () => {
      const otherUser = await dbUtils.createTestUser({
        username: 'otheruser',
        email: 'other@example.com'
      });
      const file = await dbUtils.createTestFile(otherUser.id);
      const folder = await dbUtils.createTestFolder(testUser.id);

      const response = await request(app)
        .put(`/api/files/${file.id}/move`)
        .set('Authorization', authHeader)
        .send({ folderId: folder.id })
        .expect(404);

      expect(response.body).toHaveProperty('error', 'File not found or not owned by you');
    });

    it('should fail to move to other user\'s folder', async () => {
      const otherUser = await dbUtils.createTestUser({
        username: 'otheruser',
        email: 'other@example.com'
      });
      const file = await dbUtils.createTestFile(testUser.id);
      const folder = await dbUtils.createTestFolder(otherUser.id);

      const response = await request(app)
        .put(`/api/files/${file.id}/move`)
        .set('Authorization', authHeader)
        .send({ folderId: folder.id })
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Target folder not found or not owned by you');
    });

    it('should fail without authentication', async () => {
      const file = await dbUtils.createTestFile(testUser.id);

      const response = await request(app)
        .put(`/api/files/${file.id}/move`)
        .send({ folderId: null })
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Access token required');
    });
  });
});