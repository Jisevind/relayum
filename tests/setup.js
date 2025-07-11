// Load test environment variables
require('dotenv').config({ path: '.env.test' });

const db = require('../models/database');

// Global test setup
beforeAll(async () => {
  
  // Create test uploads directory
  const fs = require('fs').promises;
  try {
    await fs.mkdir('./tests/uploads', { recursive: true });
  } catch (error) {
    // Directory might already exist
  }
});

// Clean up after all tests
afterAll(async () => {
  await db.pool.end();
  
  // Clean up test uploads directory
  const fs = require('fs').promises;
  const path = require('path');
  try {
    const uploadDir = './tests/uploads';
    const files = await fs.readdir(uploadDir);
    for (const file of files) {
      await fs.unlink(path.join(uploadDir, file));
    }
    await fs.rmdir(uploadDir);
  } catch (error) {
    // Directory might not exist or be empty
  }
});