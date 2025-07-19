const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const mime = require('mime-types');
const db = require('../models/database');
const { authenticateToken } = require('../middleware/auth');
const DatabaseUtils = require('../utils/dbUtils');
const StorageService = require('../utils/storageService');
const FileValidationService = require('../middleware/fileValidation');
const { getVirusScanner } = require('../services/virusScanner');
const { getQuarantineService } = require('../services/quarantineService');
const { parseFileSize } = require('../utils/fileSizeUtils');
const router = express.Router();
const storageService = new StorageService();
const fileValidation = new FileValidationService();

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      // Use temp directory for initial upload before encryption
      const tempPath = await storageService.createTempFile('upload');
      cb(null, path.dirname(tempPath));
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `temp-${uniqueSuffix}-${file.originalname}`);
  }
});

const fileFilter = (req, file, cb) => {
  try {
    // Use enhanced file validation (MIME type check removed)
    const extensionCheck = fileValidation.validateExtension(file.originalname);
    const filenameCheck = fileValidation.validateFilename(file.originalname);
    
    // Skip size check in fileFilter since file.size might not be available yet
    // Size validation will be done in the main validation middleware
    
    if (!extensionCheck.valid) {
      cb(new Error(extensionCheck.reason), false);
    } else if (!filenameCheck.valid) {
      cb(new Error(filenameCheck.reason), false);
    } else {
      cb(null, true);
    }
  } catch (error) {
    console.error('File filter error:', error);
    cb(error, false);
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseFileSize(process.env.MAX_FILE_SIZE || '100MB')
  },
  fileFilter: fileFilter
});

// Debug endpoint to test authentication
router.post('/test-auth', authenticateToken, (req, res) => {
  res.json({ message: 'Authentication working', user: req.user });
});

// Working authenticated upload with proper file processing
router.post('/upload', authenticateToken, upload.array('files'), async (req, res) => {
  console.log('🔍 Upload route - Content-Type:', req.get('Content-Type'));
  console.log('🔍 Files received:', req.files ? req.files.length : 0);
  
  try {
    if (!req.files || req.files.length === 0) {
      console.log('❌ No files uploaded');
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const { folder_id } = req.body;
    const uploadedFiles = [];
    const rejectedFiles = []; // Track files rejected due to virus detection
    
    // Helper function to create folder structure
    const createFolderStructure = async (relativePath, baseFolder) => {
      if (!relativePath) return baseFolder;
      
      const pathParts = relativePath.split('/').slice(0, -1); // Remove filename
      let currentFolderId = baseFolder;
      let currentPath = '';
      
      for (const folderName of pathParts) {
        currentPath = currentPath ? `${currentPath}/${folderName}` : folderName;
        
        // Check if folder exists
        let existingFolder = await db.query(`
          SELECT id FROM folders 
          WHERE name = $1 AND owner_id = $2 AND parent_id ${currentFolderId ? '= $3' : 'IS NULL'}
        `, currentFolderId ? [folderName, req.user.id, currentFolderId] : [folderName, req.user.id]);
        
        if (existingFolder.rows.length === 0) {
          // Create folder
          const newFolder = await db.query(`
            INSERT INTO folders (name, parent_id, owner_id, created_at)
            VALUES ($1, $2, $3, NOW())
            RETURNING id
          `, [folderName, currentFolderId, req.user.id]);
          
          currentFolderId = newFolder.rows[0].id;
          console.log(`📂 Created folder: ${currentPath} (ID: ${currentFolderId})`);
        } else {
          currentFolderId = existingFolder.rows[0].id;
          console.log(`📂 Using existing folder: ${currentPath} (ID: ${currentFolderId})`);
        }
      }
      
      return currentFolderId;
    };

    // Process each uploaded file
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      try {
        console.log(`📁 Processing file: ${file.originalname}`);
        
        // Check for webkitRelativePath to handle folder uploads
        const relativePath = req.body[`webkitRelativePath_${i}`];
        let fileFolderId = folder_id || null;
        
        if (relativePath) {
          console.log(`📂 Folder upload detected - path: ${relativePath}`);
          fileFolderId = await createFolderStructure(relativePath, folder_id || null);
        }
        
        // Check for duplicate files (same name, size, and folder)
        const duplicateCheck = await db.query(`
          SELECT id, filename FROM files 
          WHERE filename = $1 AND size = $2 AND uploader_id = $3 AND folder_id ${fileFolderId ? '= $4' : 'IS NULL'}
        `, fileFolderId ? [file.originalname, file.size, req.user.id, fileFolderId] : [file.originalname, file.size, req.user.id]);
        
        if (duplicateCheck.rows.length > 0) {
          console.log(`⚠️ Duplicate file detected: ${file.originalname} (existing ID: ${duplicateCheck.rows[0].id})`);
          
          // Clean up temp file
          try {
            await fs.unlink(file.path);
          } catch (unlinkError) {
            console.error('Error cleaning up duplicate temp file:', unlinkError);
          }
          
          // Skip this file but don't consider it an error - just inform
          rejectedFiles.push({
            filename: file.originalname,
            reason: 'duplicate',
            message: `File already exists with the same name and size`,
            existing_id: duplicateCheck.rows[0].id
          });
          continue;
        }
        
        // Virus scan the file before processing
        const { getVirusScanner } = require('../services/virusScanner');
        const virusScanner = getVirusScanner();
        
        let scanResult = null;
        if (virusScanner.enabled) {
          console.log(`🦠 Scanning file for viruses: ${file.originalname}`);
          try {
            scanResult = await virusScanner.scanFile(file.path, {
              fileSize: file.size,
              filename: file.originalname
            });
            
            console.log(`🦠 Scan result for ${file.originalname}:`, {
              status: scanResult.status,
              clean: scanResult.clean,
              threat: scanResult.threat,
              scanTime: scanResult.scanTime
            });
            
            // Handle virus detection - quarantine instead of blocking
            if (!scanResult.clean && scanResult.threat) {
              console.log(`❌ VIRUS DETECTED in ${file.originalname}: ${scanResult.threat}`);
              
              try {
                // Quarantine the infected file
                const quarantineService = getQuarantineService();
                const quarantineResult = await quarantineService.quarantineFile(file.path, {
                  originalFilename: file.originalname,
                  fileSize: file.size,
                  mimeType: file.mimetype,
                  threat: scanResult.threat,
                  uploaderId: req.user.id,
                  scanResult: scanResult
                });

                // Record scan history for quarantined file
                await db.query(`
                  INSERT INTO scan_history (
                    file_id, file_name, file_size, mime_type, uploader_id,
                    scan_status, threat_name, scan_duration_ms, scanned_at, details
                  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9)
                `, [
                  null, // file_id is null since file was quarantined not stored normally
                  file.originalname,
                  file.size,
                  file.mimetype,
                  req.user.id,
                  scanResult.status,
                  scanResult.threat,
                  scanResult.scanTime || 0,
                  JSON.stringify({
                    clean: scanResult.clean,
                    engine: scanResult.engine,
                    message: scanResult.message,
                    quarantined: true,
                    quarantine_id: quarantineResult.quarantineId,
                    file_hash: quarantineResult.fileHash
                  })
                ]);

                console.log(`🔒 File quarantined successfully: ${file.originalname} (ID: ${quarantineResult.quarantineId})`);

                rejectedFiles.push({
                  filename: file.originalname,
                  reason: 'virus_detected',
                  threat: scanResult.threat,
                  message: `Virus detected and quarantined: ${scanResult.threat}`,
                  quarantine_id: quarantineResult.quarantineId
                });

              } catch (quarantineError) {
                console.error('Failed to quarantine infected file:', quarantineError);
                
                // Fallback: record scan history and clean up file
                try {
                  await db.query(`
                    INSERT INTO scan_history (
                      file_id, file_name, file_size, mime_type, uploader_id,
                      scan_status, threat_name, scan_duration_ms, scanned_at, details
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9)
                  `, [
                    null,
                    file.originalname,
                    file.size,
                    file.mimetype,
                    req.user.id,
                    scanResult.status,
                    scanResult.threat,
                    scanResult.scanTime || 0,
                    JSON.stringify({
                      clean: scanResult.clean,
                      engine: scanResult.engine,
                      message: scanResult.message,
                      quarantine_failed: true,
                      quarantine_error: quarantineError.message
                    })
                  ]);
                } catch (historyError) {
                  console.error('Failed to record threat scan history:', historyError);
                }

                // Clean up temp file
                try {
                  await fs.unlink(file.path);
                } catch (unlinkError) {
                  console.error('Error cleaning up infected file:', unlinkError);
                }

                rejectedFiles.push({
                  filename: file.originalname,
                  reason: 'virus_detected',
                  threat: scanResult.threat,
                  message: `Virus detected but quarantine failed: ${scanResult.threat}`
                });
              }
              
              // Skip this file and continue with others
              continue;
            }
          } catch (scanError) {
            console.error(`🦠 Virus scan failed for ${file.originalname}:`, scanError);
            // Continue processing - don't block upload on scan errors
            scanResult = {
              status: 'error',
              clean: true,
              threat: null,
              scanTime: 0,
              engine: 'error',
              message: `Scan failed: ${scanError.message}`
            };
          }
        } else {
          console.log(`🦠 Virus scanning disabled for ${file.originalname}`);
          scanResult = {
            status: 'disabled',
            clean: true,
            threat: null,
            scanTime: 0,
            engine: 'disabled',
            message: 'Virus scanning is disabled'
          };
        }
        
        // Store file using StorageService (handles encryption)
        const fileInfo = await storageService.storeFile(
          req.user.id, 
          file.path,           // sourcePath - temp file path from multer
          file.originalname,   // originalName
          file.mimetype,       // mimeType  
          file.size           // originalSize
        );
        
        // Insert file record into database
        const fileResult = await db.query(`
          INSERT INTO files (
            filename, filepath, size, mime_type, uploader_id, folder_id, 
            encrypted, file_id, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW()) 
          RETURNING id, filename, size, mime_type, created_at
        `, [
          file.originalname,
          fileInfo.encryptedPath,
          file.size,
          file.mimetype,
          req.user.id,
          fileFolderId,  // Use the determined folder ID
          true,
          fileInfo.fileId
        ]);
        
        const savedFile = fileResult.rows[0];
        
        // Record scan history only when virus scanning is enabled
        if (scanResult && virusScanner.enabled) {
          try {
            await db.query(`
              INSERT INTO scan_history (
                file_id, file_name, file_size, mime_type, uploader_id,
                scan_status, threat_name, scan_duration_ms, scanned_at, details
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9)
            `, [
              savedFile.id,
              file.originalname,
              file.size,
              file.mimetype,
              req.user.id,
              scanResult.status,
              scanResult.threat || null,
              scanResult.scanTime || 0,
              JSON.stringify({
                clean: scanResult.clean,
                engine: scanResult.engine,
                message: scanResult.message
              })
            ]);
            console.log(`📝 Scan history recorded for ${savedFile.filename}`);
          } catch (historyError) {
            console.error('Failed to record scan history:', historyError);
            // Don't fail upload if history recording fails
          }
        }
        
        uploadedFiles.push({
          id: savedFile.id,
          filename: savedFile.filename,
          size: savedFile.size,
          mime_type: savedFile.mime_type,
          created_at: savedFile.created_at,
          scan_status: scanResult?.status || 'unknown'
        });
        
        console.log(`✅ File saved: ${savedFile.filename} (ID: ${savedFile.id}) - Scan: ${scanResult?.status || 'unknown'}`);
        
      } catch (fileError) {
        console.error(`❌ Error processing file ${file.originalname}:`, fileError);
        // Clean up temp file
        try {
          await fs.unlink(file.path);
        } catch (unlinkError) {
          console.error('Error cleaning up temp file:', unlinkError);
        }
      }
    }

    if (uploadedFiles.length === 0 && rejectedFiles.length === 0) {
      return res.status(500).json({ error: 'Failed to process any files' });
    }
    
    if (uploadedFiles.length === 0 && rejectedFiles.length > 0) {
      return res.status(400).json({ 
        error: 'All files were rejected',
        rejected: rejectedFiles
      });
    }

    // Update user's disk usage by recalculating from files table
    const actualUsage = await db.query(`
      SELECT COALESCE(SUM(size), 0) as actual_usage
      FROM files 
      WHERE uploader_id = $1
    `, [req.user.id]);
    
    const actualUsageBytes = parseInt(actualUsage.rows[0].actual_usage) || 0;
    await db.query(
      'UPDATE users SET disk_used_bytes = $1 WHERE id = $2',
      [actualUsageBytes, req.user.id]
    );
    
    console.log(`✅ Upload completed: ${uploadedFiles.length} files processed, ${rejectedFiles.length} files rejected`);
    
    const response = { 
      message: `Successfully uploaded ${uploadedFiles.length} file(s)`,
      files: uploadedFiles
    };
    
    // Include rejected files information if any
    if (rejectedFiles.length > 0) {
      response.rejected = rejectedFiles;
      response.message += `, ${rejectedFiles.length} file(s) rejected`;
    }
    
    res.json(response);
    
  } catch (error) {
    console.error('❌ Upload error:', error);
    res.status(500).json({ error: 'File upload failed' });
  }
});

// Move file to different folder
router.put('/:id/move', authenticateToken, async (req, res) => {
  try {
    const fileId = parseInt(req.params.id);
    const { folderId } = req.body;
    
    // Verify file ownership
    const file = await DatabaseUtils.verifyFileOwnership(fileId, req.user.id);
    if (!file) {
      return res.status(404).json({ error: 'File not found or not owned by you' });
    }
    
    // If moving to a folder, verify folder ownership
    if (folderId) {
      const folder = await DatabaseUtils.verifyFolderOwnership(folderId, req.user.id);
      if (!folder) {
        return res.status(404).json({ error: 'Target folder not found or not owned by you' });
      }
    }
    
    // Update file's folder_id
    await db.query(
      'UPDATE files SET folder_id = $1 WHERE id = $2',
      [folderId || null, fileId]
    );
    
    console.log(`📁 Moved file ${file.filename} to folder ${folderId || 'root'}`);
    res.json({ 
      message: 'File moved successfully',
      fileId: fileId,
      newFolderId: folderId || null
    });
  } catch (error) {
    console.error('Move file error:', error);
    res.status(500).json({ error: 'Failed to move file' });
  }
});

// Delete file
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const fileId = parseInt(req.params.id);
    
    // Verify file ownership
    const file = await DatabaseUtils.verifyFileOwnership(fileId, req.user.id);
    if (!file) {
      return res.status(404).json({ error: 'File not found or not owned by you' });
    }
    
    // Delete file from storage
    if (file.encrypted && file.file_id) {
      try {
        await storageService.deleteFile(req.user.id, file.file_id);
        console.log(`🗑️ Deleted encrypted file: ${file.filename}`);
      } catch (storageError) {
        console.error('Storage deletion error:', storageError);
        // Continue with database deletion even if storage fails
      }
    }
    
    // Delete from database
    await db.query('DELETE FROM files WHERE id = $1', [fileId]);
    
    // Update user's disk usage efficiently by subtracting deleted file size
    try {
      const updateResult = await db.query(
        'UPDATE users SET disk_used_bytes = GREATEST(disk_used_bytes - $1, 0) WHERE id = $2 RETURNING disk_used_bytes',
        [file.size, req.user.id]
      );
      
      // Verify the update was successful and result is reasonable
      if (updateResult.rows.length === 0) {
        console.warn(`Failed to update disk usage for user ${req.user.id}, recalculating...`);
        throw new Error('Update failed');
      }
      
      const newUsage = parseInt(updateResult.rows[0].disk_used_bytes);
      
      // Sanity check: if subtraction resulted in usage being 0 but user has other files, recalculate
      if (newUsage === 0) {
        const fileCount = await db.query('SELECT COUNT(*) as count FROM files WHERE uploader_id = $1', [req.user.id]);
        if (parseInt(fileCount.rows[0].count) > 0) {
          console.warn(`Disk usage became 0 but user ${req.user.id} has ${fileCount.rows[0].count} files, recalculating...`);
          throw new Error('Invalid usage calculation');
        }
      }
    } catch (error) {
      // Fallback to full recalculation if subtraction fails or seems incorrect
      console.warn('Falling back to full disk usage recalculation:', error.message);
      const actualUsage = await db.query(`
        SELECT COALESCE(SUM(size), 0) as actual_usage
        FROM files 
        WHERE uploader_id = $1
      `, [req.user.id]);
      
      const actualUsageBytes = parseInt(actualUsage.rows[0].actual_usage) || 0;
      await db.query(
        'UPDATE users SET disk_used_bytes = $1 WHERE id = $2',
        [actualUsageBytes, req.user.id]
      );
    }
    
    console.log(`🗑️ Deleted file: ${file.filename} (ID: ${fileId})`);
    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// Get files endpoint
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { folder_id } = req.query;
    
    const files = await DatabaseUtils.getUserFiles(req.user.id, folder_id || null);

    res.json({ files });
  } catch (error) {
    console.error('Get files error:', error);
    res.status(500).json({ error: 'Failed to retrieve files' });
  }
});

module.exports = router;
