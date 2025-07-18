const express = require('express');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { getVirusScanner } = require('../services/virusScanner');
const db = require('../models/database');

const router = express.Router();

/**
 * Get virus scanner status and configuration
 */
router.get('/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const scanner = getVirusScanner();
    const status = await scanner.getEnhancedStatus();
    const statistics = scanner.getStatistics();

    res.json({
      status: status.status || status,
      statistics,
      config: status.config,
      version: status.version
    });
  } catch (error) {
    console.error('Error getting scanner status:', error);
    res.status(500).json({ error: 'Failed to get scanner status' });
  }
});

/**
 * Update virus scanner configuration
 */
router.put('/config', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { config } = req.body;
    
    if (!config || typeof config !== 'object') {
      return res.status(400).json({ error: 'Configuration object required' });
    }

    const client = await db.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Update each configuration value
      for (const [key, value] of Object.entries(config)) {
        const result = await client.query(
          'UPDATE scanner_config SET config_value = $1, updated_at = CURRENT_TIMESTAMP, updated_by = $2 WHERE config_key = $3',
          [String(value), req.user.id, key]
        );
        
        // Log if no rows were affected (config key doesn't exist)
        if (result.rowCount === 0) {
          console.warn(`Configuration key '${key}' not found in database`);
        }
      }
      
      await client.query('COMMIT');
      
      // Apply runtime changes if applicable
      const scanner = getVirusScanner();
      
      if (config.enabled !== undefined) {
        if (config.enabled) {
          await scanner.enable();
        } else {
          scanner.disable();
        }
      }
      
      res.json({ 
        message: 'Configuration updated successfully',
        status: scanner.getStatus()
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error updating scanner config:', error);
    res.status(500).json({ error: 'Failed to update configuration' });
  }
});

/**
 * Test virus scanner
 */
router.post('/test', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const scanner = getVirusScanner();
    const testResult = await scanner.test();
    
    res.json(testResult);
  } catch (error) {
    console.error('Error testing scanner:', error);
    res.status(500).json({ error: 'Scanner test failed' });
  }
});

/**
 * Enable virus scanning
 */
router.post('/enable', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const scanner = getVirusScanner();
    const result = await scanner.enable();
    
    // Update database configuration
    await db.query(
      'UPDATE scanner_config SET config_value = $1, updated_at = CURRENT_TIMESTAMP, updated_by = $2 WHERE config_key = $3',
      ['true', req.user.id, 'enabled']
    );
    
    res.json(result);
  } catch (error) {
    console.error('Error enabling scanner:', error);
    res.status(500).json({ error: 'Failed to enable scanner' });
  }
});

/**
 * Disable virus scanning
 */
router.post('/disable', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const scanner = getVirusScanner();
    const result = scanner.disable();
    
    // Update database configuration
    await db.query(
      'UPDATE scanner_config SET config_value = $1, updated_at = CURRENT_TIMESTAMP, updated_by = $2 WHERE config_key = $3',
      ['false', req.user.id, 'enabled']
    );
    
    res.json(result);
  } catch (error) {
    console.error('Error disabling scanner:', error);
    res.status(500).json({ error: 'Failed to disable scanner' });
  }
});

/**
 * Get scanning statistics
 */
router.get('/statistics', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    
    // Get statistics from scan_history table
    const historyStatsResult = await db.query(`
      SELECT 
        COUNT(*) as total_scans,
        COUNT(*) FILTER (WHERE scan_status = 'clean') as clean_files,
        COUNT(*) FILTER (WHERE scan_status = 'infected') as infected_files,
        COUNT(*) FILTER (WHERE scan_status = 'error') as scan_errors,
        ROUND(AVG(scan_duration_ms)::numeric, 2) as avg_scan_time,
        (SELECT COUNT(*) FROM quarantine_files WHERE quarantined_at > NOW() - INTERVAL '1 day' * $1) as quarantined_files
      FROM scan_history
      WHERE scanned_at > NOW() - INTERVAL '1 day' * $1
    `, [days]);
    
    const dbStats = historyStatsResult.rows[0] || {};
    
    // Ensure proper number conversion from PostgreSQL
    if (dbStats.total_scans) {
      dbStats.total_scans = parseInt(dbStats.total_scans);
      dbStats.clean_files = parseInt(dbStats.clean_files) || 0;
      dbStats.infected_files = parseInt(dbStats.infected_files) || 0;
      dbStats.scan_errors = parseInt(dbStats.scan_errors) || 0;
      dbStats.quarantined_files = parseInt(dbStats.quarantined_files) || 0;
    }
    
    // Get real-time scanner statistics
    const scanner = getVirusScanner();
    const scannerStats = scanner.getStatistics();
    
    // Get recent scan activity from scan_history table
    const recentScansResult = await db.query(`
      SELECT 
        DATE_TRUNC('day', scanned_at) as date,
        COUNT(*) as total_scans,
        COUNT(*) FILTER (WHERE scan_status = 'clean') as clean_files,
        COUNT(*) FILTER (WHERE scan_status = 'infected') as infected_files,
        COUNT(*) FILTER (WHERE scan_status = 'error') as error_files,
        ROUND(AVG(scan_duration_ms)::numeric, 2) as avg_scan_time
      FROM scan_history
      WHERE scanned_at > NOW() - INTERVAL '1 day' * $1
      GROUP BY DATE_TRUNC('day', scanned_at)
      ORDER BY date DESC
    `, [days]);
    
    // Get threat breakdown from scan_history table
    const threatsResult = await db.query(`
      SELECT 
        threat_name,
        COUNT(*) as count
      FROM scan_history
      WHERE scan_status = 'infected' 
      AND scanned_at > NOW() - INTERVAL '1 day' * $1
      AND threat_name IS NOT NULL
      GROUP BY threat_name
      ORDER BY count DESC
      LIMIT 10
    `, [days]);
    
    res.json({
      summary: {
        ...dbStats,
        ...scannerStats
      },
      daily_activity: recentScansResult.rows,
      top_threats: threatsResult.rows,
      period_days: days
    });
  } catch (error) {
    console.error('Error getting statistics:', error);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});

/**
 * Get quarantine files
 */
router.get('/quarantine', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    const status = req.query.status;
    
    let whereClause = '';
    let params = [limit, offset];
    
    if (status) {
      whereClause = 'WHERE status = $3';
      params.push(status);
    }
    
    const result = await db.query(`
      SELECT q.*, u.username as uploader_username
      FROM quarantine_files q
      LEFT JOIN users u ON q.uploader_id = u.id
      ${whereClause}
      ORDER BY q.quarantined_at DESC
      LIMIT $1 OFFSET $2
    `, params);
    
    // Get total count
    const countParams = status ? [status] : [];
    const countResult = await db.query(`
      SELECT COUNT(*) as total
      FROM quarantine_files
      ${status ? 'WHERE status = $1' : ''}
    `, countParams);
    
    res.json({
      files: result.rows,
      pagination: {
        page,
        limit,
        total: parseInt(countResult.rows[0].total),
        pages: Math.ceil(countResult.rows[0].total / limit)
      }
    });
  } catch (error) {
    console.error('Error getting quarantine files:', error);
    res.status(500).json({ error: 'Failed to get quarantine files' });
  }
});

/**
 * Update quarantine file status
 */
router.put('/quarantine/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    
    if (!['confirmed_threat', 'false_positive', 'deleted'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    const result = await db.query(
      'UPDATE quarantine_files SET status = $1, reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *',
      [status, req.user.id, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Quarantine file not found' });
    }
    
    res.json({
      message: 'Quarantine file status updated',
      file: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating quarantine file:', error);
    res.status(500).json({ error: 'Failed to update quarantine file' });
  }
});

/**
 * Delete quarantine file
 */
router.delete('/quarantine/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await db.query(
      'DELETE FROM quarantine_files WHERE id = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Quarantine file not found' });
    }
    
    // TODO: Also delete the physical quarantine file if it exists
    
    res.json({ message: 'Quarantine file deleted' });
  } catch (error) {
    console.error('Error deleting quarantine file:', error);
    res.status(500).json({ error: 'Failed to delete quarantine file' });
  }
});

/**
 * Cleanup old quarantine files
 */
router.post('/cleanup', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await db.query('SELECT cleanup_old_quarantine_files()');
    
    res.json({ message: 'Quarantine cleanup completed' });
  } catch (error) {
    console.error('Error during quarantine cleanup:', error);
    res.status(500).json({ error: 'Cleanup failed' });
  }
});

/**
 * Get scan history with threats
 */
router.get('/scan-history', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    const status = req.query.status;
    const days = parseInt(req.query.days) || 30;
    
    let whereClause = 'WHERE scanned_at > NOW() - INTERVAL \'1 day\' * $3';
    let params = [limit, offset, days];
    
    if (status) {
      whereClause += ' AND scan_status = $4';
      params.push(status);
    }
    
    const result = await db.query(`
      SELECT 
        sh.*,
        u.username as uploader_username,
        f.filename as original_filename
      FROM scan_history sh
      LEFT JOIN users u ON sh.uploader_id = u.id
      LEFT JOIN files f ON sh.file_id = f.id
      ${whereClause}
      ORDER BY sh.scanned_at DESC
      LIMIT $1 OFFSET $2
    `, params);
    
    // Get total count
    const countParams = [days];
    let countWhere = 'WHERE scanned_at > NOW() - INTERVAL \'1 day\' * $1';
    if (status) {
      countWhere += ' AND scan_status = $2';
      countParams.push(status);
    }
    
    const countResult = await db.query(`
      SELECT COUNT(*) as total
      FROM scan_history
      ${countWhere}
    `, countParams);
    
    res.json({
      scans: result.rows,
      pagination: {
        page,
        limit,
        total: parseInt(countResult.rows[0].total),
        pages: Math.ceil(countResult.rows[0].total / limit)
      }
    });
  } catch (error) {
    console.error('Error getting scan history:', error);
    res.status(500).json({ error: 'Failed to get scan history' });
  }
});

/**
 * Get threat analysis
 */
router.get('/threats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    
    // Get threat statistics
    const threatStatsResult = await db.query(`
      SELECT 
        threat_name,
        COUNT(*) as count,
        MAX(scanned_at) as last_detected,
        ARRAY_AGG(DISTINCT file_name) as affected_files
      FROM scan_history
      WHERE scan_status = 'infected' 
      AND scanned_at > NOW() - INTERVAL '1 day' * $1
      AND threat_name IS NOT NULL
      GROUP BY threat_name
      ORDER BY count DESC
    `, [days]);
    
    // Get recent threats
    const recentThreatsResult = await db.query(`
      SELECT 
        sh.*,
        u.username as uploader_username,
        f.filename as original_filename
      FROM scan_history sh
      LEFT JOIN users u ON sh.uploader_id = u.id
      LEFT JOIN files f ON sh.file_id = f.id
      WHERE sh.scan_status = 'infected' 
      AND sh.scanned_at > NOW() - INTERVAL '1 day' * $1
      ORDER BY sh.scanned_at DESC
      LIMIT 20
    `, [days]);
    
    // Get threat trends
    const trendResult = await db.query(`
      SELECT 
        DATE_TRUNC('day', scanned_at) as date,
        COUNT(*) as threat_count,
        COUNT(DISTINCT threat_name) as unique_threats
      FROM scan_history
      WHERE scan_status = 'infected' 
      AND scanned_at > NOW() - INTERVAL '1 day' * $1
      GROUP BY DATE_TRUNC('day', scanned_at)
      ORDER BY date DESC
    `, [days]);
    
    res.json({
      threatStats: threatStatsResult.rows,
      recentThreats: recentThreatsResult.rows,
      threatTrends: trendResult.rows,
      period_days: days
    });
  } catch (error) {
    console.error('Error getting threat analysis:', error);
    res.status(500).json({ error: 'Failed to get threat analysis' });
  }
});

/**
 * Bulk update quarantine files
 */
router.post('/quarantine/bulk-update', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { ids, status, notes } = req.body;
    
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Array of IDs required' });
    }
    
    if (!['confirmed_threat', 'false_positive', 'deleted'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    const result = await db.query(
      'UPDATE quarantine_files SET status = $1, reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP WHERE id = ANY($3::int[]) RETURNING *',
      [status, req.user.id, ids]
    );
    
    res.json({
      message: `Updated ${result.rows.length} quarantine files`,
      files: result.rows
    });
  } catch (error) {
    console.error('Error bulk updating quarantine files:', error);
    res.status(500).json({ error: 'Failed to bulk update quarantine files' });
  }
});

module.exports = router;