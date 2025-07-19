const db = require('../models/database');

/**
 * Database utility functions for common query patterns
 * Consolidates repeated ownership checks and common operations
 */

class DatabaseUtils {
  /**
   * Check if a file exists and is owned by the specified user
   * @param {number} fileId - The file ID
   * @param {number} userId - The user ID
   * @returns {Promise<Object|null>} File record if found and owned, null otherwise
   */
  static async verifyFileOwnership(fileId, userId) {
    const result = await db.query(
      'SELECT * FROM files WHERE id = $1 AND uploader_id = $2',
      [fileId, userId]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Check if a folder exists and is owned by the specified user
   * @param {number} folderId - The folder ID
   * @param {number} userId - The user ID
   * @returns {Promise<Object|null>} Folder record if found and owned, null otherwise
   */
  static async verifyFolderOwnership(folderId, userId) {
    const result = await db.query(
      'SELECT * FROM folders WHERE id = $1 AND owner_id = $2',
      [folderId, userId]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Check if a share exists and is owned by the specified user
   * @param {number} shareId - The share ID
   * @param {number} userId - The user ID
   * @returns {Promise<Object|null>} Share record if found and owned, null otherwise
   */
  static async verifyShareOwnership(shareId, userId) {
    const result = await db.query(
      'SELECT * FROM shares WHERE id = $1 AND shared_by = $2',
      [shareId, userId]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Check if a user exists
   * @param {number} userId - The user ID
   * @returns {Promise<boolean>} True if user exists, false otherwise
   */
  static async userExists(userId) {
    const result = await db.query(
      'SELECT id FROM users WHERE id = $1',
      [userId]
    );
    return result.rows.length > 0;
  }

  /**
   * Get a user by their username
   * @param {string} username - The username
   * @returns {Promise<Object|null>} User record if found, null otherwise
   */
  static async getUserByName(username) {
    const result = await db.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Check if user has access to a file (via ownership or shares)
   * @param {number} fileId - The file ID
   * @param {number} userId - The user ID
   * @returns {Promise<Object|null>} File record with share info if accessible, null otherwise
   */
  static async verifyFileAccess(fileId, userId) {
    const result = await db.query(`
      SELECT f.*, s.id as share_id
      FROM files f
      LEFT JOIN shares s ON f.id = s.file_id AND (s.shared_with = $1 OR s.shared_by = $1)
      WHERE f.id = $2 AND (f.uploader_id = $1 OR s.id IS NOT NULL)
    `, [userId, fileId]);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Check if user has access to a folder (via ownership or shares)
   * @param {number} folderId - The folder ID
   * @param {number} userId - The user ID
   * @returns {Promise<Object|null>} Folder record with share info if accessible, null otherwise
   */
  static async verifyFolderAccess(folderId, userId) {
    const result = await db.query(`
      SELECT fo.*, s.id as share_id
      FROM folders fo
      LEFT JOIN shares s ON fo.id = s.folder_id AND (s.shared_with = $1 OR s.shared_by = $1)
      WHERE fo.id = $2 AND (fo.owner_id = $1 OR s.id IS NOT NULL)
    `, [userId, folderId]);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Check if a folder name already exists for a user in a specific parent folder
   * @param {string} folderName - The folder name
   * @param {number} userId - The user ID
   * @param {number|null} parentId - The parent folder ID (null for root level)
   * @returns {Promise<boolean>} True if folder exists, false otherwise
   */
  static async folderNameExists(folderName, userId, parentId = null) {
    const result = await db.query(
      'SELECT id FROM folders WHERE name = $1 AND owner_id = $2 AND ($3::integer IS NULL OR parent_id = $3)',
      [folderName, userId, parentId]
    );
    return result.rows.length > 0;
  }

  /**
   * Get files in a folder for a specific user
   * @param {number} userId - The user ID
   * @param {number|null} folderId - The folder ID (null for root level files)
   * @returns {Promise<Array>} Array of file records
   */
  static async getUserFiles(userId, folderId = null) {
    const result = await db.query(
      'SELECT id, filename, size, mime_type, folder_id, created_at, encrypted, file_id, scan_status, scan_date, threat_name, scan_engine, scan_duration_ms FROM files WHERE uploader_id = $1 AND ($2::integer IS NULL AND folder_id IS NULL OR folder_id = $2) ORDER BY filename',
      [userId, folderId]
    );
    return result.rows;
  }

  /**
   * Get folders for a specific user and parent
   * @param {number} userId - The user ID
   * @param {number|null} parentId - The parent folder ID (null for root level)
   * @returns {Promise<Array>} Array of folder records with counts
   */
  static async getUserFolders(userId, parentId = null) {
    const result = await db.query(`
      SELECT f.*, 
        COUNT(DISTINCT cf.id) as subfolder_count,
        COUNT(DISTINCT fl.id) as file_count
      FROM folders f
      LEFT JOIN folders cf ON f.id = cf.parent_id
      LEFT JOIN files fl ON f.id = fl.folder_id
      WHERE f.owner_id = $1 AND (f.parent_id = $2 OR ($2 IS NULL AND f.parent_id IS NULL))
      GROUP BY f.id
      ORDER BY f.name
    `, [userId, parentId]);
    
    // Calculate folder sizes for each folder
    const folders = result.rows;
    for (const folder of folders) {
      folder.total_size = await this.calculateFolderSize(folder.id, userId);
    }
    
    return folders;
  }

  /**
   * Calculate total size of all files in a folder and its subfolders
   * @param {number} folderId - The folder ID
   * @param {number} userId - The user ID (for security)
   * @returns {Promise<number>} Total size in bytes
   */
  static async calculateFolderSize(folderId, userId) {
    const result = await db.query(`
      WITH RECURSIVE folder_tree AS (
        SELECT id
        FROM folders
        WHERE id = $1 AND owner_id = $2
        
        UNION ALL
        
        SELECT f.id
        FROM folders f
        JOIN folder_tree ft ON f.parent_id = ft.id
        WHERE f.owner_id = $2
      )
      SELECT COALESCE(SUM(fl.size), 0) as total_size
      FROM folder_tree ft
      JOIN files fl ON ft.id = fl.folder_id
    `, [folderId, userId]);
    
    return parseInt(result.rows[0]?.total_size || 0);
  }

  /**
   * Create a new folder
   * @param {string} name - The folder name
   * @param {number} userId - The owner user ID
   * @param {number|null} parentId - The parent folder ID (null for root level)
   * @returns {Promise<Object>} The created folder record
   */
  static async createFolder(name, userId, parentId = null) {
    const result = await db.query(
      'INSERT INTO folders (name, parent_id, owner_id) VALUES ($1, $2, $3) RETURNING *',
      [name.trim(), parentId, userId]
    );
    return result.rows[0];
  }

  /**
   * Delete a file record
   * @param {number} fileId - The file ID
   * @returns {Promise<void>}
   */
  static async deleteFile(fileId) {
    await db.query('DELETE FROM files WHERE id = $1', [fileId]);
  }

  /**
   * Delete a folder record
   * @param {number} folderId - The folder ID
   * @returns {Promise<void>}
   */
  static async deleteFolder(folderId) {
    await db.query('DELETE FROM folders WHERE id = $1', [folderId]);
  }

  /**
   * Delete a share record
   * @param {number} shareId - The share ID
   * @returns {Promise<void>}
   */
  static async deleteShare(shareId) {
    await db.query('DELETE FROM shares WHERE id = $1', [shareId]);
  }

  /**
   * Move a file to a different folder
   * @param {number} fileId - The file ID
   * @param {number|null} folderId - The target folder ID (null for root)
   * @returns {Promise<void>}
   */
  static async moveFile(fileId, folderId = null) {
    await db.query(
      'UPDATE files SET folder_id = $1 WHERE id = $2',
      [folderId, fileId]
    );
  }

  /**
   * Move a folder to a different parent
   * @param {number} folderId - The folder ID
   * @param {number|null} parentId - The target parent ID (null for root)
   * @returns {Promise<void>}
   */
  static async moveFolder(folderId, parentId = null) {
    await db.query(
      'UPDATE folders SET parent_id = $1 WHERE id = $2',
      [parentId, folderId]
    );
  }
}

module.exports = DatabaseUtils;