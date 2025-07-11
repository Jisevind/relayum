const request = require('supertest');
const express = require('express');
const sharesRoutes = require('../routes/shares');
const { dbUtils, authUtils } = require('./testUtils');

// Create test app
const app = express();
app.use(express.json());
app.use('/api/shares', sharesRoutes);

describe('Shares Routes', () => {
  let testUser, testUser2, testUser3, adminUser;
  let authHeader, authHeader2, authHeader3, adminAuthHeader;

  beforeEach(async () => {
    await dbUtils.cleanDatabase();
    
    testUser = await dbUtils.createTestUser({
      username: 'testuser',
      email: 'test@example.com'
    });
    
    testUser2 = await dbUtils.createTestUser({
      username: 'testuser2',
      email: 'test2@example.com'
    });
    
    testUser3 = await dbUtils.createTestUser({
      username: 'testuser3',
      email: 'test3@example.com'
    });
    
    adminUser = await dbUtils.createTestUser({
      username: 'admin',
      email: 'admin@example.com',
      role: 'admin'
    });
    
    authHeader = authUtils.getAuthHeader(testUser);
    authHeader2 = authUtils.getAuthHeader(testUser2);
    authHeader3 = authUtils.getAuthHeader(testUser3);
    adminAuthHeader = authUtils.getAuthHeader(adminUser);
  });

  describe('POST /api/shares', () => {
    it('should create a file share successfully', async () => {
      const file = await dbUtils.createTestFile(testUser.id);

      const response = await request(app)
        .post('/api/shares')
        .set('Authorization', authHeader)
        .send({
          fileId: file.id,
          sharedWith: testUser2.id,
          isPublic: false
        })
        .expect(201);

      expect(response.body).toHaveProperty('message', 'Share created successfully');
      expect(response.body).toHaveProperty('share');
      expect(response.body.share).toHaveProperty('file_id', file.id);
      expect(response.body.share).toHaveProperty('shared_with', testUser2.id);
      expect(response.body.share).toHaveProperty('public_token', null);
    });

    it('should create a folder share successfully', async () => {
      const folder = await dbUtils.createTestFolder(testUser.id);

      const response = await request(app)
        .post('/api/shares')
        .set('Authorization', authHeader)
        .send({
          folderId: folder.id,
          sharedWith: testUser2.id,
          isPublic: false
        })
        .expect(201);

      expect(response.body).toHaveProperty('message', 'Share created successfully');
      expect(response.body.share).toHaveProperty('folder_id', folder.id);
      expect(response.body.share).toHaveProperty('shared_with', testUser2.id);
    });

    it('should create a public share successfully', async () => {
      const file = await dbUtils.createTestFile(testUser.id);

      const response = await request(app)
        .post('/api/shares')
        .set('Authorization', authHeader)
        .send({
          fileId: file.id,
          isPublic: true
        })
        .expect(201);

      expect(response.body.share).toHaveProperty('file_id', file.id);
      expect(response.body.share).toHaveProperty('shared_with', null);
      expect(response.body.share).toHaveProperty('public_token');
      expect(response.body.share.public_token).toBeDefined();
    });

    it('should create a password-protected public share successfully', async () => {
      const file = await dbUtils.createTestFile(testUser.id);

      const response = await request(app)
        .post('/api/shares')
        .set('Authorization', authHeader)
        .send({
          fileId: file.id,
          isPublic: true,
          password: 'secret123'
        })
        .expect(201);

      expect(response.body.share).toHaveProperty('file_id', file.id);
      expect(response.body.share).toHaveProperty('public_token');
      // Password should not be returned in response
      expect(response.body.share).not.toHaveProperty('share_password');
      expect(response.body.share).not.toHaveProperty('password');
    });

    it('should fail without file or folder ID', async () => {
      const response = await request(app)
        .post('/api/shares')
        .set('Authorization', authHeader)
        .send({
          sharedWith: testUser2.id,
          isPublic: false
        })
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Either File ID or Folder ID is required');
    });

    it('should fail with both file and folder ID', async () => {
      const file = await dbUtils.createTestFile(testUser.id);
      const folder = await dbUtils.createTestFolder(testUser.id);

      const response = await request(app)
        .post('/api/shares')
        .set('Authorization', authHeader)
        .send({
          fileId: file.id,
          folderId: folder.id,
          sharedWith: testUser2.id,
          isPublic: false
        })
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Cannot share both file and folder in the same request');
    });

    it('should fail to share other user\'s file', async () => {
      const file = await dbUtils.createTestFile(testUser2.id);

      const response = await request(app)
        .post('/api/shares')
        .set('Authorization', authHeader)
        .send({
          fileId: file.id,
          sharedWith: testUser2.id,
          isPublic: false
        })
        .expect(404);

      expect(response.body).toHaveProperty('error', 'File not found or not owned by you');
    });

    it('should fail to share with non-existent user', async () => {
      const file = await dbUtils.createTestFile(testUser.id);

      const response = await request(app)
        .post('/api/shares')
        .set('Authorization', authHeader)
        .send({
          fileId: file.id,
          sharedWith: 999999,
          isPublic: false
        })
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Recipient user not found');
    });

    it('should fail without authentication', async () => {
      const file = await dbUtils.createTestFile(testUser.id);

      const response = await request(app)
        .post('/api/shares')
        .send({
          fileId: file.id,
          sharedWith: testUser2.id,
          isPublic: false
        })
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Access token required');
    });
  });

  describe('GET /api/shares/sent', () => {
    it('should get sent shares', async () => {
      const file = await dbUtils.createTestFile(testUser.id);
      const folder = await dbUtils.createTestFolder(testUser.id);
      
      await dbUtils.createTestShare({
        file_id: file.id,
        shared_by: testUser.id,
        shared_with: testUser2.id
      });
      
      await dbUtils.createTestShare({
        folder_id: folder.id,
        shared_by: testUser.id,
        shared_with: testUser2.id
      });

      const response = await request(app)
        .get('/api/shares/sent')
        .set('Authorization', authHeader)
        .expect(200);

      expect(response.body).toHaveProperty('shares');
      expect(response.body.shares).toHaveLength(2);
      expect(response.body.shares[0]).toHaveProperty('shared_with_username', 'testuser2');
    });

    it('should return empty array when no shares sent', async () => {
      const response = await request(app)
        .get('/api/shares/sent')
        .set('Authorization', authHeader)
        .expect(200);

      expect(response.body).toHaveProperty('shares');
      expect(response.body.shares).toHaveLength(0);
    });

    it('should fail without authentication', async () => {
      const response = await request(app)
        .get('/api/shares/sent')
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Access token required');
    });
  });

  describe('GET /api/shares/received', () => {
    it('should get received shares', async () => {
      const file = await dbUtils.createTestFile(testUser2.id);
      
      await dbUtils.createTestShare({
        file_id: file.id,
        shared_by: testUser2.id,
        shared_with: testUser.id
      });

      const response = await request(app)
        .get('/api/shares/received')
        .set('Authorization', authHeader)
        .expect(200);

      expect(response.body).toHaveProperty('shares');
      expect(response.body.shares).toHaveLength(1);
      expect(response.body.shares[0]).toHaveProperty('shared_by_username', 'testuser2');
    });

    it('should return empty array when no shares received', async () => {
      const response = await request(app)
        .get('/api/shares/received')
        .set('Authorization', authHeader)
        .expect(200);

      expect(response.body).toHaveProperty('shares');
      expect(response.body.shares).toHaveLength(0);
    });
  });

  describe('GET /api/shares/all', () => {
    it('should get all shares for admin user', async () => {
      const file = await dbUtils.createTestFile(testUser.id);
      
      await dbUtils.createTestShare({
        file_id: file.id,
        shared_by: testUser.id,
        shared_with: testUser2.id
      });

      const response = await request(app)
        .get('/api/shares/all')
        .set('Authorization', adminAuthHeader)
        .expect(200);

      expect(response.body).toHaveProperty('shares');
      expect(response.body.shares).toHaveLength(1);
    });

    it('should fail for non-admin user', async () => {
      const response = await request(app)
        .get('/api/shares/all')
        .set('Authorization', authHeader)
        .expect(403);

      expect(response.body).toHaveProperty('error', 'Admin access required');
    });
  });

  describe('GET /api/shares/public/:token', () => {
    it('should get public share by token', async () => {
      const file = await dbUtils.createTestFile(testUser.id);
      const share = await dbUtils.createTestShare({
        file_id: file.id,
        shared_by: testUser.id,
        public_token: 'test-public-token'
      });

      const response = await request(app)
        .get('/api/shares/public/test-public-token')
        .expect(200);

      expect(response.body).toHaveProperty('share');
      expect(response.body.share).toHaveProperty('file_id', file.id);
      expect(response.body.share).not.toHaveProperty('filepath'); // Should not expose file path
    });

    it('should fail with invalid token', async () => {
      const response = await request(app)
        .get('/api/shares/public/invalid-token')
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Share not found or expired');
    });
  });

  describe('DELETE /api/shares/:id', () => {
    it('should delete own share successfully', async () => {
      const file = await dbUtils.createTestFile(testUser.id);
      const share = await dbUtils.createTestShare({
        file_id: file.id,
        shared_by: testUser.id,
        shared_with: testUser2.id
      });

      const response = await request(app)
        .delete(`/api/shares/${share.id}`)
        .set('Authorization', authHeader)
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Share deleted successfully');
    });

    it('should fail to delete other user\'s share', async () => {
      const file = await dbUtils.createTestFile(testUser2.id);
      const share = await dbUtils.createTestShare({
        file_id: file.id,
        shared_by: testUser2.id,
        shared_with: testUser.id
      });

      const response = await request(app)
        .delete(`/api/shares/${share.id}`)
        .set('Authorization', authHeader)
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Share not found or not owned by you');
    });

    it('should fail to delete non-existent share', async () => {
      const response = await request(app)
        .delete('/api/shares/999999')
        .set('Authorization', authHeader)
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Share not found or not owned by you');
    });
  });

  describe('GET /api/shares/:shareId/contents', () => {
    it('should get shared folder contents', async () => {
      const folder = await dbUtils.createTestFolder(testUser.id, { name: 'Shared Folder' });
      const file = await dbUtils.createTestFile(testUser.id, { folder_id: folder.id });
      
      const share = await dbUtils.createTestShare({
        folder_id: folder.id,
        shared_by: testUser.id,
        shared_with: testUser2.id
      });

      const response = await request(app)
        .get(`/api/shares/${share.id}/contents`)
        .set('Authorization', authHeader2)
        .expect(200);

      expect(response.body).toHaveProperty('share');
      expect(response.body).toHaveProperty('files');
      expect(response.body.files).toHaveLength(1);
      expect(response.body.files[0]).toHaveProperty('filename', file.filename);
    });

    it('should fail for non-shared folder', async () => {
      const folder = await dbUtils.createTestFolder(testUser.id);
      const share = await dbUtils.createTestShare({
        folder_id: folder.id,
        shared_by: testUser.id,
        shared_with: testUser2.id
      });

      const response = await request(app)
        .get(`/api/shares/${share.id}/contents`)
        .set('Authorization', authHeader3) // Third user who has no access
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Shared folder not found or access denied');
    });
  });
});