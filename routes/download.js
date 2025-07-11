const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const archiver = require('archiver');
const db = require('../models/database');
const { authenticateToken } = require('../middleware/auth');
const DatabaseUtils = require('../utils/dbUtils');
const StorageService = require('../utils/storageService');

// Maximum download size in bytes (allow larger downloads for folders)
const MAX_DOWNLOAD_SIZE = parseInt(process.env.MAX_DOWNLOAD_SIZE) || 5368709120; // 5GB default

// Helper function to calculate total size of files
const calculateFilesTotalSize = async (files) => {
  let totalSize = 0;
  
  for (const file of files) {
    try {
      const stats = await fs.stat(file.filepath);
      totalSize += stats.size;
      
      // Early exit if size exceeds limit
      if (totalSize > MAX_DOWNLOAD_SIZE) {
        return totalSize;
      }
    } catch (error) {
      console.error(`Error getting file size for ${file.filepath}:`, error);
      // Continue without this file
    }
  }
  
  return totalSize;
};

// Helper function to format file size
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Helper function to log streaming performance
const logStreamingPerformance = (filename, fileSize, startTime, userId = 'public') => {
  const duration = Date.now() - startTime;
  const throughputMBps = (fileSize / (1024 * 1024)) / (duration / 1000);
  
};

const router = express.Router();
const storageService = new StorageService();

router.get('/file/:fileId', authenticateToken, async (req, res) => {
  try {
    const { fileId } = req.params;

    const file = await DatabaseUtils.verifyFileAccess(fileId, req.user.id);

    if (!file) {
      return res.status(404).json({ error: 'File not found or access denied' });
    }

    // All files are encrypted, so decrypt with system keys using streaming
    if (file.encrypted && file.file_id) {
      const startTime = Date.now();
      
      try {
        // Retrieve file as stream for memory-efficient download
        const streamResult = await storageService.retrieveFileStream(file.uploader_id, file.file_id);
        
        // No size limit for individual file downloads - streaming handles memory efficiently

        res.setHeader('Content-Disposition', `attachment; filename="${streamResult.metadata.originalName}"`);
        res.setHeader('Content-Type', streamResult.metadata.mimeType || 'application/octet-stream');
        res.setHeader('Content-Length', streamResult.metadata.originalSize);
        
        // Stream the decrypted file directly to response
        streamResult.stream.pipe(res);
        
        // Handle stream completion for logging and download counting
        streamResult.stream.on('end', () => {
          logStreamingPerformance(
            streamResult.metadata.originalName,
            streamResult.metadata.originalSize,
            startTime,
            req.user.username || req.user.id
          );
          
          // Increment download counter
          db.query('UPDATE files SET download_count = download_count + 1 WHERE id = $1', [fileId])
            .catch(error => console.error('Failed to increment download count:', error));
        });
        
        // Handle stream errors
        streamResult.stream.on('error', (streamError) => {
          console.error('File streaming failed:', streamError);
          if (!res.headersSent) {
            res.status(500).json({ error: 'File streaming failed' });
          }
        });
        
        // Handle client disconnection
        res.on('close', () => {
          if (!streamResult.stream.destroyed) {
            streamResult.stream.destroy();
          }
        });
        
      } catch (decryptError) {
        console.error('File decryption failed:', decryptError);
        return res.status(500).json({ error: 'File decryption failed. Please contact support.' });
      }
    } else {
      // Legacy unencrypted file (should not exist in new system)
      try {
        await fs.access(file.filepath);
        
        // No size limit for individual file downloads - if user uploaded it, they can download it
        res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
        res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
        res.sendFile(path.resolve(file.filepath), (err) => {
          if (!err) {
            // Increment download counter on successful download
            db.query('UPDATE files SET download_count = download_count + 1 WHERE id = $1', [fileId])
              .catch(error => console.error('Failed to increment download count:', error));
          }
        });
      } catch {
        return res.status(404).json({ error: 'Physical file not found' });
      }
    }
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Download failed' });
  }
});

router.get('/folder/:folderId', authenticateToken, async (req, res) => {
  try {
    const { folderId } = req.params;

    // Check if user has access to the folder
    const folder = await DatabaseUtils.verifyFolderAccess(folderId, req.user.id);

    if (!folder) {
      return res.status(404).json({ error: 'Folder not found or access denied' });
    }

    // Get all files in the folder and subfolders
    const filesQuery = await db.query(`
      WITH RECURSIVE folder_tree AS (
        SELECT id, name, parent_id, owner_id, name::text as path
        FROM folders
        WHERE id = $1
        
        UNION ALL
        
        SELECT f.id, f.name, f.parent_id, f.owner_id, 
               CASE WHEN ft.path = '' THEN f.name::text ELSE ft.path || '/' || f.name::text END
        FROM folders f
        JOIN folder_tree ft ON f.parent_id = ft.id
      )
      SELECT f.filename, f.filepath, 
             CASE WHEN ft.path = $2 THEN '' ELSE REPLACE(ft.path, $2 || '/', '') END as folder_path
      FROM files f
      JOIN folder_tree ft ON f.folder_id = ft.id
      ORDER BY ft.path, f.filename
    `, [folderId, folder.name]);

    if (filesQuery.rows.length === 0) {
      return res.status(404).json({ error: 'No files found in folder' });
    }

    // Check total size before creating ZIP
    const totalSize = await calculateFilesTotalSize(filesQuery.rows);
    if (totalSize > MAX_DOWNLOAD_SIZE) {
      return res.status(400).json({ 
        error: `Folder is too large to download. Maximum size is ${formatFileSize(MAX_DOWNLOAD_SIZE)}, but folder contains ${formatFileSize(totalSize)}.` 
      });
    }

    // Create ZIP archive of folder contents
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${folder.name}.zip"`);

    archive.pipe(res);

    for (const file of filesQuery.rows) {
      try {
        await fs.access(file.filepath);
        const archivePath = file.folder_path ? `${file.folder_path}/${file.filename}` : file.filename;
        archive.file(file.filepath, { name: archivePath });
      } catch (error) {
        console.error(`File not accessible: ${file.filepath}`);
      }
    }

    await archive.finalize();
  } catch (error) {
    console.error('Folder download error:', error);
    res.status(500).json({ error: 'Folder download failed' });
  }
});

// Check if share requires password
router.get('/public/:token/check', async (req, res) => {
  try {
    const { token } = req.params;

    // Check if share exists and if it requires a password
    const shareQuery = await db.query(`
      SELECT 
        s.share_password IS NOT NULL as requires_password,
        s.expires_at,
        CASE 
          WHEN s.file_id IS NOT NULL THEN 'file'
          WHEN s.folder_id IS NOT NULL THEN 'folder'
        END as type
      FROM shares s
      WHERE s.public_token = $1
        AND (s.expires_at IS NULL OR s.expires_at > NOW())
    `, [token]);

    if (shareQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Share not found or expired' });
    }

    const share = shareQuery.rows[0];
    res.json({
      requires_password: share.requires_password,
      type: share.type,
      expired: false
    });
  } catch (error) {
    console.error('Share check error:', error);
    res.status(500).json({ error: 'Failed to check share' });
  }
});

// Verify share password
router.post('/public/:token/verify', async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    const shareQuery = await db.query(`
      SELECT share_password
      FROM shares
      WHERE public_token = $1
        AND (expires_at IS NULL OR expires_at > NOW())
    `, [token]);

    if (shareQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Share not found or expired' });
    }

    const share = shareQuery.rows[0];
    
    // If no password is set, allow access
    if (!share.share_password) {
      return res.json({ verified: true });
    }

    // Check if provided password matches
    if (password !== share.share_password) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    res.json({ verified: true });
  } catch (error) {
    console.error('Password verification error:', error);
    res.status(500).json({ error: 'Password verification failed' });
  }
});

router.get('/public/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.query;

    // First check for file shares with password verification
    const fileShareQuery = await db.query(`
      SELECT f.filename, f.filepath, f.mime_type, f.encrypted, f.file_id, f.uploader_id, 
             s.expires_at, s.share_password, 'file' as type
      FROM shares s
      JOIN files f ON s.file_id = f.id
      WHERE s.public_token = $1
        AND (s.expires_at IS NULL OR s.expires_at > NOW())
    `, [token]);

    if (fileShareQuery.rows.length > 0) {
      const file = fileShareQuery.rows[0];

      // Check password if required
      if (file.share_password && file.share_password !== password) {
        return res.status(401).json({ error: 'Password required or invalid' });
      }

      // Handle encrypted files with streaming
      if (file.encrypted && file.file_id) {
        try {
          const streamResult = await storageService.retrieveFileStream(file.uploader_id, file.file_id);
          
          // No size limit for individual file downloads via public shares - streaming handles memory efficiently

          res.setHeader('Content-Disposition', `attachment; filename="${streamResult.metadata.originalName}"`);
          res.setHeader('Content-Type', streamResult.metadata.mimeType || 'application/octet-stream');
          res.setHeader('Content-Length', streamResult.metadata.originalSize);
          
          // Stream the decrypted file directly to response
          streamResult.stream.pipe(res);
          
          // Handle stream completion for download counting
          streamResult.stream.on('end', () => {
            // Increment download counter for public downloads
            db.query('UPDATE files SET download_count = download_count + 1 WHERE file_id = $1 AND uploader_id = $2', [file.file_id, file.uploader_id])
              .catch(error => console.error('Failed to increment download count:', error));
          });
          
          // Handle stream errors
          streamResult.stream.on('error', (streamError) => {
            console.error('File streaming failed:', streamError);
            if (!res.headersSent) {
              res.status(500).json({ error: 'File streaming failed' });
            }
          });
          
          // Handle client disconnection
          res.on('close', () => {
            if (!streamResult.stream.destroyed) {
              streamResult.stream.destroy();
            }
          });
          
          return;
        } catch (decryptError) {
          console.error('File decryption failed:', decryptError);
          return res.status(500).json({ error: 'File decryption failed' });
        }
      } else {
        // Legacy unencrypted file
        try {
          await fs.access(file.filepath);
          
          // No size limit for individual file downloads via public shares

          res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
          res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
          res.sendFile(path.resolve(file.filepath), (err) => {
            if (!err) {
              // Increment download counter for public downloads
              db.query('UPDATE files SET download_count = download_count + 1 WHERE file_id = $1 AND uploader_id = $2', [file.file_id, file.uploader_id])
                .catch(error => console.error('Failed to increment download count:', error));
            }
          });
          return;
        } catch {
          return res.status(404).json({ error: 'Physical file not found' });
        }
      }
    }

    // Check for folder shares
    const folderShareQuery = await db.query(`
      SELECT fo.name as folder_name, s.expires_at, s.share_password, 'folder' as type
      FROM shares s
      JOIN folders fo ON s.folder_id = fo.id
      WHERE s.public_token = $1
        AND (s.expires_at IS NULL OR s.expires_at > NOW())
    `, [token]);

    if (folderShareQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Share not found or expired' });
    }

    const folderShare = folderShareQuery.rows[0];
    
    // Check password if required
    if (folderShare.share_password && folderShare.share_password !== password) {
      return res.status(401).json({ error: 'Password required or invalid' });
    }
    
    // Get all files in the folder and subfolders
    const filesQuery = await db.query(`
      WITH RECURSIVE folder_tree AS (
        SELECT f.id, f.name::text as folder_name, f.parent_id, f.owner_id
        FROM folders f
        JOIN shares s ON f.id = s.folder_id
        WHERE s.public_token = $1
        
        UNION ALL
        
        SELECT f.id, f.name::text as folder_name, f.parent_id, f.owner_id
        FROM folders f
        JOIN folder_tree ft ON f.parent_id = ft.id
      )
      SELECT f.filename, f.filepath, f.encrypted, f.file_id, f.uploader_id, f.mime_type, ft.folder_name as folder_path
      FROM files f
      JOIN folder_tree ft ON f.folder_id = ft.id
      ORDER BY ft.folder_name, f.filename
    `, [token]);

    if (filesQuery.rows.length === 0) {
      return res.status(404).json({ error: 'No files found in shared folder' });
    }

    // If folder contains only one file, download it directly instead of zipping
    if (filesQuery.rows.length === 1) {
      const file = filesQuery.rows[0];
      
      // Handle encrypted files with streaming
      if (file.encrypted && file.file_id) {
        try {
          const streamResult = await storageService.retrieveFileStream(file.uploader_id, file.file_id);
          
          // No size limit for individual file downloads from folder shares - streaming handles memory efficiently

          res.setHeader('Content-Disposition', `attachment; filename="${streamResult.metadata.originalName}"`);
          res.setHeader('Content-Type', streamResult.metadata.mimeType || 'application/octet-stream');
          res.setHeader('Content-Length', streamResult.metadata.originalSize);
          
          // Stream the decrypted file directly to response
          streamResult.stream.pipe(res);
          
          // Handle stream completion for download counting
          streamResult.stream.on('end', () => {
            // Increment download counter for folder share downloads
            db.query('UPDATE files SET download_count = download_count + 1 WHERE file_id = $1 AND uploader_id = $2', [file.file_id, file.uploader_id])
              .catch(error => console.error('Failed to increment download count:', error));
          });
          
          // Handle stream errors
          streamResult.stream.on('error', (streamError) => {
            console.error('File streaming failed:', streamError);
            if (!res.headersSent) {
              res.status(500).json({ error: 'File streaming failed' });
            }
          });
          
          // Handle client disconnection
          res.on('close', () => {
            if (!streamResult.stream.destroyed) {
              streamResult.stream.destroy();
            }
          });
          
          return;
        } catch (decryptError) {
          console.error('File decryption failed:', decryptError);
          return res.status(500).json({ error: 'File decryption failed' });
        }
      } else {
        // Legacy unencrypted file
        try {
          await fs.access(file.filepath);
          
          // No size limit for individual file downloads from folder shares

          res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
          res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
          res.sendFile(path.resolve(file.filepath), (err) => {
            if (!err) {
              // Increment download counter for folder share downloads
              db.query('UPDATE files SET download_count = download_count + 1 WHERE file_id = $1 AND uploader_id = $2', [file.file_id, file.uploader_id])
                .catch(error => console.error('Failed to increment download count:', error));
            }
          });
          return;
        } catch (error) {
          console.error(`Single file not accessible: ${file.filepath}`, error);
          return res.status(404).json({ error: 'File not found' });
        }
      }
    }

    // Check total size before creating ZIP
    const totalSize = await calculateFilesTotalSize(filesQuery.rows);
    if (totalSize > MAX_DOWNLOAD_SIZE) {
      return res.status(400).json({ 
        error: `Shared folder is too large to download. Maximum size is ${formatFileSize(MAX_DOWNLOAD_SIZE)}, but folder contains ${formatFileSize(totalSize)}.` 
      });
    }

    // Create ZIP archive of folder contents
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${folderShare.folder_name}.zip"`);

    archive.pipe(res);

    for (const file of filesQuery.rows) {
      try {
        const archivePath = file.folder_path ? `${file.folder_path}/${file.filename}` : file.filename;
        
        if (file.encrypted && file.file_id) {
          // Decrypt and add encrypted file to archive
          try {
            const decryptedFile = await storageService.retrieveFile(file.uploader_id, file.file_id);
            archive.append(decryptedFile.data, { name: archivePath });
          } catch (decryptError) {
            console.error(`File decryption failed for ${file.filename}:`, decryptError);
          }
        } else {
          // Add legacy unencrypted file to archive
          await fs.access(file.filepath);
          archive.file(file.filepath, { name: archivePath });
        }
      } catch (error) {
        console.error(`File not accessible: ${file.filepath}`, error);
      }
    }

    await archive.finalize();
  } catch (error) {
    console.error('Public download error:', error);
    res.status(500).json({ error: 'Download failed' });
  }
});

router.get('/bulk/:shareId', authenticateToken, async (req, res) => {
  try {
    const { shareId } = req.params;

    const filesQuery = await db.query(`
      SELECT f.filename, f.filepath
      FROM shares s
      JOIN files f ON s.file_id = f.id
      WHERE s.id = $1 AND (s.shared_with = $2 OR s.shared_by = $2)
        AND (s.expires_at IS NULL OR s.expires_at > NOW())
    `, [shareId, req.user.id]);

    if (filesQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Share not found or access denied' });
    }

    // Check total size before creating ZIP
    const totalSize = await calculateFilesTotalSize(filesQuery.rows);
    if (totalSize > MAX_DOWNLOAD_SIZE) {
      return res.status(400).json({ 
        error: `Shared files are too large to download. Maximum size is ${formatFileSize(MAX_DOWNLOAD_SIZE)}, but files total ${formatFileSize(totalSize)}.` 
      });
    }

    const archive = archiver('zip', { zlib: { level: 9 } });
    
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="shared-files-${shareId}.zip"`);

    archive.pipe(res);

    for (const file of filesQuery.rows) {
      try {
        await fs.access(file.filepath);
        archive.file(file.filepath, { name: file.filename });
      } catch (error) {
        console.error(`File not accessible: ${file.filepath}`);
      }
    }

    await archive.finalize();
  } catch (error) {
    console.error('Bulk download error:', error);
    res.status(500).json({ error: 'Bulk download failed' });
  }
});

router.get('/public/:token/file/:fileId', async (req, res) => {
  try {
    const { token, fileId } = req.params;

    // Verify the token gives access to the file
    const shareQuery = await db.query(`
      WITH RECURSIVE folder_tree AS (
        SELECT fo.id, fo.name, fo.parent_id, fo.owner_id
        FROM folders fo
        JOIN shares s ON fo.id = s.folder_id
        WHERE s.public_token = $1
          AND (s.expires_at IS NULL OR s.expires_at > NOW())
        
        UNION ALL
        
        SELECT f.id, f.name, f.parent_id, f.owner_id
        FROM folders f
        JOIN folder_tree ft ON f.parent_id = ft.id
      )
      SELECT f.filename, f.filepath, f.mime_type
      FROM files f
      JOIN folder_tree ft ON f.folder_id = ft.id
      WHERE f.id = $2
    `, [token, fileId]);

    if (shareQuery.rows.length === 0) {
      return res.status(404).json({ error: 'File not found in shared folder or access denied' });
    }

    const file = shareQuery.rows[0];

    try {
      await fs.access(file.filepath);
      
      // No size limit for individual file downloads from public folder shares
      
    } catch {
      return res.status(404).json({ error: 'Physical file not found' });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
    res.sendFile(path.resolve(file.filepath));
  } catch (error) {
    console.error('Public file download error:', error);
    res.status(500).json({ error: 'Download failed' });
  }
});

module.exports = router;