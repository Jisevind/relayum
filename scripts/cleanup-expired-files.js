const { Pool } = require('pg');
const StorageService = require('../utils/storageService');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'filesharing',
  user: process.env.DB_USER || 'filesharing_user',
  password: process.env.DB_PASSWORD || 'filesharing_password'
});

const storageService = new StorageService();

async function cleanupExpiredFiles() {
  const client = await pool.connect();
  
  try {
    console.log('Starting cleanup of expired files...');
    
    // Get all expired files
    const expiredFiles = await client.query(`
      SELECT f.id, f.filename, f.size, f.uploader_id, f.file_id, f.encrypted, f.filepath
      FROM files f
      WHERE f.expires_at IS NOT NULL AND f.expires_at < NOW()
    `);
    
    console.log(`Found ${expiredFiles.rows.length} expired files to clean up`);
    
    if (expiredFiles.rows.length === 0) {
      console.log('✅ No expired files to clean up');
      return;
    }
    
    let deletedCount = 0;
    let totalSizeFreed = 0;
    const userSizeReductions = new Map();
    
    for (const file of expiredFiles.rows) {
      try {
        // Track size reduction per user
        if (userSizeReductions.has(file.uploader_id)) {
          userSizeReductions.set(file.uploader_id, 
            userSizeReductions.get(file.uploader_id) + file.size);
        } else {
          userSizeReductions.set(file.uploader_id, file.size);
        }
        
        // Delete physical file
        if (file.encrypted && file.file_id) {
          // Delete encrypted file using storage service
          try {
            await storageService.deleteFile(file.uploader_id, file.file_id);
          } catch (deleteError) {
            console.error(`Error deleting encrypted file ${file.filename}:`, deleteError);
          }
        } else if (file.filepath) {
          // Delete legacy unencrypted file
          const fs = require('fs').promises;
          try {
            await fs.unlink(file.filepath);
          } catch (unlinkError) {
            console.error(`Error deleting file ${file.filepath}:`, unlinkError);
          }
        }
        
        // Delete from database
        await client.query('DELETE FROM files WHERE id = $1', [file.id]);
        
        deletedCount++;
        totalSizeFreed += file.size;
        
        console.log(`✅ Deleted expired file: ${file.filename} (${file.size} bytes)`);
        
      } catch (error) {
        console.error(`❌ Error deleting file ${file.filename}:`, error);
      }
    }
    
    // Update user disk usage for all affected users
    for (const [userId, sizeReduction] of userSizeReductions) {
      try {
        await client.query(
          'UPDATE users SET disk_used_bytes = GREATEST(0, disk_used_bytes - $1) WHERE id = $2',
          [sizeReduction, userId]
        );
        console.log(`✅ Updated disk usage for user ${userId}: -${sizeReduction} bytes`);
      } catch (error) {
        console.error(`❌ Error updating disk usage for user ${userId}:`, error);
      }
    }
    
    console.log(`✅ Cleanup completed:`);
    console.log(`   - Files deleted: ${deletedCount}`);
    console.log(`   - Total space freed: ${totalSizeFreed} bytes (${(totalSizeFreed / 1024 / 1024).toFixed(2)} MB)`);
    console.log(`   - Users affected: ${userSizeReductions.size}`);
    
  } catch (error) {
    console.error('❌ Error during expired files cleanup:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run the cleanup if this script is executed directly
if (require.main === module) {
  cleanupExpiredFiles()
    .then(() => {
      console.log('Expired files cleanup completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Expired files cleanup failed:', error);
      process.exit(1);
    });
}

module.exports = { cleanupExpiredFiles };