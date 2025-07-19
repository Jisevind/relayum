const express = require('express');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const db = require('../models/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const DatabaseUtils = require('../utils/dbUtils');

// Generate a more secure token
const generateSecureToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

const router = express.Router();

router.post('/', authenticateToken, async (req, res) => {
  try {
    const { fileId, folderId, sharedWith, expiresAt, isPublic, sharePassword } = req.body;

    if (!fileId && !folderId) {
      return res.status(400).json({ error: 'Either File ID or Folder ID is required' });
    }

    if (fileId && folderId) {
      return res.status(400).json({ error: 'Cannot share both file and folder in the same request' });
    }

    // Handle expiration date
    let expirationDate = null;
    if (expiresAt && expiresAt.trim() !== '') {
      expirationDate = new Date(expiresAt);
      if (isNaN(expirationDate.getTime())) {
        return res.status(400).json({ error: 'Invalid expiration date format' });
      }
      if (expirationDate <= new Date()) {
        return res.status(400).json({ error: 'Expiration date must be in the future' });
      }
    }

    let shareData = {
      shared_by: req.user.id,
      expires_at: expirationDate,
      share_password: sharePassword || null
    };

    // Handle file sharing
    if (fileId) {
      const file = await DatabaseUtils.verifyFileOwnership(fileId, req.user.id);

      if (!file) {
        return res.status(404).json({ error: 'File not found or not owned by you' });
      }
      
      shareData.file_id = fileId;
      shareData.folder_id = null;
    }
    
    // Handle folder sharing
    if (folderId) {
      const folder = await DatabaseUtils.verifyFolderOwnership(folderId, req.user.id);

      if (!folder) {
        return res.status(404).json({ error: 'Folder not found or not owned by you' });
      }
      
      shareData.folder_id = folderId;
      shareData.file_id = null;
    }

    if (isPublic) {
      shareData.public_token = generateSecureToken();
      shareData.shared_with = null;
      
      const share = await db.query(
        `INSERT INTO shares (file_id, folder_id, shared_by, shared_with, public_token, expires_at, share_password) 
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [shareData.file_id, shareData.folder_id, shareData.shared_by, shareData.shared_with, shareData.public_token, shareData.expires_at, shareData.share_password]
      );

      return res.status(201).json({
        message: 'Public share created successfully',
        share: share.rows[0]
      });
    } else {
      // Handle multiple users
      const usernames = Array.isArray(sharedWith) ? sharedWith : [sharedWith];
      
      if (!usernames || usernames.length === 0) {
        return res.status(400).json({ error: 'Recipient username(s) required for private shares' });
      }

      const createdShares = [];
      
      for (const username of usernames) {
        const recipient = await DatabaseUtils.getUserByName(username);
        if (!recipient) {
          return res.status(404).json({ error: `Recipient user '${username}' not found` });
        }

        const userShareData = {
          ...shareData,
          shared_with: recipient.id,
          public_token: null,
          private_token: generateSecureToken()
        };

        const share = await db.query(
          `INSERT INTO shares (file_id, folder_id, shared_by, shared_with, public_token, private_token, expires_at, is_viewed, share_password) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
          [userShareData.file_id, userShareData.folder_id, userShareData.shared_by, userShareData.shared_with, userShareData.public_token, userShareData.private_token, userShareData.expires_at, false, userShareData.share_password]
        );

        createdShares.push(share.rows[0]);
      }

      res.status(201).json({
        message: `Share created successfully for ${createdShares.length} user(s)`,
        shares: createdShares
      });
    }
  } catch (error) {
    console.error('Create share error:', error);
    res.status(500).json({ error: 'Failed to create share' });
  }
});

router.get('/sent', authenticateToken, async (req, res) => {
  try {
    const shares = await db.query(`
      SELECT 
        s.id, s.expires_at, s.created_at, s.public_token, s.private_token,
        f.id as file_id, f.filename, f.size, f.mime_type, f.download_count,
        fo.id as folder_id, fo.name as folder_name,
        u.username as shared_with_username
      FROM shares s
      LEFT JOIN files f ON s.file_id = f.id
      LEFT JOIN folders fo ON s.folder_id = fo.id
      LEFT JOIN users u ON s.shared_with = u.id
      WHERE s.shared_by = $1
      ORDER BY s.created_at DESC
    `, [req.user.id]);

    res.json({ shares: shares.rows });
  } catch (error) {
    console.error('Get sent shares error:', error);
    res.status(500).json({ error: 'Failed to retrieve sent shares' });
  }
});

// Get unviewed count only (for notification badge)
router.get('/received/unviewed-count', authenticateToken, async (req, res) => {
  try {
    const unviewedCount = await db.query(`
      SELECT COUNT(*) as count
      FROM shares 
      WHERE shared_with = $1 
        AND is_viewed = FALSE
        AND (expires_at IS NULL OR expires_at > NOW())
    `, [req.user.id]);

    res.json({ 
      unviewedCount: parseInt(unviewedCount.rows[0].count)
    });
  } catch (error) {
    console.error('Get unviewed count error:', error);
    res.status(500).json({ error: 'Failed to retrieve unviewed count' });
  }
});

router.get('/received', authenticateToken, async (req, res) => {
  try {
    const shares = await db.query(`
      SELECT 
        s.id, s.expires_at, s.created_at, s.is_viewed, s.private_token,
        f.id as file_id, f.filename, f.size, f.mime_type, f.download_count,
        fo.id as folder_id, fo.name as folder_name,
        u.username as shared_by_username
      FROM shares s
      LEFT JOIN files f ON s.file_id = f.id
      LEFT JOIN folders fo ON s.folder_id = fo.id
      JOIN users u ON s.shared_by = u.id
      WHERE s.shared_with = $1 
        AND (s.expires_at IS NULL OR s.expires_at > NOW())
      ORDER BY s.created_at DESC
    `, [req.user.id]);

    // Count unviewed shares
    const unviewedCount = await db.query(`
      SELECT COUNT(*) as count
      FROM shares 
      WHERE shared_with = $1 
        AND is_viewed = FALSE
        AND (expires_at IS NULL OR expires_at > NOW())
    `, [req.user.id]);

    // Mark all unviewed shares as viewed when user visits the received shares list
    await db.query(`
      UPDATE shares 
      SET is_viewed = TRUE, viewed_at = NOW() 
      WHERE shared_with = $1 AND is_viewed = FALSE
        AND (expires_at IS NULL OR expires_at > NOW())
    `, [req.user.id]);

    res.json({ 
      shares: shares.rows.map(share => ({ ...share, is_viewed: true })), // Update client-side state
      unviewedCount: 0 // Reset to 0 since we just marked everything as viewed
    });
  } catch (error) {
    console.error('Get received shares error:', error);
    res.status(500).json({ error: 'Failed to retrieve received shares' });
  }
});

router.get('/all', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const shares = await db.query(`
      SELECT 
        s.id, s.expires_at, s.created_at, s.public_token, s.private_token,
        f.id as file_id, f.filename, f.size, f.mime_type,
        fo.id as folder_id, fo.name as folder_name,
        u1.username as shared_by_username,
        u2.username as shared_with_username
      FROM shares s
      LEFT JOIN files f ON s.file_id = f.id
      LEFT JOIN folders fo ON s.folder_id = fo.id
      JOIN users u1 ON s.shared_by = u1.id
      LEFT JOIN users u2 ON s.shared_with = u2.id
      ORDER BY s.created_at DESC
    `);

    res.json({ shares: shares.rows });
  } catch (error) {
    console.error('Get all shares error:', error);
    res.status(500).json({ error: 'Failed to retrieve all shares' });
  }
});

router.get('/public/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.query;
    const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;

    const share = await db.query(`
      SELECT 
        s.id, s.expires_at, s.created_at, s.share_password,
        f.id as file_id, f.filename, f.size, f.mime_type, f.filepath,
        fo.id as folder_id, fo.name as folder_name
      FROM shares s
      LEFT JOIN files f ON s.file_id = f.id
      LEFT JOIN folders fo ON s.folder_id = fo.id
      WHERE s.public_token = $1
        AND (s.expires_at IS NULL OR s.expires_at > NOW())
    `, [token]);

    if (share.rows.length === 0) {
      return res.status(404).json({ error: 'Share not found or expired' });
    }

    const shareData = share.rows[0];

    // Check password if required
    if (shareData.share_password && shareData.share_password !== password) {
      return res.status(401).json({ error: 'Password required or invalid' });
    }

    // Log access for security monitoring

    const { filepath, share_password, ...shareInfo } = shareData;
    res.json({ share: shareInfo });
  } catch (error) {
    console.error('Get public share error:', error);
    res.status(500).json({ error: 'Failed to retrieve public share' });
  }
});

router.get('/public/:token/contents', async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.query;

    // First verify the share exists and is a folder
    const shareQuery = await db.query(`
      SELECT fo.id as folder_id, fo.name as folder_name, s.expires_at, s.share_password
      FROM shares s
      JOIN folders fo ON s.folder_id = fo.id
      WHERE s.public_token = $1
        AND (s.expires_at IS NULL OR s.expires_at > NOW())
    `, [token]);

    if (shareQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Folder share not found or expired' });
    }

    const shareData = shareQuery.rows[0];

    // Check password if required
    if (shareData.share_password && shareData.share_password !== password) {
      return res.status(401).json({ error: 'Password required or invalid' });
    }

    const { folder_id } = shareData;

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
      SELECT f.id, f.filename, f.size, f.mime_type, f.created_at,
             CASE WHEN ft.path = $2 THEN '' ELSE REPLACE(ft.path, $2 || '/', '') END as folder_path
      FROM files f
      JOIN folder_tree ft ON f.folder_id = ft.id
      ORDER BY ft.path, f.filename
    `, [folder_id, shareQuery.rows[0].folder_name]);

    res.json({ 
      folder: shareQuery.rows[0],
      files: filesQuery.rows 
    });
  } catch (error) {
    console.error('Get public folder contents error:', error);
    res.status(500).json({ error: 'Failed to retrieve folder contents' });
  }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const shareId = req.params.id;

    const share = await DatabaseUtils.verifyShareOwnership(shareId, req.user.id);

    if (!share) {
      return res.status(404).json({ error: 'Share not found or not owned by you' });
    }

    await DatabaseUtils.deleteShare(shareId);

    res.json({ message: 'Share deleted successfully' });
  } catch (error) {
    console.error('Delete share error:', error);
    res.status(500).json({ error: 'Failed to delete share' });
  }
});

// Delete received share (only for the recipient)
router.delete('/received/:id', authenticateToken, async (req, res) => {
  try {
    const shareId = req.params.id;

    // Verify the share exists and the user is the recipient
    const shareCheck = await db.query(
      'SELECT * FROM shares WHERE id = $1 AND shared_with = $2',
      [shareId, req.user.id]
    );

    if (shareCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Share not found or you are not the recipient' });
    }

    // Delete the share record
    await db.query('DELETE FROM shares WHERE id = $1', [shareId]);

    res.json({ message: 'Share removed from your list successfully' });
  } catch (error) {
    console.error('Delete received share error:', error);
    res.status(500).json({ error: 'Failed to remove share' });
  }
});

// Get share by private token
router.get('/private/:token', authenticateToken, async (req, res) => {
  try {
    const { token } = req.params;

    const share = await db.query(`
      SELECT 
        s.id, s.expires_at, s.created_at, s.is_viewed,
        f.id as file_id, f.filename, f.size, f.mime_type, f.filepath,
        fo.id as folder_id, fo.name as folder_name,
        u.username as shared_by_username
      FROM shares s
      LEFT JOIN files f ON s.file_id = f.id
      LEFT JOIN folders fo ON s.folder_id = fo.id
      JOIN users u ON s.shared_by = u.id
      WHERE s.private_token = $1 
        AND s.shared_with = $2
        AND (s.expires_at IS NULL OR s.expires_at > NOW())
    `, [token, req.user.id]);

    if (share.rows.length === 0) {
      return res.status(404).json({ error: 'Share not found or expired' });
    }

    // Mark as viewed if not already viewed
    if (!share.rows[0].is_viewed) {
      await db.query(
        'UPDATE shares SET is_viewed = TRUE, viewed_at = NOW() WHERE id = $1',
        [share.rows[0].id]
      );
    }

    const { filepath, ...shareInfo } = share.rows[0];
    res.json({ share: shareInfo });
  } catch (error) {
    console.error('Get private share error:', error);
    res.status(500).json({ error: 'Failed to retrieve private share' });
  }
});

// Get shared folder contents
router.get('/:shareId/contents', authenticateToken, async (req, res) => {
  try {
    const { shareId } = req.params;

    // Get share details and verify access
    const share = await db.query(`
      SELECT s.*, f.name as folder_name, f.owner_id
      FROM shares s
      LEFT JOIN folders f ON s.folder_id = f.id
      WHERE s.id = $1 AND s.folder_id IS NOT NULL
      AND (s.shared_by = $2 OR s.shared_with = $2)
      AND (s.expires_at IS NULL OR s.expires_at > NOW())
    `, [shareId, req.user.id]);

    if (share.rows.length === 0) {
      return res.status(404).json({ error: 'Shared folder not found or access denied' });
    }

    const sharedFolder = share.rows[0];

    // Get all files from the shared folder and its subfolders recursively
    const contents = await db.query(`
      WITH RECURSIVE folder_tree AS (
        -- Base case: the shared folder itself
        SELECT id, name, parent_id, owner_id, '' as path
        FROM folders
        WHERE id = $1
        
        UNION ALL
        
        -- Recursive case: all subfolders
        SELECT f.id, f.name, f.parent_id, f.owner_id, 
               CASE WHEN ft.path = '' THEN f.name ELSE ft.path || '/' || f.name END
        FROM folders f
        INNER JOIN folder_tree ft ON f.parent_id = ft.id
        WHERE f.owner_id = $2
      )
      SELECT f.id, f.filename, f.size, f.mime_type, f.created_at,
             CASE WHEN ft.path = '' THEN '' ELSE ft.path END as folder_path
      FROM files f
      INNER JOIN folder_tree ft ON f.folder_id = ft.id
      ORDER BY ft.path, f.filename
    `, [sharedFolder.folder_id, sharedFolder.owner_id]);

    res.json({
      share: sharedFolder,
      files: contents.rows
    });
  } catch (error) {
    console.error('Get shared folder contents error:', error);
    res.status(500).json({ error: 'Failed to retrieve shared folder contents' });
  }
});

module.exports = router;