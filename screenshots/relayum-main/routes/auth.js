const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../models/database');
const { authenticateToken } = require('../middleware/auth');
const DatabaseUtils = require('../utils/dbUtils');
const { parseFileSize } = require('../utils/fileSizeUtils');

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const clientIp = req.ip || req.connection.remoteAddress;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    // Check if IP is manually banned
    const manualBan = await db.query(`
      SELECT id, reason, expires_at, banned_at
      FROM ip_bans 
      WHERE ip_address = $1 
      AND is_active = true 
      AND (expires_at IS NULL OR expires_at > NOW())
    `, [clientIp]);
    
    if (manualBan.rows.length > 0) {
      // Log the blocked attempt
      await db.query(
        'INSERT INTO login_attempts (ip_address, username, successful, user_agent) VALUES ($1, $2, $3, $4)',
        [clientIp, username, false, req.get('User-Agent')]
      );
      
      const banInfo = manualBan.rows[0];
      const banMessage = banInfo.reason ? 
        `Access denied: ${banInfo.reason}` : 
        'Your IP address has been banned. Please contact support.';
      
      return res.status(403).json({ 
        error: banMessage,
        ban_type: 'manual',
        banned_at: banInfo.banned_at,
        expires_at: banInfo.expires_at
      });
    }

    // Check if IP is currently blocked due to too many failed attempts
    const blockDuration = parseInt(process.env.LOGIN_BLOCK_DURATION) || 900000; // 15 minutes default
    const attemptLimit = parseInt(process.env.LOGIN_ATTEMPT_LIMIT) || 5;
    
    const recentAttempts = await db.query(
      `SELECT COUNT(*) as count FROM login_attempts WHERE ip_address = $1 AND successful = false AND attempt_time > NOW() - INTERVAL '${blockDuration} milliseconds'`,
      [clientIp]
    );

    if (parseInt(recentAttempts.rows[0].count) >= attemptLimit) {
      // Log the blocked attempt
      await db.query(
        'INSERT INTO login_attempts (ip_address, username, successful, user_agent) VALUES ($1, $2, $3, $4)',
        [clientIp, username, false, req.get('User-Agent')]
      );
      return res.status(429).json({ error: 'Too many failed login attempts. Please try again later.' });
    }

    const user = await db.query(
      'SELECT id, username, email, password_hash, role FROM users WHERE username = $1',
      [username]
    );

    if (user.rows.length === 0) {
      // Log failed attempt
      await db.query(
        'INSERT INTO login_attempts (ip_address, username, successful, user_agent) VALUES ($1, $2, $3, $4)',
        [clientIp, username, false, req.get('User-Agent')]
      );
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValidPassword = await bcrypt.compare(password, user.rows[0].password_hash);
    
    if (!isValidPassword) {
      // Log failed attempt
      await db.query(
        'INSERT INTO login_attempts (ip_address, username, successful, user_agent) VALUES ($1, $2, $3, $4)',
        [clientIp, username, false, req.get('User-Agent')]
      );
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Log successful attempt
    await db.query(
      'INSERT INTO login_attempts (ip_address, username, successful, user_agent) VALUES ($1, $2, $3, $4)',
      [clientIp, username, true, req.get('User-Agent')]
    );

    // Generate access token (shorter lived)
    const accessToken = jwt.sign(
      { userId: user.rows[0].id, type: 'access' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Generate refresh token (longer lived)
    const refreshToken = jwt.sign(
      { userId: user.rows[0].id, type: 'refresh' },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: '7d' }
    );

    // Store refresh token in database
    await db.query(
      'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.rows[0].id, refreshToken, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)]
    );

    const { password_hash, ...userWithoutPassword } = user.rows[0];

    // Set httpOnly cookie for refresh token
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // Allow cross-site for production tunnels
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({
      token: accessToken,
      user: userWithoutPassword
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/register', async (req, res) => {
  try {
    // Check if registration is allowed
    if (process.env.ALLOW_REGISTRATION === 'false') {
      return res.status(403).json({ error: 'User registration is disabled' });
    }

    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existingUser = await db.query(
      'SELECT id FROM users WHERE username = $1 OR email = $2',
      [username, email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'Username or email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await db.query(
      'INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, username, email, role',
      [username, email, hashedPassword, 'user']
    );

    const token = jwt.sign(
      { userId: newUser.rows[0].id },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      token,
      user: newUser.rows[0]
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.get('/me', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

// Token refresh endpoint
router.post('/refresh', async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    
    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token not provided' });
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    
    if (decoded.type !== 'refresh') {
      return res.status(401).json({ error: 'Invalid token type' });
    }

    // Check if refresh token exists in database
    const tokenRecord = await db.query(
      'SELECT user_id FROM refresh_tokens WHERE token = $1 AND expires_at > NOW()',
      [refreshToken]
    );

    if (tokenRecord.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    // Generate new access token
    const newAccessToken = jwt.sign(
      { userId: decoded.userId, type: 'access' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.json({
      token: newAccessToken
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

router.post('/logout', authenticateToken, async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    
    // Remove refresh token from database
    if (refreshToken) {
      await db.query(
        'DELETE FROM refresh_tokens WHERE token = $1',
        [refreshToken]
      );
    }

    // Clear the refresh token cookie
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// Logout from all devices
router.post('/logout-all', authenticateToken, async (req, res) => {
  try {
    // Remove all refresh tokens for this user
    await db.query(
      'DELETE FROM refresh_tokens WHERE user_id = $1',
      [req.user.id]
    );

    // Clear the refresh token cookie
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });

    res.json({ message: 'Logged out from all devices successfully' });
  } catch (error) {
    console.error('Logout all error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// Check username availability
router.get('/check-username/:username', async (req, res) => {
  try {
    const { username } = req.params;
    
    if (!username || username.length < 2) {
      return res.status(400).json({ error: 'Username must be at least 2 characters' });
    }
    
    // Check if username already exists
    const existingUser = await db.query(
      'SELECT id FROM users WHERE username = $1',
      [username]
    );
    
    const isAvailable = existingUser.rows.length === 0;
    
    res.json({ 
      available: isAvailable,
      username: username
    });
  } catch (error) {
    console.error('Username check error:', error);
    res.status(500).json({ error: 'Failed to check username availability' });
  }
});

// Get system configuration
router.get('/config', (req, res) => {
  const defaultDiskQuotaBytes = parseFileSize(process.env.DEFAULT_DISK_QUOTA || '10GB');
  const maxFileSizeBytes = parseFileSize(process.env.MAX_FILE_SIZE || '100MB');
  const anonymousMaxFileSizeBytes = parseFileSize(process.env.ANONYMOUS_MAX_FILE_SIZE || process.env.MAX_FILE_SIZE || '100MB');
  
  // Helper function to format file size
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };
  
  res.json({
    allowRegistration: process.env.ALLOW_REGISTRATION !== 'false',
    allowAnonymousSharing: process.env.ALLOW_ANONYMOUS_SHARING !== 'false',
    anonymousMaxFileSize: anonymousMaxFileSizeBytes,
    anonymousMaxFileSizeFormatted: formatFileSize(anonymousMaxFileSizeBytes),
    maxFileSize: maxFileSizeBytes,
    maxFileSizeFormatted: formatFileSize(maxFileSizeBytes),
    defaultDiskQuota: defaultDiskQuotaBytes,
    defaultDiskQuotaFormatted: formatFileSize(defaultDiskQuotaBytes),
    anonymousShareExpirationDays: parseInt(process.env.ANONYMOUS_SHARE_EXPIRATION_DAYS || '7'),
    enableLandingPage: process.env.ENABLE_LANDING_PAGE !== 'false'
  });
});

module.exports = router;