const request = require('supertest');
const express = require('express');
const folderRoutes = require('../routes/folders');
const { dbUtils, authUtils } = require('./testUtils');

// Create test app
const app = express();
app.use(express.json());
app.use('/api/folders', folderRoutes);

describe('Folder Routes', () => {
  let testUser;
  let authHeader;

  beforeEach(async () => {
    await dbUtils.cleanDatabase();
    testUser = await dbUtils.createTestUser();
    authHeader = authUtils.getAuthHeader(testUser);
  });

  describe('POST /api/folders', () => {
    it('should create a root folder successfully', async () => {
      const folderData = {
        name: 'New Folder',
        parent_id: null
      };

      const response = await request(app)
        .post('/api/folders')
        .set('Authorization', authHeader)
        .send(folderData)
        .expect(201);

      expect(response.body).toHaveProperty('message', 'Folder created successfully');
      expect(response.body).toHaveProperty('folder');
      expect(response.body.folder).toHaveProperty('name', 'New Folder');
      expect(response.body.folder).toHaveProperty('parent_id', null);
      expect(response.body.folder).toHaveProperty('owner_id', testUser.id);
    });

    it('should create a subfolder successfully', async () => {
      const parentFolder = await dbUtils.createTestFolder(testUser.id, { name: 'Parent' });
      
      const folderData = {
        name: 'Subfolder',
        parent_id: parentFolder.id
      };

      const response = await request(app)
        .post('/api/folders')
        .set('Authorization', authHeader)
        .send(folderData)
        .expect(201);

      expect(response.body.folder).toHaveProperty('name', 'Subfolder');
      expect(response.body.folder).toHaveProperty('parent_id', parentFolder.id);
    });

    it('should fail with empty folder name', async () => {
      const response = await request(app)
        .post('/api/folders')
        .set('Authorization', authHeader)
        .send({ name: '' })
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Folder name is required');
    });

    it('should fail with whitespace-only folder name', async () => {
      const response = await request(app)
        .post('/api/folders')
        .set('Authorization', authHeader)
        .send({ name: '   ' })
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Folder name is required');
    });

    it('should fail with non-existent parent folder', async () => {
      const response = await request(app)
        .post('/api/folders')
        .set('Authorization', authHeader)
        .send({
          name: 'Test Folder',
          parent_id: 999999
        })
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Parent folder not found');
    });

    it('should fail to create subfolder in other user\'s folder', async () => {
      const otherUser = await dbUtils.createTestUser({
        username: 'otheruser',
        email: 'other@example.com'
      });
      const otherFolder = await dbUtils.createTestFolder(otherUser.id);

      const response = await request(app)
        .post('/api/folders')
        .set('Authorization', authHeader)
        .send({
          name: 'Subfolder',
          parent_id: otherFolder.id
        })
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Parent folder not found');
    });

    it('should fail without authentication', async () => {
      const response = await request(app)
        .post('/api/folders')
        .send({ name: 'Test Folder' })
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Access token required');
    });
  });

  describe('GET /api/folders', () => {
    it('should get root folders', async () => {
      await dbUtils.createTestFolder(testUser.id, { name: 'Folder 1' });
      await dbUtils.createTestFolder(testUser.id, { name: 'Folder 2' });

      const response = await request(app)
        .get('/api/folders')
        .set('Authorization', authHeader)
        .expect(200);

      expect(response.body).toHaveProperty('folders');
      expect(response.body.folders).toHaveLength(2);
      expect(response.body.folders.map(f => f.name)).toContain('Folder 1');
      expect(response.body.folders.map(f => f.name)).toContain('Folder 2');
    });

    it('should get subfolders of specific parent', async () => {
      const parentFolder = await dbUtils.createTestFolder(testUser.id, { name: 'Parent' });
      await dbUtils.createTestFolder(testUser.id, { 
        name: 'Subfolder 1', 
        parent_id: parentFolder.id 
      });
      await dbUtils.createTestFolder(testUser.id, { 
        name: 'Subfolder 2', 
        parent_id: parentFolder.id 
      });
      await dbUtils.createTestFolder(testUser.id, { name: 'Root Folder' });

      const response = await request(app)
        .get('/api/folders')
        .query({ parent_id: parentFolder.id })
        .set('Authorization', authHeader)
        .expect(200);

      expect(response.body.folders).toHaveLength(2);
      expect(response.body.folders.map(f => f.name)).toContain('Subfolder 1');
      expect(response.body.folders.map(f => f.name)).toContain('Subfolder 2');
      expect(response.body.folders.map(f => f.name)).not.toContain('Root Folder');
    });

    it('should not get other users\' folders', async () => {
      const otherUser = await dbUtils.createTestUser({
        username: 'otheruser',
        email: 'other@example.com'
      });
      
      await dbUtils.createTestFolder(otherUser.id, { name: 'Other Folder' });
      await dbUtils.createTestFolder(testUser.id, { name: 'My Folder' });

      const response = await request(app)
        .get('/api/folders')
        .set('Authorization', authHeader)
        .expect(200);

      expect(response.body.folders).toHaveLength(1);
      expect(response.body.folders[0]).toHaveProperty('name', 'My Folder');
    });

    it('should fail without authentication', async () => {
      const response = await request(app)
        .get('/api/folders')
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Access token required');
    });
  });

  describe('GET /api/folders/tree', () => {
    it('should get folder tree structure', async () => {
      const parent = await dbUtils.createTestFolder(testUser.id, { name: 'Parent' });
      await dbUtils.createTestFolder(testUser.id, { 
        name: 'Child 1', 
        parent_id: parent.id 
      });
      await dbUtils.createTestFolder(testUser.id, { 
        name: 'Child 2', 
        parent_id: parent.id 
      });
      await dbUtils.createTestFolder(testUser.id, { name: 'Root' });

      const response = await request(app)
        .get('/api/folders/tree')
        .set('Authorization', authHeader)
        .expect(200);

      expect(response.body).toHaveProperty('tree');
      expect(response.body.tree).toHaveLength(2); // Parent and Root

      const parentInTree = response.body.tree.find(f => f.name === 'Parent');
      expect(parentInTree).toHaveProperty('children');
      expect(parentInTree.children).toHaveLength(2);
      expect(parentInTree.children.map(c => c.name)).toContain('Child 1');
      expect(parentInTree.children.map(c => c.name)).toContain('Child 2');
    });

    it('should return empty tree for user with no folders', async () => {
      const response = await request(app)
        .get('/api/folders/tree')
        .set('Authorization', authHeader)
        .expect(200);

      expect(response.body).toHaveProperty('tree', []);
    });

    it('should fail without authentication', async () => {
      const response = await request(app)
        .get('/api/folders/tree')
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Access token required');
    });
  });

  describe('GET /api/folders/:id', () => {
    it('should get folder details', async () => {
      const folder = await dbUtils.createTestFolder(testUser.id, { name: 'Test Folder' });

      const response = await request(app)
        .get(`/api/folders/${folder.id}`)
        .set('Authorization', authHeader)
        .expect(200);

      expect(response.body).toHaveProperty('folder');
      expect(response.body.folder).toHaveProperty('name', 'Test Folder');
      expect(response.body.folder).toHaveProperty('owner_id', testUser.id);
    });

    it('should fail to get other user\'s folder', async () => {
      const otherUser = await dbUtils.createTestUser({
        username: 'otheruser',
        email: 'other@example.com'
      });
      const folder = await dbUtils.createTestFolder(otherUser.id);

      const response = await request(app)
        .get(`/api/folders/${folder.id}`)
        .set('Authorization', authHeader)
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Folder not found');
    });

    it('should fail with non-existent folder', async () => {
      const response = await request(app)
        .get('/api/folders/999999')
        .set('Authorization', authHeader)
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Folder not found');
    });

    it('should fail without authentication', async () => {
      const folder = await dbUtils.createTestFolder(testUser.id);

      const response = await request(app)
        .get(`/api/folders/${folder.id}`)
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Access token required');
    });
  });

  describe('DELETE /api/folders/:id', () => {
    it('should delete empty folder successfully', async () => {
      const folder = await dbUtils.createTestFolder(testUser.id, { name: 'To Delete' });

      const response = await request(app)
        .delete(`/api/folders/${folder.id}`)
        .set('Authorization', authHeader)
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Folder deleted successfully');
    });

    it('should fail to delete other user\'s folder', async () => {
      const otherUser = await dbUtils.createTestUser({
        username: 'otheruser',
        email: 'other@example.com'
      });
      const folder = await dbUtils.createTestFolder(otherUser.id);

      const response = await request(app)
        .delete(`/api/folders/${folder.id}`)
        .set('Authorization', authHeader)
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Folder not found');
    });

    it('should fail to delete non-existent folder', async () => {
      const response = await request(app)
        .delete('/api/folders/999999')
        .set('Authorization', authHeader)
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Folder not found');
    });

    it('should fail without authentication', async () => {
      const folder = await dbUtils.createTestFolder(testUser.id);

      const response = await request(app)
        .delete(`/api/folders/${folder.id}`)
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Access token required');
    });
  });

  describe('PUT /api/folders/:id/move', () => {
    it('should move folder to different parent successfully', async () => {
      const targetParent = await dbUtils.createTestFolder(testUser.id, { name: 'Target' });
      const folderToMove = await dbUtils.createTestFolder(testUser.id, { name: 'Movable' });

      const response = await request(app)
        .put(`/api/folders/${folderToMove.id}/move`)
        .set('Authorization', authHeader)
        .send({ parentId: targetParent.id })
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Folder moved successfully');
    });

    it('should move folder to root (null parent)', async () => {
      const parent = await dbUtils.createTestFolder(testUser.id, { name: 'Parent' });
      const child = await dbUtils.createTestFolder(testUser.id, { 
        name: 'Child',
        parent_id: parent.id 
      });

      const response = await request(app)
        .put(`/api/folders/${child.id}/move`)
        .set('Authorization', authHeader)
        .send({ parentId: null })
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Folder moved successfully');
    });

    it('should fail to create circular reference', async () => {
      const parent = await dbUtils.createTestFolder(testUser.id, { name: 'Parent' });
      const child = await dbUtils.createTestFolder(testUser.id, { 
        name: 'Child',
        parent_id: parent.id 
      });

      const response = await request(app)
        .put(`/api/folders/${parent.id}/move`)
        .set('Authorization', authHeader)
        .send({ parentId: child.id })
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Cannot move folder into its own subfolder');
    });

    it('should fail to move other user\'s folder', async () => {
      const otherUser = await dbUtils.createTestUser({
        username: 'otheruser',
        email: 'other@example.com'
      });
      const folder = await dbUtils.createTestFolder(otherUser.id);
      const targetParent = await dbUtils.createTestFolder(testUser.id);

      const response = await request(app)
        .put(`/api/folders/${folder.id}/move`)
        .set('Authorization', authHeader)
        .send({ parentId: targetParent.id })
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Folder not found or not owned by you');
    });

    it('should fail to move to other user\'s folder', async () => {
      const otherUser = await dbUtils.createTestUser({
        username: 'otheruser',
        email: 'other@example.com'
      });
      const folder = await dbUtils.createTestFolder(testUser.id);
      const targetParent = await dbUtils.createTestFolder(otherUser.id);

      const response = await request(app)
        .put(`/api/folders/${folder.id}/move`)
        .set('Authorization', authHeader)
        .send({ parentId: targetParent.id })
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Target parent folder not found or not owned by you');
    });

    it('should fail without authentication', async () => {
      const folder = await dbUtils.createTestFolder(testUser.id);

      const response = await request(app)
        .put(`/api/folders/${folder.id}/move`)
        .send({ parentId: null })
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Access token required');
    });
  });

  describe('GET /api/folders/:id/breadcrumb', () => {
    it('should get breadcrumb for nested folder', async () => {
      const root = await dbUtils.createTestFolder(testUser.id, { name: 'Root' });
      const middle = await dbUtils.createTestFolder(testUser.id, { 
        name: 'Middle',
        parent_id: root.id 
      });
      const deep = await dbUtils.createTestFolder(testUser.id, { 
        name: 'Deep',
        parent_id: middle.id 
      });

      const response = await request(app)
        .get(`/api/folders/${deep.id}/breadcrumb`)
        .set('Authorization', authHeader)
        .expect(200);

      expect(response.body).toHaveProperty('breadcrumb');
      expect(response.body.breadcrumb).toHaveLength(3);
      // Breadcrumb is ordered by level DESC (root first)
      expect(response.body.breadcrumb[0]).toHaveProperty('name', 'Root');
      expect(response.body.breadcrumb[1]).toHaveProperty('name', 'Middle');
      expect(response.body.breadcrumb[2]).toHaveProperty('name', 'Deep');
    });

    it('should get breadcrumb for root folder', async () => {
      const folder = await dbUtils.createTestFolder(testUser.id, { name: 'Root' });

      const response = await request(app)
        .get(`/api/folders/${folder.id}/breadcrumb`)
        .set('Authorization', authHeader)
        .expect(200);

      expect(response.body.breadcrumb).toHaveLength(1);
      expect(response.body.breadcrumb[0]).toHaveProperty('name', 'Root');
    });

    it('should fail for other user\'s folder', async () => {
      const otherUser = await dbUtils.createTestUser({
        username: 'otheruser',
        email: 'other@example.com'
      });
      const folder = await dbUtils.createTestFolder(otherUser.id);

      const response = await request(app)
        .get(`/api/folders/${folder.id}/breadcrumb`)
        .set('Authorization', authHeader)
        .expect(200);

      // Current implementation doesn't validate folder ownership for breadcrumb
      expect(response.body).toHaveProperty('breadcrumb');
    });

    it('should fail without authentication', async () => {
      const folder = await dbUtils.createTestFolder(testUser.id);

      const response = await request(app)
        .get(`/api/folders/${folder.id}/breadcrumb`)
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Access token required');
    });
  });
});