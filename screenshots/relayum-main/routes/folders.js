const express = require('express');
const db = require('../models/database');
const { authenticateToken } = require('../middleware/auth');
const DatabaseUtils = require('../utils/dbUtils');

const router = express.Router();

// Get folder tree structure
router.get('/tree', authenticateToken, async (req, res) => {
  try {
    // Get all folders for the user
    const folders = await db.query(`
      SELECT f.id, f.name, f.parent_id,
        COUNT(DISTINCT fl.id) as file_count,
        COUNT(DISTINCT cf.id) as subfolder_count
      FROM folders f
      LEFT JOIN files fl ON f.id = fl.folder_id
      LEFT JOIN folders cf ON f.id = cf.parent_id
      WHERE f.owner_id = $1
      GROUP BY f.id, f.name, f.parent_id
      ORDER BY f.name
    `, [req.user.id]);

    // Build tree structure
    const buildTree = (parentId = null) => {
      const children = folders.rows
        .filter(folder => folder.parent_id === parentId)
        .map(folder => ({
          ...folder,
          children: buildTree(folder.id)
        }));
      return children;
    };

    const tree = buildTree(null);

    res.json({ tree });
  } catch (error) {
    console.error('Get folder tree error:', error);
    res.status(500).json({ error: 'Failed to retrieve folder tree' });
  }
});

// Get all folders for current user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { parent_id } = req.query;
    
    const folders = await DatabaseUtils.getUserFolders(req.user.id, parent_id || null);

    res.json({ folders });
  } catch (error) {
    console.error('Get folders error:', error);
    res.status(500).json({ error: 'Failed to retrieve folders' });
  }
});

// Create a new folder
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, parent_id } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Folder name is required' });
    }

    // Check if parent folder exists and belongs to user
    if (parent_id) {
      const parentFolder = await DatabaseUtils.verifyFolderOwnership(parent_id, req.user.id);
      
      if (!parentFolder) {
        return res.status(404).json({ error: 'Parent folder not found' });
      }
    }

    // Check if folder with same name already exists in parent
    const folderExists = await DatabaseUtils.folderNameExists(name.trim(), req.user.id, parent_id || null);

    if (folderExists) {
      return res.status(409).json({ error: 'Folder with this name already exists' });
    }

    const newFolder = await DatabaseUtils.createFolder(name, req.user.id, parent_id || null);

    res.status(201).json({
      message: 'Folder created successfully',
      folder: newFolder
    });
  } catch (error) {
    console.error('Create folder error:', error);
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

// Get folder details with contents
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const folderId = req.params.id;

    // Get folder details
    const folder = await DatabaseUtils.verifyFolderOwnership(folderId, req.user.id);

    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    // Get subfolders
    const subfolders = await db.query(`
      SELECT f.*, 
        COUNT(DISTINCT cf.id) as subfolder_count,
        COUNT(DISTINCT fl.id) as file_count
      FROM folders f
      LEFT JOIN folders cf ON f.id = cf.parent_id
      LEFT JOIN files fl ON f.id = fl.folder_id
      WHERE f.parent_id = $1 AND f.owner_id = $2
      GROUP BY f.id
      ORDER BY f.name
    `, [folderId, req.user.id]);

    // Get files in folder
    const files = await db.query(
      'SELECT id, filename, size, mime_type, created_at FROM files WHERE folder_id = $1 AND uploader_id = $2 ORDER BY filename',
      [folderId, req.user.id]
    );

    res.json({
      folder,
      subfolders: subfolders.rows,
      files: files.rows
    });
  } catch (error) {
    console.error('Get folder details error:', error);
    res.status(500).json({ error: 'Failed to retrieve folder details' });
  }
});

// Delete folder (and all contents)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const folderId = req.params.id;

    const folder = await DatabaseUtils.verifyFolderOwnership(folderId, req.user.id);

    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    // This will cascade delete all subfolders and set files' folder_id to NULL
    await DatabaseUtils.deleteFolder(folderId);

    res.json({ message: 'Folder deleted successfully' });
  } catch (error) {
    console.error('Delete folder error:', error);
    res.status(500).json({ error: 'Failed to delete folder' });
  }
});

// Get folder breadcrumb path
router.get('/:id/breadcrumb', authenticateToken, async (req, res) => {
  try {
    const folderId = req.params.id;

    // Recursive query to get folder path
    const breadcrumb = await db.query(`
      WITH RECURSIVE folder_path AS (
        SELECT id, name, parent_id, 0 as level
        FROM folders 
        WHERE id = $1 AND owner_id = $2
        
        UNION ALL
        
        SELECT f.id, f.name, f.parent_id, fp.level + 1
        FROM folders f
        INNER JOIN folder_path fp ON f.id = fp.parent_id
      )
      SELECT id, name FROM folder_path ORDER BY level DESC
    `, [folderId, req.user.id]);

    res.json({ breadcrumb: breadcrumb.rows });
  } catch (error) {
    console.error('Get breadcrumb error:', error);
    res.status(500).json({ error: 'Failed to retrieve folder path' });
  }
});

// Move folder to different parent folder
router.put('/:id/move', authenticateToken, async (req, res) => {
  try {
    const folderId = req.params.id;
    const { parentId } = req.body;

    // Verify folder ownership
    const folder = await DatabaseUtils.verifyFolderOwnership(folderId, req.user.id);

    if (!folder) {
      return res.status(404).json({ error: 'Folder not found or not owned by you' });
    }

    // If moving to a parent folder, verify parent folder ownership and prevent circular reference
    if (parentId) {
      const parentFolder = await DatabaseUtils.verifyFolderOwnership(parentId, req.user.id);

      if (!parentFolder) {
        return res.status(404).json({ error: 'Target parent folder not found or not owned by you' });
      }

      // Check for circular reference - ensure we're not moving a folder into its own subfolder
      const circularCheck = await db.query(`
        WITH RECURSIVE folder_tree AS (
          SELECT id, parent_id
          FROM folders
          WHERE id = $1
          
          UNION ALL
          
          SELECT f.id, f.parent_id
          FROM folders f
          INNER JOIN folder_tree ft ON f.parent_id = ft.id
        )
        SELECT COUNT(*) as count FROM folder_tree WHERE id = $2
      `, [folderId, parentId]);

      if (circularCheck.rows[0].count > 0) {
        return res.status(400).json({ error: 'Cannot move folder into its own subfolder' });
      }
    }

    // Update folder's parent_id
    await DatabaseUtils.moveFolder(folderId, parentId || null);

    res.json({ message: 'Folder moved successfully' });
  } catch (error) {
    console.error('Move folder error:', error);
    res.status(500).json({ error: 'Failed to move folder' });
  }
});

module.exports = router;