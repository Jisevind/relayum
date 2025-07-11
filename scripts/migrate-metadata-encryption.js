#!/usr/bin/env node

/**
 * Migration Script: Encrypt Existing Metadata Files
 * 
 * This script migrates existing unencrypted metadata files (version 1.0)
 * to the new encrypted format (version 2.0) for enhanced security.
 * 
 * Usage:
 *   node scripts/migrate-metadata-encryption.js [--dry-run]
 * 
 * Options:
 *   --dry-run    Show what would be migrated without making changes
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

// Import our services
const EncryptionService = require('../utils/encryptionService');
const StorageService = require('../utils/storageService');

class MetadataMigration {
  constructor() {
    this.encryptionService = new EncryptionService();
    this.storageService = new StorageService();
    this.isDryRun = process.argv.includes('--dry-run');
    this.stats = {
      total: 0,
      migrated: 0,
      alreadyMigrated: 0,
      errors: 0
    };
  }

  async run() {
    console.log('🔒 Metadata Encryption Migration');
    console.log('================================');
    
    if (this.isDryRun) {
      console.log('📋 DRY RUN MODE - No files will be modified');
    }
    
    console.log('');

    try {
      // Validate environment
      await this.validateEnvironment();
      
      // Find all metadata files
      const metadataFiles = await this.findMetadataFiles();
      this.stats.total = metadataFiles.length;
      
      console.log(`📁 Found ${metadataFiles.length} metadata files`);
      console.log('');

      // Process each file
      for (const filePath of metadataFiles) {
        await this.processMetadataFile(filePath);
      }

      // Show summary
      this.showSummary();

    } catch (error) {
      console.error('❌ Migration failed:', error.message);
      process.exit(1);
    }
  }

  async validateEnvironment() {
    try {
      // Check if METADATA_ENCRYPTION_KEY is set
      this.encryptionService.getMetadataEncryptionKey();
      console.log('✅ METADATA_ENCRYPTION_KEY environment variable is valid');
    } catch (error) {
      throw new Error(`Environment validation failed: ${error.message}`);
    }
  }

  async findMetadataFiles() {
    const uploadPath = process.env.UPLOAD_PATH || './uploads';
    const usersPath = path.join(uploadPath, 'users');
    
    const metadataFiles = [];

    try {
      const userDirs = await fs.readdir(usersPath);
      
      for (const userDir of userDirs) {
        const userPath = path.join(usersPath, userDir);
        const metadataPath = path.join(userPath, 'metadata');
        
        try {
          const metadataFileNames = await fs.readdir(metadataPath);
          
          for (const fileName of metadataFileNames) {
            if (fileName.endsWith('.meta')) {
              metadataFiles.push(path.join(metadataPath, fileName));
            }
          }
        } catch (error) {
          // Skip if metadata directory doesn't exist
          if (error.code !== 'ENOENT') {
            console.warn(`⚠️  Could not read metadata directory ${metadataPath}: ${error.message}`);
          }
        }
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('📂 No users directory found - nothing to migrate');
        return [];
      }
      throw error;
    }

    return metadataFiles;
  }

  async processMetadataFile(filePath) {
    try {
      // Read and parse metadata
      const metadataContent = await fs.readFile(filePath, 'utf8');
      const metadata = JSON.parse(metadataContent);
      
      // Check if already migrated
      if (metadata.version === '2.0' && metadata.encryptedMetadata) {
        console.log(`⏭️  ${path.basename(filePath)} - Already encrypted (v2.0)`);
        this.stats.alreadyMigrated++;
        return;
      }

      // Validate it's a v1.0 metadata file
      if (!metadata.originalName || !metadata.masterKey) {
        console.log(`⚠️  ${path.basename(filePath)} - Invalid metadata format, skipping`);
        this.stats.errors++;
        return;
      }

      console.log(`🔄 ${path.basename(filePath)} - Encrypting: ${metadata.originalName}`);

      if (!this.isDryRun) {
        await this.migrateMetadataFile(filePath, metadata);
      }

      this.stats.migrated++;

    } catch (error) {
      console.error(`❌ ${path.basename(filePath)} - Error: ${error.message}`);
      this.stats.errors++;
    }
  }

  async migrateMetadataFile(filePath, oldMetadata) {
    // Separate sensitive and public metadata
    const sensitiveMetadata = {
      originalName: oldMetadata.originalName,
      mimeType: oldMetadata.mimeType,
      originalSize: oldMetadata.originalSize,
      masterKey: oldMetadata.masterKey,
      originalNameHash: crypto.createHash('sha256').update(oldMetadata.originalName).digest('hex')
    };

    const publicMetadata = {
      fileId: oldMetadata.fileId,
      encryptedSize: oldMetadata.encryptedSize,
      iv: oldMetadata.iv,
      tag: oldMetadata.tag,
      hash: oldMetadata.hash,
      uploadedAt: oldMetadata.uploadedAt,
      version: '2.0', // Upgrade to new version
      encryptedMetadata: null
    };

    // Encrypt sensitive metadata
    publicMetadata.encryptedMetadata = this.encryptionService.encryptMetadata(sensitiveMetadata);

    // Create backup of original file
    const backupPath = `${filePath}.v1.backup`;
    await fs.copyFile(filePath, backupPath);

    // Write new encrypted metadata
    await fs.writeFile(filePath, JSON.stringify(publicMetadata, null, 2), 'utf8');

    console.log(`   💾 Created backup: ${path.basename(backupPath)}`);
  }

  showSummary() {
    console.log('');
    console.log('📊 Migration Summary');
    console.log('===================');
    console.log(`📁 Total files found: ${this.stats.total}`);
    console.log(`🔒 Files migrated: ${this.stats.migrated}`);
    console.log(`✅ Already migrated: ${this.stats.alreadyMigrated}`);
    console.log(`❌ Errors: ${this.stats.errors}`);
    console.log('');

    if (this.isDryRun) {
      console.log('📋 This was a dry run - no files were modified');
      console.log('   Run without --dry-run to perform the migration');
    } else if (this.stats.migrated > 0) {
      console.log('✅ Migration completed successfully!');
      console.log('   Original files have been backed up with .v1.backup extension');
      console.log('   You can remove backup files after verifying the migration worked correctly');
    } else {
      console.log('ℹ️  No files needed migration');
    }
  }
}

// Run migration if called directly
if (require.main === module) {
  const migration = new MetadataMigration();
  migration.run().catch(error => {
    console.error('💥 Migration script failed:', error);
    process.exit(1);
  });
}

module.exports = MetadataMigration;