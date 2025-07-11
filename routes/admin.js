const express = require('express');
const db = require('../models/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { parseFileSize } = require('../utils/fileSizeUtils');

const router = express.Router();

// Apply authentication and admin check to all routes
router.use(authenticateToken);
router.use(requireAdmin);

// Helper function to log admin actions
async function logAdminAction(adminId, actionType, targetUserId, actionDetails) {
  try {
    await db.query(`
      INSERT INTO admin_actions (admin_id, action_type, target_user_id, action_details)
      VALUES ($1, $2, $3, $4)
    `, [adminId, actionType, targetUserId, JSON.stringify(actionDetails)]);
  } catch (error) {
    console.error('Failed to log admin action:', error);
  }
}

// Helper function to get user with overrides
async function getUserWithOverrides(userId) {
  const userResult = await db.query(`
    SELECT u.*, 
           ao_quota.override_value as quota_override,
           ao_expiration.override_value as expiration_override
    FROM users u
    LEFT JOIN admin_overrides ao_quota ON u.id = ao_quota.user_id AND ao_quota.override_type = 'disk_quota'
    LEFT JOIN admin_overrides ao_expiration ON u.id = ao_expiration.user_id AND ao_expiration.override_type = 'file_expiration'
    WHERE u.id = $1
  `, [userId]);
  
  if (userResult.rows.length === 0) {
    return null;
  }
  
  const user = userResult.rows[0];
  return {
    ...user,
    effective_disk_quota: user.quota_override ? parseInt(user.quota_override) : parseFileSize(process.env.DEFAULT_DISK_QUOTA || '1GB'),
    effective_file_expiration: user.expiration_override ? parseInt(user.expiration_override) : parseInt(process.env.DEFAULT_FILE_EXPIRATION_DAYS || '30'),
    has_quota_override: !!user.quota_override,
    has_expiration_override: !!user.expiration_override
  };
}

// Search users
router.get('/users/search', async (req, res) => {
  try {
    const { q, limit = 20, offset = 0 } = req.query;
    
    // Allow empty search to return all users
    const searchQuery = q && q.trim().length >= 2 ? `%${q.trim()}%` : '%';
    
    const users = await db.query(`
      SELECT u.id, u.username, u.email, u.role, u.created_at, u.disk_used_bytes,
             ao_quota.override_value as quota_override,
             ao_expiration.override_value as expiration_override,
             COUNT(f.id) as file_count,
             COUNT(s.id) as share_count
      FROM users u
      LEFT JOIN admin_overrides ao_quota ON u.id = ao_quota.user_id AND ao_quota.override_type = 'disk_quota'
      LEFT JOIN admin_overrides ao_expiration ON u.id = ao_expiration.user_id AND ao_expiration.override_type = 'file_expiration'
      LEFT JOIN files f ON u.id = f.uploader_id
      LEFT JOIN shares s ON u.id = s.shared_by
      WHERE u.username ILIKE $1 OR u.email ILIKE $1
      GROUP BY u.id, u.username, u.email, u.role, u.created_at, u.disk_used_bytes, ao_quota.override_value, ao_expiration.override_value
      ORDER BY u.username
      LIMIT $2 OFFSET $3
    `, [searchQuery, limit, offset]);
    
    const total = await db.query(`
      SELECT COUNT(*) as count FROM users 
      WHERE username ILIKE $1 OR email ILIKE $1
    `, [searchQuery]);
    
    await logAdminAction(req.user.id, 'user_search', null, { query: q, results: users.rows.length });
    
    res.json({
      users: users.rows.map(user => {
        // Calculate effective quota with overrides
        const effectiveQuota = user.quota_override ? 
          parseInt(user.quota_override) : 
          parseFileSize(process.env.DEFAULT_DISK_QUOTA || '1GB');
        const effectiveExpiration = user.expiration_override ? 
          parseInt(user.expiration_override) : 
          parseInt(process.env.DEFAULT_FILE_EXPIRATION_DAYS || '30');
        const usedBytes = parseInt(user.disk_used_bytes || 0);
        
        return {
          ...user,
          disk_used_bytes: usedBytes,
          effective_disk_quota: effectiveQuota,
          file_expiration_days: effectiveExpiration,
          file_count: parseInt(user.file_count),
          share_count: parseInt(user.share_count),
          usage_percentage: effectiveQuota > 0 ? 
            Math.round((usedBytes / effectiveQuota) * 100) : 0,
          has_quota_override: !!user.quota_override,
          has_expiration_override: !!user.expiration_override
        };
      }),
      total: parseInt(total.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Admin user search error:', error);
    res.status(500).json({ error: 'Failed to search users' });
  }
});

// Get user details with overrides
router.get('/users/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    
    const user = await getUserWithOverrides(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get user's file statistics
    const fileStats = await db.query(`
      SELECT 
        COUNT(*) as total_files,
        SUM(size) as total_size,
        COUNT(CASE WHEN expires_at IS NOT NULL AND expires_at > NOW() THEN 1 END) as files_with_expiration,
        COUNT(CASE WHEN expires_at IS NOT NULL AND expires_at < NOW() THEN 1 END) as expired_files
      FROM files 
      WHERE uploader_id = $1
    `, [userId]);
    
    // Get user's share statistics
    const shareStats = await db.query(`
      SELECT 
        COUNT(s.id) as total_shares,
        COUNT(ans.id) as anonymous_shares
      FROM shares s
      FULL OUTER JOIN anonymous_shares ans ON s.shared_by = ans.created_by
      WHERE s.shared_by = $1 OR ans.created_by = $1
    `, [userId]);
    
    const stats = fileStats.rows[0];
    const shares = shareStats.rows[0];
    
    await logAdminAction(req.user.id, 'user_details_view', userId, { viewed_user: user.username });
    
    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        created_at: user.created_at,
        effective_disk_quota: user.effective_disk_quota,
        disk_used_bytes: user.disk_used_bytes,
        effective_file_expiration: user.effective_file_expiration,
        effective_disk_quota: user.effective_disk_quota,
        effective_file_expiration: user.effective_file_expiration,
        has_quota_override: user.has_quota_override,
        has_expiration_override: user.has_expiration_override,
        usage_percentage: user.effective_disk_quota > 0 ? 
          Math.round(((user.disk_used_bytes || 0) / user.effective_disk_quota) * 100) : 0
      },
      statistics: {
        files: {
          total_files: parseInt(stats.total_files) || 0,
          total_size_bytes: parseInt(stats.total_size) || 0,
          files_with_expiration: parseInt(stats.files_with_expiration) || 0,
          expired_files: parseInt(stats.expired_files) || 0
        },
        shares: {
          total_shares: parseInt(shares.total_shares) || 0,
          anonymous_shares: parseInt(shares.anonymous_shares) || 0
        }
      }
    });
  } catch (error) {
    console.error('Get user details error:', error);
    res.status(500).json({ error: 'Failed to get user details' });
  }
});

// Override user disk quota
router.post('/users/:userId/override-quota', async (req, res) => {
  try {
    if (process.env.ADMIN_OVERRIDE_ENABLED === 'false') {
      return res.status(403).json({ error: 'Admin overrides are disabled' });
    }
    
    const userId = parseInt(req.params.userId);
    const { quota_bytes } = req.body;
    
    if (!quota_bytes || quota_bytes < 0) {
      return res.status(400).json({ error: 'Valid quota in bytes is required' });
    }
    
    // Verify user exists
    const user = await db.query('SELECT username FROM users WHERE id = $1', [userId]);
    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Create or update override
    await db.query(`
      INSERT INTO admin_overrides (user_id, override_type, override_value, created_by)
      VALUES ($1, 'disk_quota', $2, $3)
      ON CONFLICT (user_id, override_type)
      DO UPDATE SET override_value = $2, created_by = $3, created_at = CURRENT_TIMESTAMP
    `, [userId, quota_bytes.toString(), req.user.id]);
    
    await logAdminAction(req.user.id, 'quota_override', userId, {
      target_user: user.rows[0].username,
      new_quota_bytes: quota_bytes,
      action: 'set_quota_override'
    });
    
    res.json({
      message: 'User quota override set successfully',
      user_id: userId,
      new_quota_bytes: quota_bytes,
      override_set_by: req.user.username
    });
  } catch (error) {
    console.error('Set quota override error:', error);
    res.status(500).json({ error: 'Failed to set quota override' });
  }
});

// Unified override endpoint for both quota and expiration
router.post('/users/:userId/override', async (req, res) => {
  try {
    if (process.env.ADMIN_OVERRIDE_ENABLED === 'false') {
      return res.status(403).json({ error: 'Admin overrides are disabled' });
    }
    
    const userId = parseInt(req.params.userId);
    const { quota_override, expiration_override } = req.body;
    
    // Verify user exists
    const user = await db.query('SELECT username FROM users WHERE id = $1', [userId]);
    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const username = user.rows[0].username;
    const updates = [];
    
    // Handle quota override
    if (quota_override !== undefined) {
      if (quota_override === '' || quota_override === null) {
        // Remove quota override
        await db.query(`
          DELETE FROM admin_overrides 
          WHERE user_id = $1 AND override_type = 'disk_quota'
        `, [userId]);
        
        await logAdminAction(req.user.id, 'override_removal', userId, {
          target_user: username,
          override_type: 'disk_quota',
          action: 'remove_quota_override'
        });
        
        updates.push('quota override removed');
      } else {
        const quotaBytes = parseInt(quota_override);
        if (isNaN(quotaBytes) || quotaBytes < 0) {
          return res.status(400).json({ error: 'Valid quota in bytes is required' });
        }
        
        // Create or update quota override
        await db.query(`
          INSERT INTO admin_overrides (user_id, override_type, override_value, created_by)
          VALUES ($1, 'disk_quota', $2, $3)
          ON CONFLICT (user_id, override_type)
          DO UPDATE SET override_value = $2, created_by = $3, created_at = CURRENT_TIMESTAMP
        `, [userId, quotaBytes.toString(), req.user.id]);
        
        await logAdminAction(req.user.id, 'quota_override', userId, {
          target_user: username,
          new_quota_bytes: quotaBytes,
          action: 'set_quota_override'
        });
        
        updates.push(`quota set to ${quotaBytes} bytes`);
      }
    }
    
    // Handle expiration override
    if (expiration_override !== undefined) {
      if (expiration_override === '' || expiration_override === null) {
        // Remove expiration override
        await db.query(`
          DELETE FROM admin_overrides 
          WHERE user_id = $1 AND override_type = 'file_expiration'
        `, [userId]);
        
        await logAdminAction(req.user.id, 'override_removal', userId, {
          target_user: username,
          override_type: 'file_expiration',
          action: 'remove_expiration_override'
        });
        
        updates.push('expiration override removed');
      } else {
        const expirationDays = parseInt(expiration_override);
        if (isNaN(expirationDays) || expirationDays < 0) {
          return res.status(400).json({ error: 'Valid expiration days is required (0 for no expiration)' });
        }
        
        // Create or update expiration override
        await db.query(`
          INSERT INTO admin_overrides (user_id, override_type, override_value, created_by)
          VALUES ($1, 'file_expiration', $2, $3)
          ON CONFLICT (user_id, override_type)
          DO UPDATE SET override_value = $2, created_by = $3, created_at = CURRENT_TIMESTAMP
        `, [userId, expirationDays.toString(), req.user.id]);
        
        await logAdminAction(req.user.id, 'expiration_override', userId, {
          target_user: username,
          new_expiration_days: expirationDays,
          action: 'set_expiration_override'
        });
        
        updates.push(`expiration set to ${expirationDays} days`);
      }
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid override data provided' });
    }
    
    res.json({
      message: 'User overrides updated successfully',
      user_id: userId,
      target_user: username,
      updates: updates,
      updated_by: req.user.username
    });
  } catch (error) {
    console.error('Set user overrides error:', error);
    res.status(500).json({ error: 'Failed to set user overrides' });
  }
});

// Override user file expiration
router.post('/users/:userId/override-expiration', async (req, res) => {
  try {
    if (process.env.ADMIN_OVERRIDE_ENABLED === 'false') {
      return res.status(403).json({ error: 'Admin overrides are disabled' });
    }
    
    const userId = parseInt(req.params.userId);
    const { expiration_days } = req.body;
    
    if (expiration_days === undefined || expiration_days < 0) {
      return res.status(400).json({ error: 'Valid expiration days is required (0 for no expiration)' });
    }
    
    // Verify user exists
    const user = await db.query('SELECT username FROM users WHERE id = $1', [userId]);
    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Create or update override
    await db.query(`
      INSERT INTO admin_overrides (user_id, override_type, override_value, created_by)
      VALUES ($1, 'file_expiration', $2, $3)
      ON CONFLICT (user_id, override_type)
      DO UPDATE SET override_value = $2, created_by = $3, created_at = CURRENT_TIMESTAMP
    `, [userId, expiration_days.toString(), req.user.id]);
    
    await logAdminAction(req.user.id, 'expiration_override', userId, {
      target_user: user.rows[0].username,
      new_expiration_days: expiration_days,
      action: 'set_expiration_override'
    });
    
    res.json({
      message: 'User file expiration override set successfully',
      user_id: userId,
      new_expiration_days: expiration_days,
      override_set_by: req.user.username
    });
  } catch (error) {
    console.error('Set expiration override error:', error);
    res.status(500).json({ error: 'Failed to set expiration override' });
  }
});

// Remove all user overrides (unified endpoint)
router.delete('/users/:userId/override', async (req, res) => {
  try {
    if (process.env.ADMIN_OVERRIDE_ENABLED === 'false') {
      return res.status(403).json({ error: 'Admin overrides are disabled' });
    }
    
    const userId = parseInt(req.params.userId);
    
    // Verify user exists
    const user = await db.query('SELECT username FROM users WHERE id = $1', [userId]);
    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Remove all overrides for this user
    const result = await db.query(`
      DELETE FROM admin_overrides 
      WHERE user_id = $1
    `, [userId]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'No overrides found for user' });
    }
    
    await logAdminAction(req.user.id, 'override_removal', userId, {
      target_user: user.rows[0].username,
      action: 'remove_all_overrides',
      overrides_removed: result.rowCount
    });
    
    res.json({
      message: 'All user overrides removed successfully',
      user_id: userId,
      target_user: user.rows[0].username,
      overrides_removed: result.rowCount,
      removed_by: req.user.username
    });
  } catch (error) {
    console.error('Remove all overrides error:', error);
    res.status(500).json({ error: 'Failed to remove overrides' });
  }
});

// Remove user override
router.delete('/users/:userId/override/:overrideType', async (req, res) => {
  try {
    if (process.env.ADMIN_OVERRIDE_ENABLED === 'false') {
      return res.status(403).json({ error: 'Admin overrides are disabled' });
    }
    
    const userId = parseInt(req.params.userId);
    const { overrideType } = req.params;
    
    if (!['disk_quota', 'file_expiration'].includes(overrideType)) {
      return res.status(400).json({ error: 'Invalid override type' });
    }
    
    // Verify user exists
    const user = await db.query('SELECT username FROM users WHERE id = $1', [userId]);
    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Remove override
    const result = await db.query(`
      DELETE FROM admin_overrides 
      WHERE user_id = $1 AND override_type = $2
    `, [userId, overrideType]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Override not found' });
    }
    
    await logAdminAction(req.user.id, 'override_removal', userId, {
      target_user: user.rows[0].username,
      override_type: overrideType,
      action: 'remove_override'
    });
    
    res.json({
      message: 'User override removed successfully',
      user_id: userId,
      override_type: overrideType,
      removed_by: req.user.username
    });
  } catch (error) {
    console.error('Remove override error:', error);
    res.status(500).json({ error: 'Failed to remove override' });
  }
});

// Get all users with overrides
router.get('/users', async (req, res) => {
  try {
    const { limit = 50, offset = 0, role, has_overrides } = req.query;
    
    let whereClause = '';
    let params = [limit, offset];
    let paramCount = 2;
    
    if (role) {
      paramCount++;
      whereClause += ` WHERE u.role = $${paramCount}`;
      params.push(role);
    }
    
    if (has_overrides === 'true') {
      const connector = whereClause ? ' AND' : ' WHERE';
      whereClause += `${connector} (ao_quota.user_id IS NOT NULL OR ao_expiration.user_id IS NOT NULL)`;
    }
    
    const users = await db.query(`
      SELECT u.id, u.username, u.email, u.role, u.created_at,
             u.disk_used_bytes,
             ao_quota.override_value as quota_override,
             ao_expiration.override_value as expiration_override,
             COUNT(f.id) as file_count,
             COUNT(s.id) as share_count
      FROM users u
      LEFT JOIN admin_overrides ao_quota ON u.id = ao_quota.user_id AND ao_quota.override_type = 'disk_quota'
      LEFT JOIN admin_overrides ao_expiration ON u.id = ao_expiration.user_id AND ao_expiration.override_type = 'file_expiration'
      LEFT JOIN files f ON u.id = f.uploader_id
      LEFT JOIN shares s ON u.id = s.shared_by
      ${whereClause}
      GROUP BY u.id, u.username, u.email, u.role, u.created_at, u.disk_used_bytes, ao_quota.override_value, ao_expiration.override_value
      ORDER BY u.created_at DESC
      LIMIT $1 OFFSET $2
    `, params);
    
    const total = await db.query(`
      SELECT COUNT(DISTINCT u.id) as count FROM users u
      LEFT JOIN admin_overrides ao_quota ON u.id = ao_quota.user_id AND ao_quota.override_type = 'disk_quota'
      LEFT JOIN admin_overrides ao_expiration ON u.id = ao_expiration.user_id AND ao_expiration.override_type = 'file_expiration'
      ${whereClause}
    `, params.slice(2));
    
    await logAdminAction(req.user.id, 'users_list', null, { filters: { role, has_overrides } });
    
    res.json({
      users: users.rows.map(user => ({
        ...user,
        disk_used_bytes: parseInt(user.disk_used_bytes || 0),
        file_count: parseInt(user.file_count),
        share_count: parseInt(user.share_count),
        has_quota_override: !!user.quota_override,
        has_expiration_override: !!user.expiration_override,
        effective_disk_quota: user.quota_override ? parseInt(user.quota_override) : parseFileSize(process.env.DEFAULT_DISK_QUOTA || '1GB'),
        effective_file_expiration: user.expiration_override ? parseInt(user.expiration_override) : parseInt(process.env.DEFAULT_FILE_EXPIRATION_DAYS || '30'),
        usage_percentage: (() => {
          const effectiveQuota = user.quota_override ? parseInt(user.quota_override) : parseFileSize(process.env.DEFAULT_DISK_QUOTA || '1GB');
          const usedBytes = parseInt(user.disk_used_bytes || 0);
          return effectiveQuota > 0 ? Math.round((usedBytes / effectiveQuota) * 100) : 0;
        })()
      })),
      total: parseInt(total.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Get users list error:', error);
    res.status(500).json({ error: 'Failed to get users list' });
  }
});

// Get audit logs for a specific user
router.get('/users/:userId/audit', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const { limit = 50, offset = 0 } = req.query;
    
    // Verify user exists
    const user = await db.query('SELECT username FROM users WHERE id = $1', [userId]);
    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const actions = await db.query(`
      SELECT aa.*, 
             admin_user.username as admin_username,
             target_user.username as target_username
      FROM admin_actions aa
      LEFT JOIN users admin_user ON aa.admin_id = admin_user.id
      LEFT JOIN users target_user ON aa.target_user_id = target_user.id
      WHERE aa.target_user_id = $1 
        AND aa.action_type != 'user_audit_view'
        AND aa.action_type != 'user_details_view'
      ORDER BY aa.timestamp DESC
      LIMIT $2 OFFSET $3
    `, [userId, limit, offset]);
    
    const total = await db.query(`
      SELECT COUNT(*) as count FROM admin_actions aa
      WHERE aa.target_user_id = $1
        AND aa.action_type != 'user_audit_view'
        AND aa.action_type != 'user_details_view'
    `, [userId]);
    
    await logAdminAction(req.user.id, 'user_audit_view', userId, {
      target_user: user.rows[0].username,
      logs_retrieved: actions.rows.length
    });
    
    res.json({
      logs: actions.rows,
      target_user: user.rows[0].username,
      total: parseInt(total.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Get user audit logs error:', error);
    res.status(500).json({ error: 'Failed to get user audit logs' });
  }
});

// Get admin action logs
router.get('/actions', async (req, res) => {
  try {
    const { limit = 100, offset = 0, action_type, target_user_id } = req.query;
    
    let whereClause = '';
    let params = [limit, offset];
    let paramCount = 2;
    
    if (action_type) {
      paramCount++;
      whereClause += ` WHERE aa.action_type = $${paramCount}`;
      params.push(action_type);
    }
    
    if (target_user_id) {
      const connector = whereClause ? ' AND' : ' WHERE';
      paramCount++;
      whereClause += `${connector} aa.target_user_id = $${paramCount}`;
      params.push(parseInt(target_user_id));
    }
    
    const actions = await db.query(`
      SELECT aa.*, 
             admin_user.username as admin_username,
             target_user.username as target_username
      FROM admin_actions aa
      LEFT JOIN users admin_user ON aa.admin_id = admin_user.id
      LEFT JOIN users target_user ON aa.target_user_id = target_user.id
      ${whereClause}
      ORDER BY aa.timestamp DESC
      LIMIT $1 OFFSET $2
    `, params);
    
    const total = await db.query(`
      SELECT COUNT(*) as count FROM admin_actions aa
      ${whereClause}
    `, params.slice(2));
    
    res.json({
      actions: actions.rows,
      total: parseInt(total.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Get admin actions error:', error);
    res.status(500).json({ error: 'Failed to get admin actions' });
  }
});

// Get login logs
router.get('/login-logs', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    
    // Optional filters
    const success = req.query.success; // 'true', 'false', or undefined for all
    const username = req.query.username;
    const ip = req.query.ip;
    const startDate = req.query.start_date;
    const endDate = req.query.end_date;
    
    // Build WHERE clause
    const whereConditions = [];
    const queryParams = [];
    let paramIndex = 1;
    
    if (success !== undefined) {
      whereConditions.push(`la.successful = $${paramIndex}`);
      queryParams.push(success === 'true');
      paramIndex++;
    }
    
    if (username) {
      whereConditions.push(`la.username ILIKE $${paramIndex}`);
      queryParams.push(`%${username}%`);
      paramIndex++;
    }
    
    if (ip) {
      whereConditions.push(`la.ip_address::text ILIKE $${paramIndex}`);
      queryParams.push(`%${ip}%`);
      paramIndex++;
    }
    
    if (startDate) {
      whereConditions.push(`la.attempt_time >= $${paramIndex}`);
      queryParams.push(startDate);
      paramIndex++;
    }
    
    if (endDate) {
      whereConditions.push(`la.attempt_time <= $${paramIndex}`);
      queryParams.push(endDate);
      paramIndex++;
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM login_attempts la
      ${whereClause}
    `;
    const countResult = await db.query(countQuery, queryParams);
    const totalCount = parseInt(countResult.rows[0].total);
    
    // Get paginated results with ban status
    const dataQuery = `
      SELECT 
        la.id,
        la.ip_address,
        la.username,
        la.successful,
        la.attempt_time,
        la.user_agent,
        u.id as user_id,
        u.role as user_role,
        -- Manual ban status
        CASE WHEN ib.id IS NOT NULL THEN true ELSE false END as is_manually_banned,
        ib.reason as manual_ban_reason,
        ib.banned_at as manual_ban_date,
        ib.expires_at as manual_ban_expires,
        admin_user.username as banned_by_username
      FROM login_attempts la
      LEFT JOIN users u ON la.username = u.username
      LEFT JOIN ip_bans ib ON la.ip_address = ib.ip_address 
        AND ib.is_active = true 
        AND (ib.expires_at IS NULL OR ib.expires_at > NOW())
      LEFT JOIN users admin_user ON ib.banned_by = admin_user.id
      ${whereClause}
      ORDER BY la.attempt_time DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    const dataResult = await db.query(dataQuery, [...queryParams, limit, offset]);
    
    // Calculate auto-ban status for each log entry
    const blockDuration = parseInt(process.env.LOGIN_BLOCK_DURATION) || 900000; // 15 minutes
    const attemptLimit = parseInt(process.env.LOGIN_ATTEMPT_LIMIT) || 5;
    
    // Get unique IP addresses from the results
    const uniqueIPs = [...new Set(dataResult.rows.map(row => row.ip_address))];
    
    // Batch check auto-ban status for all unique IPs
    const autoBanPromises = uniqueIPs.map(async (ip) => {
      const recentAttempts = await db.query(`
        SELECT COUNT(*) as count 
        FROM login_attempts 
        WHERE ip_address = $1 
        AND successful = false 
        AND attempt_time > NOW() - INTERVAL '${blockDuration} milliseconds'
      `, [ip]);
      
      return {
        ip,
        is_auto_banned: parseInt(recentAttempts.rows[0].count) >= attemptLimit,
        failed_attempts: parseInt(recentAttempts.rows[0].count)
      };
    });
    
    const autoBanResults = await Promise.all(autoBanPromises);
    const autoBanMap = Object.fromEntries(autoBanResults.map(result => [result.ip, result]));
    
    // Enhance each log entry with ban status
    const enhancedLogs = dataResult.rows.map(log => ({
      ...log,
      is_auto_banned: autoBanMap[log.ip_address]?.is_auto_banned || false,
      failed_attempts_count: autoBanMap[log.ip_address]?.failed_attempts || 0,
      is_currently_banned: (autoBanMap[log.ip_address]?.is_auto_banned || false) || log.is_manually_banned,
      ban_type: log.is_manually_banned ? 'manual' : 
                (autoBanMap[log.ip_address]?.is_auto_banned ? 'automatic' : 'none')
    }));
    
    res.json({
      logs: enhancedLogs,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit)
      },
      ban_settings: {
        attempt_limit: attemptLimit,
        block_duration_minutes: Math.floor(blockDuration / 60000)
      }
    });
  } catch (error) {
    console.error('Get login logs error:', error);
    res.status(500).json({ error: 'Failed to get login logs' });
  }
});

// IP Ban Management Endpoints

// Get all IP bans
router.get('/ip-bans', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    
    const includeExpired = req.query.include_expired === 'true';
    
    // Build WHERE clause
    let whereClause = '';
    const queryParams = [];
    let paramIndex = 1;
    
    if (!includeExpired) {
      whereClause = `WHERE (ib.expires_at IS NULL OR ib.expires_at > NOW()) AND ib.is_active = true`;
    } else {
      whereClause = `WHERE ib.is_active = true`;
    }
    
    // Get total count
    const totalQuery = `
      SELECT COUNT(*) as count
      FROM ip_bans ib
      ${whereClause}
    `;
    const total = await db.query(totalQuery, queryParams);
    
    // Get paginated data
    const dataQuery = `
      SELECT 
        ib.id,
        ib.ip_address,
        ib.banned_at,
        ib.reason,
        ib.expires_at,
        ib.is_active,
        u.username as banned_by_username,
        u.email as banned_by_email
      FROM ip_bans ib
      LEFT JOIN users u ON ib.banned_by = u.id
      ${whereClause}
      ORDER BY ib.banned_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    queryParams.push(limit, offset);
    const bans = await db.query(dataQuery, queryParams);
    
    res.json({
      bans: bans.rows,
      total: parseInt(total.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Get IP bans error:', error);
    res.status(500).json({ error: 'Failed to get IP bans' });
  }
});

// Manually ban an IP address
router.post('/ip-ban', async (req, res) => {
  try {
    const { ip_address, reason, expires_at } = req.body;
    
    if (!ip_address) {
      return res.status(400).json({ error: 'IP address is required' });
    }
    
    // Validate IP address format
    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$|^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::$/;
    if (!ipRegex.test(ip_address.replace(/\[|\]/g, ''))) {
      return res.status(400).json({ error: 'Invalid IP address format' });
    }
    
    // Check if IP is already banned
    const existingBan = await db.query(`
      SELECT id FROM ip_bans 
      WHERE ip_address = $1 
      AND is_active = true 
      AND (expires_at IS NULL OR expires_at > NOW())
    `, [ip_address]);
    
    if (existingBan.rows.length > 0) {
      return res.status(409).json({ error: 'IP address is already banned' });
    }
    
    // Parse expiration date if provided
    let expirationDate = null;
    if (expires_at && expires_at.trim() !== '') {
      expirationDate = new Date(expires_at);
      if (isNaN(expirationDate.getTime())) {
        return res.status(400).json({ error: 'Invalid expiration date format' });
      }
      if (expirationDate <= new Date()) {
        return res.status(400).json({ error: 'Expiration date must be in the future' });
      }
    }
    
    // Create the ban
    const ban = await db.query(`
      INSERT INTO ip_bans (ip_address, banned_by, reason, expires_at) 
      VALUES ($1, $2, $3, $4) 
      RETURNING *
    `, [ip_address, req.user.id, reason || 'Manual ban by admin', expirationDate]);
    
    // Log admin action
    await db.query(`
      INSERT INTO admin_actions (admin_id, action_type, action_details) 
      VALUES ($1, $2, $3)
    `, [
      req.user.id, 
      'ip_ban_create',
      JSON.stringify({
        ip_address,
        reason: reason || 'Manual ban by admin',
        expires_at: expirationDate
      })
    ]);
    
    // Get the created ban with admin info
    const createdBan = await db.query(`
      SELECT 
        ib.id,
        ib.ip_address,
        ib.banned_at,
        ib.reason,
        ib.expires_at,
        ib.is_active,
        u.username as banned_by_username,
        u.email as banned_by_email
      FROM ip_bans ib
      LEFT JOIN users u ON ib.banned_by = u.id
      WHERE ib.id = $1
    `, [ban.rows[0].id]);
    
    res.status(201).json({
      message: 'IP address banned successfully',
      ban: createdBan.rows[0]
    });
  } catch (error) {
    console.error('Ban IP error:', error);
    res.status(500).json({ error: 'Failed to ban IP address' });
  }
});

// Unban an IP address
router.delete('/ip-ban/:ip', async (req, res) => {
  try {
    const ipAddress = req.params.ip;
    
    // Find active ban for this IP
    const existingBan = await db.query(`
      SELECT id FROM ip_bans 
      WHERE ip_address = $1 
      AND is_active = true
    `, [ipAddress]);
    
    if (existingBan.rows.length === 0) {
      return res.status(404).json({ error: 'No active ban found for this IP address' });
    }
    
    // Deactivate the ban
    await db.query(`
      UPDATE ip_bans 
      SET is_active = false, updated_at = NOW() 
      WHERE ip_address = $1 AND is_active = true
    `, [ipAddress]);
    
    // Log admin action
    await db.query(`
      INSERT INTO admin_actions (admin_id, action_type, action_details) 
      VALUES ($1, $2, $3)
    `, [
      req.user.id, 
      'ip_ban_remove',
      JSON.stringify({ ip_address: ipAddress })
    ]);
    
    res.json({ message: 'IP address unbanned successfully' });
  } catch (error) {
    console.error('Unban IP error:', error);
    res.status(500).json({ error: 'Failed to unban IP address' });
  }
});

// Check if IP is currently banned (used by auth middleware)
router.get('/ip-ban-status/:ip', async (req, res) => {
  try {
    const ipAddress = req.params.ip;
    
    // Check for active manual ban
    const manualBan = await db.query(`
      SELECT id, reason, expires_at, banned_at
      FROM ip_bans 
      WHERE ip_address = $1 
      AND is_active = true 
      AND (expires_at IS NULL OR expires_at > NOW())
    `, [ipAddress]);
    
    // Check for automatic ban (based on login attempts)
    const blockDuration = parseInt(process.env.LOGIN_BLOCK_DURATION) || 900000; // 15 minutes
    const attemptLimit = parseInt(process.env.LOGIN_ATTEMPT_LIMIT) || 5;
    
    const recentAttempts = await db.query(`
      SELECT COUNT(*) as count 
      FROM login_attempts 
      WHERE ip_address = $1 
      AND successful = false 
      AND attempt_time > NOW() - INTERVAL '${blockDuration} milliseconds'
    `, [ipAddress]);
    
    const isAutoBanned = parseInt(recentAttempts.rows[0].count) >= attemptLimit;
    const isManuallyBanned = manualBan.rows.length > 0;
    
    res.json({
      is_banned: isAutoBanned || isManuallyBanned,
      auto_banned: isAutoBanned,
      manually_banned: isManuallyBanned,
      manual_ban_details: isManuallyBanned ? manualBan.rows[0] : null,
      failed_attempts: parseInt(recentAttempts.rows[0].count),
      attempt_limit: attemptLimit
    });
  } catch (error) {
    console.error('Check IP ban status error:', error);
    res.status(500).json({ error: 'Failed to check IP ban status' });
  }
});

// Get admin dashboard statistics
router.get('/dashboard', async (req, res) => {
  try {
    // Get user statistics
    const userStats = await db.query(`
      SELECT 
        COUNT(*) as total_users,
        COUNT(CASE WHEN role = 'admin' THEN 1 END) as admin_users,
        COUNT(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN 1 END) as new_users_week
      FROM users
    `);
    
    // Get file statistics
    const fileStats = await db.query(`
      SELECT 
        COUNT(*) as total_files,
        SUM(size) as total_storage_used,
        COUNT(CASE WHEN expires_at IS NOT NULL AND expires_at < NOW() THEN 1 END) as expired_files,
        COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) as files_uploaded_today
      FROM files
    `);
    
    // Get share statistics
    const shareStats = await db.query(`
      SELECT 
        COUNT(s.id) as traditional_shares,
        COUNT(ans.id) as anonymous_shares,
        COUNT(CASE WHEN ans.expires_at < NOW() THEN 1 END) as expired_anonymous_shares
      FROM shares s
      FULL OUTER JOIN anonymous_shares ans ON 1=1
    `);
    
    // Get override statistics
    const overrideStats = await db.query(`
      SELECT 
        COUNT(*) as total_overrides,
        COUNT(CASE WHEN override_type = 'disk_quota' THEN 1 END) as quota_overrides,
        COUNT(CASE WHEN override_type = 'file_expiration' THEN 1 END) as expiration_overrides
      FROM admin_overrides
    `);
    
    // Get recent admin actions
    const recentActions = await db.query(`
      SELECT aa.action_type, aa.timestamp, admin_user.username as admin_username
      FROM admin_actions aa
      LEFT JOIN users admin_user ON aa.admin_id = admin_user.id
      ORDER BY aa.timestamp DESC
      LIMIT 10
    `);
    
    const users = userStats.rows[0];
    const files = fileStats.rows[0];
    const shares = shareStats.rows[0];
    const overrides = overrideStats.rows[0];
    
    res.json({
      users: {
        total: parseInt(users.total_users),
        admin: parseInt(users.admin_users),
        new_this_week: parseInt(users.new_users_week)
      },
      files: {
        total: parseInt(files.total_files),
        storage_used_bytes: parseInt(files.total_storage_used) || 0,
        expired: parseInt(files.expired_files),
        uploaded_today: parseInt(files.files_uploaded_today)
      },
      shares: {
        traditional: parseInt(shares.traditional_shares) || 0,
        anonymous: parseInt(shares.anonymous_shares) || 0,
        expired_anonymous: parseInt(shares.expired_anonymous_shares) || 0
      },
      overrides: {
        total: parseInt(overrides.total_overrides),
        quota: parseInt(overrides.quota_overrides),
        expiration: parseInt(overrides.expiration_overrides)
      },
      recent_actions: recentActions.rows
    });
  } catch (error) {
    console.error('Get admin dashboard error:', error);
    res.status(500).json({ error: 'Failed to get dashboard statistics' });
  }
});

module.exports = router;