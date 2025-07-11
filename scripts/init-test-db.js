require('dotenv').config({ path: '.env.test' });
const { Pool } = require('pg');

const initTestDatabase = async () => {
  // First, connect to the default postgres database to create our test database
  const adminPool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: 'postgres',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });

  try {
    // Create test database if it doesn't exist
    await adminPool.query(`CREATE DATABASE ${process.env.DB_NAME}`);
    console.log(`Test database '${process.env.DB_NAME}' created successfully`);
  } catch (error) {
    if (error.code === '42P04') {
      console.log(`Test database '${process.env.DB_NAME}' already exists`);
    } else {
      console.error('Error creating test database:', error);
      process.exit(1);
    }
  } finally {
    await adminPool.end();
  }

  // Now connect to the test database and create tables
  const testPool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });

  try {
    // Create tables
    await testPool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await testPool.query(`
      CREATE TABLE IF NOT EXISTS folders (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        parent_id INTEGER REFERENCES folders(id) ON DELETE CASCADE,
        owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await testPool.query(`
      CREATE TABLE IF NOT EXISTS files (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL,
        filepath VARCHAR(500) NOT NULL,
        size BIGINT NOT NULL,
        mime_type VARCHAR(100),
        folder_id INTEGER REFERENCES folders(id) ON DELETE CASCADE,
        uploader_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await testPool.query(`
      CREATE TABLE IF NOT EXISTS shares (
        id SERIAL PRIMARY KEY,
        file_id INTEGER REFERENCES files(id) ON DELETE CASCADE,
        folder_id INTEGER REFERENCES folders(id) ON DELETE CASCADE,
        shared_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
        shared_with INTEGER REFERENCES users(id) ON DELETE CASCADE,
        public_token VARCHAR(255) UNIQUE,
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT share_target_check CHECK (
          (file_id IS NOT NULL AND folder_id IS NULL) OR 
          (file_id IS NULL AND folder_id IS NOT NULL)
        )
      )
    `);

    console.log('Test database tables created successfully');
  } catch (error) {
    console.error('Error creating test database tables:', error);
    process.exit(1);
  } finally {
    await testPool.end();
  }
};

if (require.main === module) {
  initTestDatabase().then(() => {
    console.log('Test database initialization complete');
    process.exit(0);
  });
}

module.exports = initTestDatabase;