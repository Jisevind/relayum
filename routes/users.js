const express = require('express');
const db = require('../models/database');
const { authenticateToken } = require('../middleware/auth');
const { parseFileSize } = require('../utils/fileSizeUtils');

const router = express.Router();

// Helper function to get user quota with admin overrides
async function getUserQuotaInfo(userId) {
  // Get user basic info and any admin overrides
  const result = await db.query(`
    SELECT 
      u.disk_used_bytes,
      ao_quota.override_value as quota_override,
      ao_expiration.override_value as expiration_override
    FROM users u
    LEFT JOIN admin_overrides ao_quota ON u.id = ao_quota.user_id AND ao_quota.override_type = 'disk_quota'
    LEFT JOIN admin_overrides ao_expiration ON u.id = ao_expiration.user_id AND ao_expiration.override_type = 'file_expiration'
    WHERE u.id = $1
  `, [userId]);

  if (result.rows.length === 0) {
    throw new Error('User not found');
  }

  const user = result.rows[0];
  
  // Use environment defaults or admin overrides
  const diskQuotaBytes = user.quota_override ? 
    parseInt(user.quota_override) : 
    parseFileSize(process.env.DEFAULT_DISK_QUOTA || '1GB');
    
  const fileExpirationDays = user.expiration_override ? 
    parseInt(user.expiration_override) : 
    parseInt(process.env.DEFAULT_FILE_EXPIRATION_DAYS || '30'); // 30 days default
    
  const diskUsedBytes = parseInt(user.disk_used_bytes || 0);
  const diskAvailableBytes = diskQuotaBytes - diskUsedBytes;
  const usagePercentage = diskQuotaBytes > 0 ? Math.round((diskUsedBytes / diskQuotaBytes) * 100) : 0;

  return {
    effective_disk_quota: diskQuotaBytes,
    disk_used_bytes: diskUsedBytes,
    disk_available_bytes: Math.max(0, diskAvailableBytes),
    effective_file_expiration: fileExpirationDays,
    usage_percentage: usagePercentage,
    has_quota_override: !!user.quota_override,
    has_expiration_override: !!user.expiration_override
  };
}

// Get current user's quota and usage information
router.get('/quota', authenticateToken, async (req, res) => {
  try {
    const quotaInfo = await getUserQuotaInfo(req.user.id);
    res.json(quotaInfo);
  } catch (error) {
    console.error('Get quota error:', error);
    res.status(500).json({ error: 'Failed to get quota information' });
  }
});

// Get detailed usage statistics
router.get('/usage', authenticateToken, async (req, res) => {
  try {
    // Get file count and total size
    const fileStats = await db.query(`
      SELECT 
        COUNT(*) as total_files,
        SUM(size) as total_size,
        COUNT(CASE WHEN expires_at IS NOT NULL AND expires_at > NOW() THEN 1 END) as files_with_expiration,
        COUNT(CASE WHEN expires_at IS NOT NULL AND expires_at < NOW() THEN 1 END) as expired_files
      FROM files 
      WHERE uploader_id = $1
    `, [req.user.id]);

    // Get files by type
    const fileTypes = await db.query(`
      SELECT 
        mime_type,
        COUNT(*) as count,
        SUM(size) as total_size
      FROM files 
      WHERE uploader_id = $1
      GROUP BY mime_type
      ORDER BY total_size DESC
      LIMIT 10
    `, [req.user.id]);

    // Get user quota info with overrides
    const quotaInfo = await getUserQuotaInfo(req.user.id);
    const stats = fileStats.rows[0];

    res.json({
      quota: quotaInfo,
      files: {
        total_files: parseInt(stats.total_files) || 0,
        total_size_bytes: parseInt(stats.total_size) || 0,
        files_with_expiration: parseInt(stats.files_with_expiration) || 0,
        expired_files: parseInt(stats.expired_files) || 0
      },
      file_types: fileTypes.rows
    });
  } catch (error) {
    console.error('Get usage error:', error);
    res.status(500).json({ error: 'Failed to get usage statistics' });
  }
});

// Recalculate user's disk usage (useful for fixing discrepancies)
router.post('/recalculate-usage', authenticateToken, async (req, res) => {
  try {
    // Calculate actual disk usage from files table
    const actualUsage = await db.query(`
      SELECT COALESCE(SUM(size), 0) as actual_usage
      FROM files 
      WHERE uploader_id = $1
    `, [req.user.id]);

    const actualUsageBytes = parseInt(actualUsage.rows[0].actual_usage) || 0;

    // Update user's disk usage
    await db.query(
      'UPDATE users SET disk_used_bytes = $1 WHERE id = $2',
      [actualUsageBytes, req.user.id]
    );

    // Get updated quota info with overrides
    const quotaInfo = await getUserQuotaInfo(req.user.id);

    res.json({
      message: 'Disk usage recalculated successfully',
      ...quotaInfo
    });
  } catch (error) {
    console.error('Recalculate usage error:', error);
    res.status(500).json({ error: 'Failed to recalculate disk usage' });
  }
});

module.exports = router;