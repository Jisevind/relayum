const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs').promises;
const db = require('../models/database');
const { authenticateToken } = require('../middleware/auth');
const DatabaseUtils = require('../utils/dbUtils');
const StorageService = require('../utils/storageService');
const { generateShareMetadata, validateTokenFormat, isExpired } = require('../utils/tokenUtils');
const EncryptionService = require('../utils/encryptionService');
const { parseFileSize } = require('../utils/fileSizeUtils');
const encryptionService = new EncryptionService();


const router = express.Router();
const storageService = new StorageService();

// Configure multer for anonymous uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, process.env.UPLOAD_PATH || './uploads');
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseFileSize(process.env.ANONYMOUS_MAX_FILE_SIZE || process.env.MAX_FILE_SIZE || '100MB'),
  },
  fileFilter: (req, file, cb) => {
    // Check file blacklist
    const blacklist = (process.env.FILE_BLACKLIST || '').split(',').map(ext => ext.trim().toLowerCase());
    const fileExt = path.extname(file.originalname).toLowerCase();
    
    if (blacklist.includes(fileExt)) {
      return cb(new Error(`File type ${fileExt} is not allowed`));
    }
    
    cb(null, true);
  }
});

// Anonymous upload endpoint (no authentication required)
router.post('/upload', upload.array('files'), async (req, res) => {
  try {
    // Check if anonymous sharing is enabled
    if (process.env.ALLOW_ANONYMOUS_SHARING === 'false') {
      return res.status(403).json({ error: 'Anonymous sharing is disabled' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const { password } = req.body;
    const uploadedFiles = [];
    
    // Generate a unique share token for this anonymous upload
    const shareToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + parseInt(process.env.ANONYMOUS_SHARE_EXPIRATION_DAYS || 7));

    // Create anonymous share record
    const shareResult = await db.query(`
      INSERT INTO anonymous_shares (
        share_token, expires_at, access_count, max_access_count, 
        password_hash, created_at
      ) VALUES ($1, $2, $3, $4, $5, NOW()) 
      RETURNING id, share_token
    `, [
      shareToken,
      expiresAt,
      0,
      parseInt(process.env.ANONYMOUS_SHARE_MAX_ACCESS || 1000),
      password || null
    ]);

    const shareId = shareResult.rows[0].id;

    // Process each uploaded file
    for (const file of req.files) {
      try {
        // Virus scan the file before processing
        const { getVirusScanner } = require('../services/virusScanner');
        const virusScanner = getVirusScanner();
        
        if (virusScanner.enabled) {
          console.log(`🦠 Scanning anonymous file for viruses: ${file.originalname}`);
          try {
            const scanResult = await virusScanner.scanFile(file.path, {
              fileSize: file.size,
              filename: file.originalname
            });
            
            console.log(`🦠 Anonymous scan result for ${file.originalname}:`, {
              status: scanResult.status,
              clean: scanResult.clean,
              threat: scanResult.threat
            });
            
            // Block upload if virus detected
            if (!scanResult.clean && scanResult.threat) {
              console.log(`❌ VIRUS DETECTED in anonymous upload ${file.originalname}: ${scanResult.threat}`);
              // Clean up temp file and skip
              try {
                await fs.unlink(file.path);
              } catch (unlinkError) {
                console.error('Error cleaning up infected anonymous file:', unlinkError);
              }
              continue; // Skip this file
            }
          } catch (scanError) {
            console.error(`🦠 Anonymous virus scan failed for ${file.originalname}:`, scanError);
            // Continue processing - don't block upload on scan errors
          }
        }
        
        // Encrypt the file
        const encryptedPath = `${file.path}.enc`;
        const encryptionKey = crypto.randomBytes(32).toString('hex');
        
        // Read, encrypt, and save the file
        const fileBuffer = await fs.readFile(file.path);
        const fileKey = Buffer.from(encryptionKey, 'hex');
        const encryptionResult = encryptionService.encryptData(fileKey, fileBuffer);
        
        // Combine IV + tag + encrypted data for storage
        const combinedBuffer = Buffer.concat([
          encryptionResult.iv,
          encryptionResult.tag,
          encryptionResult.encryptedData
        ]);
        
        await fs.writeFile(encryptedPath, combinedBuffer);
        
        // Remove original unencrypted file
        await fs.unlink(file.path);

        // Insert file record linked to anonymous share
        const fileResult = await db.query(`
          INSERT INTO anonymous_files (
            anonymous_share_id, original_filename, file_path, file_size, 
            encryption_key, mime_type, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
          RETURNING id
        `, [
          shareId,
          file.originalname,
          encryptedPath,
          file.size,
          encryptionKey,
          file.mimetype
        ]);

        uploadedFiles.push({
          id: fileResult.rows[0].id,
          filename: file.originalname,
          size: file.size,
          type: file.mimetype
        });

      } catch (fileError) {
        console.error('Error processing file:', file.originalname, fileError);
        // Clean up the file if it exists
        try {
          await fs.unlink(file.path);
        } catch (unlinkError) {
          console.error('Error cleaning up file:', unlinkError);
        }
      }
    }

    if (uploadedFiles.length === 0) {
      return res.status(500).json({ error: 'Failed to process any files' });
    }

    // Return the share URL (use HTTPS and frontend port in development)
    const protocol = process.env.HTTPS === 'true' ? 'https' : req.protocol;
    const host = process.env.NODE_ENV === 'development' 
      ? req.get('host').replace(':3010', ':3001')  // Use frontend port in development
      : req.get('host');
    const shareUrl = `${protocol}://${host}/anonymous/${shareToken}`;

    res.json({
      message: 'Files uploaded successfully',
      share_url: shareUrl,
      share_token: shareToken,
      files: uploadedFiles,
      expires_at: expiresAt,
      password_protected: !!password
    });

  } catch (error) {
    console.error('Anonymous upload error:', error);
    
    // Clean up any uploaded files on error
    if (req.files) {
      for (const file of req.files) {
        try {
          await fs.unlink(file.path);
        } catch (unlinkError) {
          console.error('Error cleaning up file on error:', unlinkError);
        }
      }
    }
    
    res.status(500).json({ error: 'Failed to upload files' });
  }
});

// Create anonymous share for a file
router.post('/share/file/:fileId', authenticateToken, async (req, res) => {
  try {
    // Check if anonymous sharing is enabled
    if (process.env.ALLOW_ANONYMOUS_SHARING === 'false') {
      return res.status(403).json({ error: 'Anonymous sharing is disabled' });
    }

    const fileId = parseInt(req.params.fileId);
    const { expiration_days, max_access_count } = req.body;

    // Verify file ownership
    const file = await DatabaseUtils.verifyFileOwnership(fileId, req.user.id);
    if (!file) {
      return res.status(404).json({ error: 'File not found or not owned by you' });
    }

    // Generate share metadata
    const shareData = generateShareMetadata({
      fileId,
      createdBy: req.user.id,
      expirationDays: expiration_days,
      maxAccess: max_access_count
    });

    // Create anonymous share
    const shareResult = await db.query(`
      INSERT INTO anonymous_shares (
        share_token, file_id, created_by, expires_at, max_access_count, access_count
      ) VALUES ($1, $2, $3, $4, $5, $6) 
      RETURNING *
    `, [
      shareData.share_token,
      shareData.file_id,
      shareData.created_by,
      shareData.expires_at,
      shareData.max_access_count,
      shareData.access_count
    ]);

    const share = shareResult.rows[0];

    res.status(201).json({
      message: 'Anonymous file share created successfully',
      share: {
        token: share.share_token,
        file_id: share.file_id,
        filename: file.filename,
        expires_at: share.expires_at,
        max_access_count: share.max_access_count,
        access_count: share.access_count,
        created_at: share.created_at,
        public_url: `${process.env.HTTPS === 'true' ? 'https' : req.protocol}://${req.get('host')}/api/anonymous/access/${share.share_token}`
      }
    });
  } catch (error) {
    console.error('Create anonymous file share error:', error);
    res.status(500).json({ error: 'Failed to create anonymous file share' });
  }
});

// Create anonymous share for a folder
router.post('/share/folder/:folderId', authenticateToken, async (req, res) => {
  try {
    // Check if anonymous sharing is enabled
    if (process.env.ALLOW_ANONYMOUS_SHARING === 'false') {
      return res.status(403).json({ error: 'Anonymous sharing is disabled' });
    }

    const folderId = parseInt(req.params.folderId);
    const { expiration_days, max_access_count } = req.body;

    // Verify folder ownership
    const folder = await DatabaseUtils.verifyFolderOwnership(folderId, req.user.id);
    if (!folder) {
      return res.status(404).json({ error: 'Folder not found or not owned by you' });
    }

    // Generate share metadata
    const shareData = generateShareMetadata({
      folderId,
      createdBy: req.user.id,
      expirationDays: expiration_days,
      maxAccess: max_access_count
    });

    // Create anonymous share
    const shareResult = await db.query(`
      INSERT INTO anonymous_shares (
        share_token, folder_id, created_by, expires_at, max_access_count, access_count
      ) VALUES ($1, $2, $3, $4, $5, $6) 
      RETURNING *
    `, [
      shareData.share_token,
      shareData.folder_id,
      shareData.created_by,
      shareData.expires_at,
      shareData.max_access_count,
      shareData.access_count
    ]);

    const share = shareResult.rows[0];

    res.status(201).json({
      message: 'Anonymous folder share created successfully',
      share: {
        token: share.share_token,
        folder_id: share.folder_id,
        folder_name: folder.name,
        expires_at: share.expires_at,
        max_access_count: share.max_access_count,
        access_count: share.access_count,
        created_at: share.created_at,
        public_url: `${process.env.HTTPS === 'true' ? 'https' : req.protocol}://${req.get('host')}/api/anonymous/access/${share.share_token}`
      }
    });
  } catch (error) {
    console.error('Create anonymous folder share error:', error);
    res.status(500).json({ error: 'Failed to create anonymous folder share' });
  }
});

// Access anonymous share (no authentication required)
router.get('/access/:token', async (req, res) => {
  try {
    const token = req.params.token;

    // Validate token format
    if (!validateTokenFormat(token)) {
      return res.status(400).json({ error: 'Invalid share token format' });
    }

    // Get share info
    const shareResult = await db.query(`
      SELECT ans.*, f.filename, f.size as file_size, f.mime_type, fo.name as folder_name
      FROM anonymous_shares ans
      LEFT JOIN files f ON ans.file_id = f.id
      LEFT JOIN folders fo ON ans.folder_id = fo.id
      WHERE ans.share_token = $1
    `, [token]);

    if (shareResult.rows.length === 0) {
      return res.status(404).json({ error: 'Share not found' });
    }

    const share = shareResult.rows[0];

    // Check if share has expired
    if (isExpired(share.expires_at)) {
      return res.status(410).json({ error: 'Share has expired' });
    }

    // Check access count limit
    if (share.max_access_count && share.access_count >= share.max_access_count) {
      return res.status(429).json({ error: 'Share access limit exceeded' });
    }

    // Increment access count
    await db.query(`
      UPDATE anonymous_shares 
      SET access_count = access_count + 1 
      WHERE share_token = $1
    `, [token]);

    // Return share information
    const shareInfo = {
      token: share.share_token,
      type: share.file_id ? 'file' : 'folder',
      expires_at: share.expires_at,
      access_count: share.access_count + 1,
      max_access_count: share.max_access_count,
      created_at: share.created_at
    };

    if (share.file_id) {
      shareInfo.file = {
        id: share.file_id,
        filename: share.filename,
        size: share.file_size,
        mime_type: share.mime_type,
        download_url: `${req.protocol}://${req.get('host')}/api/anonymous/download/${token}`
      };
    } else {
      shareInfo.folder = {
        id: share.folder_id,
        name: share.folder_name,
        browse_url: `${req.protocol}://${req.get('host')}/api/anonymous/browse/${token}`
      };
    }

    res.json({
      message: 'Share accessed successfully',
      share: shareInfo
    });
  } catch (error) {
    console.error('Access anonymous share error:', error);
    res.status(500).json({ error: 'Failed to access share' });
  }
});

// Download file from anonymous share (no authentication required)
router.get('/download/:token', async (req, res) => {
  try {
    const token = req.params.token;

    // Validate token format
    if (!validateTokenFormat(token)) {
      return res.status(400).json({ error: 'Invalid share token format' });
    }

    // Get share and file info
    const shareResult = await db.query(`
      SELECT ans.*, f.filename, f.filepath, f.file_id, f.encrypted, f.uploader_id, f.size, f.mime_type
      FROM anonymous_shares ans
      JOIN files f ON ans.file_id = f.id
      WHERE ans.share_token = $1 AND ans.file_id IS NOT NULL
    `, [token]);

    if (shareResult.rows.length === 0) {
      return res.status(404).json({ error: 'File share not found' });
    }

    const share = shareResult.rows[0];

    // Check if share has expired
    if (isExpired(share.expires_at)) {
      return res.status(410).json({ error: 'Share has expired' });
    }

    // Check access count limit
    if (share.max_access_count && share.access_count >= share.max_access_count) {
      return res.status(429).json({ error: 'Share access limit exceeded' });
    }

    // Increment access count
    await db.query(`
      UPDATE anonymous_shares 
      SET access_count = access_count + 1 
      WHERE share_token = $1
    `, [token]);

    // Serve the file
    if (share.encrypted && share.file_id) {
      // Serve encrypted file
      const fileStream = await storageService.getFileStream(share.uploader_id, share.file_id);
      
      res.setHeader('Content-Disposition', `attachment; filename="${share.filename}"`);
      res.setHeader('Content-Type', share.mime_type || 'application/octet-stream');
      res.setHeader('Content-Length', share.size);
      
      fileStream.pipe(res);
    } else {
      // Serve legacy unencrypted file
      res.download(share.filepath, share.filename);
    }
  } catch (error) {
    console.error('Download anonymous share error:', error);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

// Browse folder from anonymous share (no authentication required)
router.get('/browse/:token', async (req, res) => {
  try {
    const token = req.params.token;

    // Validate token format
    if (!validateTokenFormat(token)) {
      return res.status(400).json({ error: 'Invalid share token format' });
    }

    // Get share and folder info
    const shareResult = await db.query(`
      SELECT ans.*, fo.name as folder_name, fo.owner_id
      FROM anonymous_shares ans
      JOIN folders fo ON ans.folder_id = fo.id
      WHERE ans.share_token = $1 AND ans.folder_id IS NOT NULL
    `, [token]);

    if (shareResult.rows.length === 0) {
      return res.status(404).json({ error: 'Folder share not found' });
    }

    const share = shareResult.rows[0];

    // Check if share has expired
    if (isExpired(share.expires_at)) {
      return res.status(410).json({ error: 'Share has expired' });
    }

    // Check access count limit
    if (share.max_access_count && share.access_count >= share.max_access_count) {
      return res.status(429).json({ error: 'Share access limit exceeded' });
    }

    // Increment access count
    await db.query(`
      UPDATE anonymous_shares 
      SET access_count = access_count + 1 
      WHERE share_token = $1
    `, [token]);

    // Get folder contents
    const files = await DatabaseUtils.getUserFiles(share.owner_id, share.folder_id);
    const subfolders = await DatabaseUtils.getUserFolders(share.owner_id, share.folder_id);

    res.json({
      message: 'Folder accessed successfully',
      share: {
        token: share.share_token,
        type: 'folder',
        folder_name: share.folder_name,
        expires_at: share.expires_at,
        access_count: share.access_count + 1,
        max_access_count: share.max_access_count
      },
      contents: {
        files: files.map(file => ({
          id: file.id,
          filename: file.filename,
          size: file.size,
          mime_type: file.mime_type,
          created_at: file.created_at,
          download_url: `${req.protocol}://${req.get('host')}/api/anonymous/download-file/${token}/${file.id}`
        })),
        folders: subfolders.map(folder => ({
          id: folder.id,
          name: folder.name,
          created_at: folder.created_at
        }))
      }
    });
  } catch (error) {
    console.error('Browse anonymous share error:', error);
    res.status(500).json({ error: 'Failed to browse folder' });
  }
});

// Download specific file from folder share
router.get('/download-file/:token/:fileId', async (req, res) => {
  try {
    const token = req.params.token;
    const fileId = parseInt(req.params.fileId);

    // Validate token format
    if (!validateTokenFormat(token)) {
      return res.status(400).json({ error: 'Invalid share token format' });
    }

    // Get share info and verify file is in shared folder
    const shareResult = await db.query(`
      SELECT ans.*, fo.owner_id, f.filename, f.filepath, f.file_id, f.encrypted, f.uploader_id, f.size, f.mime_type
      FROM anonymous_shares ans
      JOIN folders fo ON ans.folder_id = fo.id
      JOIN files f ON f.uploader_id = fo.owner_id 
      WHERE ans.share_token = $1 AND ans.folder_id IS NOT NULL AND f.id = $2
      AND (f.folder_id = ans.folder_id OR f.folder_id IN (
        SELECT id FROM folders WHERE parent_id = ans.folder_id AND owner_id = fo.owner_id
      ))
    `, [token, fileId]);

    if (shareResult.rows.length === 0) {
      return res.status(404).json({ error: 'File not found in shared folder' });
    }

    const share = shareResult.rows[0];

    // Check if share has expired
    if (isExpired(share.expires_at)) {
      return res.status(410).json({ error: 'Share has expired' });
    }

    // Check access count limit
    if (share.max_access_count && share.access_count >= share.max_access_count) {
      return res.status(429).json({ error: 'Share access limit exceeded' });
    }

    // Serve the file
    if (share.encrypted && share.file_id) {
      // Serve encrypted file
      const fileStream = await storageService.getFileStream(share.uploader_id, share.file_id);
      
      res.setHeader('Content-Disposition', `attachment; filename="${share.filename}"`);
      res.setHeader('Content-Type', share.mime_type || 'application/octet-stream');
      res.setHeader('Content-Length', share.size);
      
      fileStream.pipe(res);
    } else {
      // Serve legacy unencrypted file
      res.download(share.filepath, share.filename);
    }
  } catch (error) {
    console.error('Download file from folder share error:', error);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

// Get user's anonymous shares
router.get('/my-shares', authenticateToken, async (req, res) => {
  try {
    const shares = await db.query(`
      SELECT ans.*, f.filename, fo.name as folder_name
      FROM anonymous_shares ans
      LEFT JOIN files f ON ans.file_id = f.id
      LEFT JOIN folders fo ON ans.folder_id = fo.id
      WHERE ans.created_by = $1
      ORDER BY ans.created_at DESC
    `, [req.user.id]);

    const sharesList = shares.rows.map(share => ({
      id: share.id,
      token: share.share_token,
      type: share.file_id ? 'file' : 'folder',
      name: share.filename || share.folder_name,
      expires_at: share.expires_at,
      is_expired: isExpired(share.expires_at),
      access_count: share.access_count,
      max_access_count: share.max_access_count,
      created_at: share.created_at,
      public_url: `${req.protocol}://${req.get('host')}/api/anonymous/access/${share.share_token}`
    }));

    res.json({
      shares: sharesList,
      total: sharesList.length,
      active: sharesList.filter(s => !s.is_expired).length,
      expired: sharesList.filter(s => s.is_expired).length
    });
  } catch (error) {
    console.error('Get user anonymous shares error:', error);
    res.status(500).json({ error: 'Failed to get anonymous shares' });
  }
});

// Delete anonymous share
router.delete('/share/:shareId', authenticateToken, async (req, res) => {
  try {
    const shareId = parseInt(req.params.shareId);

    // Verify share ownership
    const shareResult = await db.query(`
      SELECT * FROM anonymous_shares 
      WHERE id = $1 AND created_by = $2
    `, [shareId, req.user.id]);

    if (shareResult.rows.length === 0) {
      return res.status(404).json({ error: 'Share not found or not owned by you' });
    }

    // Delete the share
    await db.query('DELETE FROM anonymous_shares WHERE id = $1', [shareId]);

    res.json({ message: 'Anonymous share deleted successfully' });
  } catch (error) {
    console.error('Delete anonymous share error:', error);
    res.status(500).json({ error: 'Failed to delete anonymous share' });
  }
});

// Access anonymous upload share (no authentication required)
router.post('/access/:token', async (req, res) => {
  try {
    const token = req.params.token;
    const { password } = req.body;

    // Get anonymous share
    const shareResult = await db.query(`
      SELECT ans.*, COUNT(af.id) as file_count
      FROM anonymous_shares ans
      LEFT JOIN anonymous_files af ON ans.id = af.anonymous_share_id
      WHERE ans.share_token = $1
      GROUP BY ans.id
    `, [token]);

    if (shareResult.rows.length === 0) {
      return res.status(404).json({ error: 'Share not found' });
    }

    const share = shareResult.rows[0];

    // Check if expired
    if (new Date(share.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Share has expired' });
    }

    // Check access limit
    if (share.max_access_count && share.access_count >= share.max_access_count) {
      return res.status(410).json({ error: 'Access limit exceeded' });
    }

    // Check password if required
    if (share.password_hash) {
      if (!password) {
        return res.status(401).json({ error: 'Password required' });
      }
      
      // Simple password comparison for anonymous shares
      if (password !== share.password_hash) {
        return res.status(401).json({ error: 'Invalid password' });
      }
    }

    // Get files
    const filesResult = await db.query(`
      SELECT id, original_filename as filename, file_size as size, mime_type, created_at
      FROM anonymous_files
      WHERE anonymous_share_id = $1
      ORDER BY created_at ASC
    `, [share.id]);

    // Increment access count
    await db.query(`
      UPDATE anonymous_shares 
      SET access_count = access_count + 1 
      WHERE share_token = $1
    `, [token]);

    res.json({
      share_token: token,
      expires_at: share.expires_at,
      access_count: share.access_count + 1,
      max_access_count: share.max_access_count,
      password_protected: !!share.password_hash,
      files: filesResult.rows,
      created_at: share.created_at
    });

  } catch (error) {
    console.error('Access anonymous share error:', error);
    res.status(500).json({ error: 'Failed to access share' });
  }
});

// Download single file from anonymous upload
router.post('/download/:token/:fileId', async (req, res) => {
  try {
    const { token, fileId } = req.params;
    const { password } = req.body;

    // Get share and file
    const result = await db.query(`
      SELECT ans.*, af.original_filename, af.file_path, af.file_size, af.encryption_key, af.mime_type
      FROM anonymous_shares ans
      JOIN anonymous_files af ON ans.id = af.anonymous_share_id
      WHERE ans.share_token = $1 AND af.id = $2
    `, [token, parseInt(fileId)]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const share = result.rows[0];

    // Check if expired
    if (new Date(share.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Share has expired' });
    }

    // Check password if required
    if (share.password_hash && password !== share.password_hash) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    // Read and decrypt file
    const combinedBuffer = await fs.readFile(share.file_path);
    const fileKey = Buffer.from(share.encryption_key, 'hex');
    
    // Extract IV, tag, and encrypted data
    const iv = combinedBuffer.slice(0, 16);
    const tag = combinedBuffer.slice(16, 32);
    const encryptedData = combinedBuffer.slice(32);
    
    const decryptedBuffer = encryptionService.decryptData(fileKey, encryptedData, iv, tag);

    res.setHeader('Content-Disposition', `attachment; filename="${share.original_filename}"`);
    res.setHeader('Content-Type', share.mime_type || 'application/octet-stream');
    res.setHeader('Content-Length', share.file_size);
    
    res.send(decryptedBuffer);

  } catch (error) {
    console.error('Download anonymous file error:', error);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

// Download all files from anonymous upload as zip
router.post('/download/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    // Get share and files
    const result = await db.query(`
      SELECT ans.*, af.id as file_id, af.original_filename, af.file_path, af.file_size, af.encryption_key, af.mime_type
      FROM anonymous_shares ans
      JOIN anonymous_files af ON ans.id = af.anonymous_share_id
      WHERE ans.share_token = $1
      ORDER BY af.created_at ASC
    `, [token]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Share not found' });
    }

    const share = result.rows[0];

    // Check if expired
    if (new Date(share.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Share has expired' });
    }

    // Check password if required
    if (share.password_hash && password !== share.password_hash) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    // If only one file, serve it directly
    if (result.rows.length === 1) {
      const file = result.rows[0];
      const combinedBuffer = await fs.readFile(file.file_path);
      const fileKey = Buffer.from(file.encryption_key, 'hex');
      
      // Extract IV, tag, and encrypted data
      const iv = combinedBuffer.slice(0, 16);
      const tag = combinedBuffer.slice(16, 32);
      const encryptedData = combinedBuffer.slice(32);
      
      const decryptedBuffer = encryptionService.decryptData(fileKey, encryptedData, iv, tag);

      res.setHeader('Content-Disposition', `attachment; filename="${file.original_filename}"`);
      res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
      res.setHeader('Content-Length', file.file_size);
      
      return res.send(decryptedBuffer);
    }

    // Multiple files - create zip
    const archiver = require('archiver');
    const archive = archiver('zip', { zlib: { level: 9 } });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="anonymous-share-${token.slice(0, 8)}.zip"`);

    archive.pipe(res);

    // Add each file to the archive
    for (const file of result.rows) {
      try {
        const combinedBuffer = await fs.readFile(file.file_path);
        const fileKey = Buffer.from(file.encryption_key, 'hex');
        
        // Extract IV, tag, and encrypted data
        const iv = combinedBuffer.slice(0, 16);
        const tag = combinedBuffer.slice(16, 32);
        const encryptedData = combinedBuffer.slice(32);
        
        const decryptedBuffer = encryptionService.decryptData(fileKey, encryptedData, iv, tag);
        archive.append(decryptedBuffer, { name: file.original_filename });
      } catch (fileError) {
        console.error('Error adding file to archive:', file.original_filename, fileError);
      }
    }

    archive.finalize();

  } catch (error) {
    console.error('Download anonymous share archive error:', error);
    res.status(500).json({ error: 'Failed to download files' });
  }
});

module.exports = router;