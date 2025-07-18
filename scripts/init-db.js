const db = require('../models/database');
const bcrypt = require('bcryptjs');

async function initDatabase() {
  try {
    console.log('Creating database tables...');
    
    // Create users table
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(10) CHECK (role IN ('admin', 'user')) DEFAULT 'user',
        disk_quota_bytes BIGINT DEFAULT 1073741824,
        disk_used_bytes BIGINT DEFAULT 0,
        file_expiration_days INTEGER DEFAULT 30,
        last_quota_check TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create folders table
    await db.query(`
      CREATE TABLE IF NOT EXISTS folders (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        parent_id INTEGER REFERENCES folders(id) ON DELETE CASCADE,
        owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create files table with all necessary columns
    await db.query(`
      CREATE TABLE IF NOT EXISTS files (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL,
        filepath VARCHAR(500) NOT NULL,
        size BIGINT NOT NULL,
        mime_type VARCHAR(100),
        uploader_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        folder_id INTEGER REFERENCES folders(id) ON DELETE SET NULL,
        scan_status VARCHAR(20) CHECK (scan_status IN ('pending', 'scanning', 'clean', 'infected', 'error', 'disabled', 'unavailable')) DEFAULT 'pending',
        scan_date TIMESTAMP,
        threat_name VARCHAR(255),
        scan_engine VARCHAR(100),
        scan_duration_ms INTEGER,
        file_id VARCHAR(64) UNIQUE,
        encrypted BOOLEAN DEFAULT FALSE,
        file_hash VARCHAR(64),
        encryption_version VARCHAR(10) DEFAULT '1.0',
        expires_at TIMESTAMP,
        download_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create shares table with all necessary columns
    await db.query(`
      CREATE TABLE IF NOT EXISTS shares (
        id SERIAL PRIMARY KEY,
        file_id INTEGER REFERENCES files(id) ON DELETE CASCADE,
        folder_id INTEGER REFERENCES folders(id) ON DELETE CASCADE,
        shared_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
        shared_with INTEGER REFERENCES users(id) ON DELETE CASCADE,
        public_token VARCHAR(64),
        private_token VARCHAR(64) UNIQUE,
        is_viewed BOOLEAN DEFAULT FALSE,
        viewed_at TIMESTAMP,
        expires_at TIMESTAMP,
        share_password VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_file_or_folder CHECK ((file_id IS NOT NULL AND folder_id IS NULL) OR (file_id IS NULL AND folder_id IS NOT NULL))
      )
    `);

    // Create scanner configuration table
    await db.query(`
      CREATE TABLE IF NOT EXISTS scanner_config (
        id SERIAL PRIMARY KEY,
        config_key VARCHAR(100) UNIQUE NOT NULL,
        config_value TEXT,
        config_type VARCHAR(20) CHECK (config_type IN ('string', 'boolean', 'integer', 'json')) DEFAULT 'string',
        description TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_by INTEGER REFERENCES users(id)
      )
    `);

    // Create scan results table
    await db.query(`
      CREATE TABLE IF NOT EXISTS scan_results (
        id SERIAL PRIMARY KEY,
        file_id INTEGER REFERENCES files(id) ON DELETE CASCADE,
        scan_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        engine_version VARCHAR(100),
        signature_version VARCHAR(100),
        scan_result VARCHAR(20) CHECK (scan_result IN ('clean', 'infected', 'error', 'timeout', 'disabled', 'unavailable')),
        threat_name VARCHAR(255),
        scan_duration_ms INTEGER,
        file_hash VARCHAR(64),
        scan_mode VARCHAR(20),
        additional_info JSONB
      )
    `);

    // Create quarantine files table
    await db.query(`
      CREATE TABLE IF NOT EXISTS quarantine_files (
        id SERIAL PRIMARY KEY,
        original_filename VARCHAR(255),
        file_path VARCHAR(500),
        file_size BIGINT,
        mime_type VARCHAR(100),
        threat_name VARCHAR(255),
        uploader_id INTEGER REFERENCES users(id),
        quarantined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        reviewed_by INTEGER REFERENCES users(id),
        reviewed_at TIMESTAMP,
        status VARCHAR(20) CHECK (status IN ('quarantined', 'confirmed_threat', 'false_positive', 'deleted')) DEFAULT 'quarantined',
        scan_details JSONB,
        file_hash VARCHAR(64)
      )
    `);

    // Create all indexes
    await db.query(`CREATE INDEX IF NOT EXISTS idx_shares_public_token ON shares(public_token)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_shares_private_token ON shares(private_token)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_shares_shared_with ON shares(shared_with)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_shares_is_viewed ON shares(is_viewed)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_files_uploader ON files(uploader_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_files_folder ON files(folder_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_files_scan_status ON files(scan_status)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_files_scan_date ON files(scan_date)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_files_file_id ON files(file_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_files_encrypted ON files(encrypted)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_files_expires_at ON files(expires_at)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_files_download_count ON files(download_count)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_folders_owner ON folders(owner_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_scan_results_file_id ON scan_results(file_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_scan_results_scan_date ON scan_results(scan_date)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_scan_results_scan_result ON scan_results(scan_result)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_quarantine_files_uploader_id ON quarantine_files(uploader_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_quarantine_files_status ON quarantine_files(status)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_quarantine_files_quarantined_at ON quarantine_files(quarantined_at)`);

    // Insert default scanner configuration (respecting environment variables)
    const virusScanningEnabled = process.env.ENABLE_VIRUS_SCANNING === 'true' ? 'true' : 'false';
    const virusScanningRequired = process.env.CLAMAV_REQUIRED === 'true' ? 'true' : 'false';
    const virusScanMode = process.env.VIRUS_SCAN_MODE || 'async';
    const virusScanTimeout = process.env.CLAMAV_TIMEOUT || '30000';
    
    await db.query(`
      INSERT INTO scanner_config (config_key, config_value, config_type, description) 
      VALUES 
        ('enabled', $1, 'boolean', 'Enable virus scanning'),
        ('required', $2, 'boolean', 'Require virus scanning (block uploads if scanner unavailable)'),
        ('mode', $3, 'string', 'Scan mode: sync, async, or disabled'),
        ('timeout', $4, 'integer', 'Scanner timeout in milliseconds'),
        ('quarantine_retention_days', '30', 'integer', 'Days to retain quarantined files')
      ON CONFLICT (config_key) DO NOTHING
    `, [virusScanningEnabled, virusScanningRequired, virusScanMode, virusScanTimeout]);

    // Create cleanup function for old quarantine files
    await db.query(`
      CREATE OR REPLACE FUNCTION cleanup_old_quarantine_files()
      RETURNS void AS $$
      DECLARE
        retention_days INTEGER;
      BEGIN
        SELECT config_value::INTEGER INTO retention_days 
        FROM scanner_config 
        WHERE config_key = 'quarantine_retention_days';
        
        IF retention_days IS NULL THEN
          retention_days := 30;
        END IF;
        
        DELETE FROM quarantine_files 
        WHERE quarantined_at < NOW() - INTERVAL '1 day' * retention_days
        AND status IN ('confirmed_threat', 'deleted');
        
        RAISE NOTICE 'Cleaned up quarantine files older than % days', retention_days;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Create function to get scanner statistics
    await db.query(`
      CREATE OR REPLACE FUNCTION get_scanner_statistics(days_back INTEGER DEFAULT 30)
      RETURNS TABLE(
        total_scans BIGINT,
        clean_files BIGINT,
        infected_files BIGINT,
        scan_errors BIGINT,
        avg_scan_time NUMERIC,
        quarantined_files BIGINT
      ) AS $$
      BEGIN
        RETURN QUERY
        SELECT 
          COUNT(*) as total_scans,
          COUNT(*) FILTER (WHERE scan_result = 'clean') as clean_files,
          COUNT(*) FILTER (WHERE scan_result = 'infected') as infected_files,
          COUNT(*) FILTER (WHERE scan_result = 'error') as scan_errors,
          AVG(scan_duration_ms) as avg_scan_time,
          (SELECT COUNT(*) FROM quarantine_files WHERE quarantined_at > NOW() - INTERVAL '1 day' * days_back) as quarantined_files
        FROM scan_results 
        WHERE scan_date > NOW() - INTERVAL '1 day' * days_back;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Create cleanup function for expired refresh tokens
    await db.query(`
      CREATE OR REPLACE FUNCTION cleanup_expired_refresh_tokens()
      RETURNS void AS $$
      BEGIN
        DELETE FROM refresh_tokens WHERE expires_at < NOW();
        RAISE NOTICE 'Cleaned up expired refresh tokens';
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Create login_attempts table for tracking failed login attempts
    await db.query(`
      CREATE TABLE IF NOT EXISTS login_attempts (
        id SERIAL PRIMARY KEY,
        ip_address INET NOT NULL,
        username VARCHAR(50),
        successful BOOLEAN DEFAULT FALSE,
        attempt_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        user_agent TEXT
      )
    `);

    // Create refresh_tokens table for JWT refresh tokens
    await db.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        revoked_at TIMESTAMP,
        is_revoked BOOLEAN DEFAULT FALSE
      )
    `);

    // Create admin_overrides table for per-user admin overrides
    await db.query(`
      CREATE TABLE IF NOT EXISTS admin_overrides (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        override_type VARCHAR(50) NOT NULL CHECK (override_type IN ('disk_quota', 'file_expiration', 'registration')),
        override_value TEXT NOT NULL,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, override_type)
      )
    `);

    // Create scan_history table for virus scanning audit trail
    await db.query(`
      CREATE TABLE IF NOT EXISTS scan_history (
        id SERIAL PRIMARY KEY,
        file_id INTEGER,
        file_name VARCHAR(255) NOT NULL,
        file_size BIGINT,
        mime_type VARCHAR(255),
        uploader_id INTEGER,
        scan_status VARCHAR(50) NOT NULL,
        threat_name VARCHAR(255),
        scan_duration_ms INTEGER,
        scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        details JSONB
      )
    `);

    // Create anonymous_shares table for anonymous sharing functionality
    await db.query(`
      CREATE TABLE IF NOT EXISTS anonymous_shares (
        id SERIAL PRIMARY KEY,
        share_token VARCHAR(255) UNIQUE NOT NULL,
        file_id INTEGER REFERENCES files(id) ON DELETE CASCADE,
        folder_id INTEGER REFERENCES folders(id) ON DELETE CASCADE,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        access_count INTEGER DEFAULT 0,
        max_access_count INTEGER,
        password_hash TEXT
      )
    `);

    // Create anonymous_files table for anonymous file uploads
    await db.query(`
      CREATE TABLE IF NOT EXISTS anonymous_files (
        id SERIAL PRIMARY KEY,
        anonymous_share_id INTEGER NOT NULL REFERENCES anonymous_shares(id) ON DELETE CASCADE,
        original_filename VARCHAR(255) NOT NULL,
        file_path TEXT NOT NULL,
        file_size BIGINT NOT NULL,
        encryption_key TEXT NOT NULL,
        mime_type VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create admin_actions table for logging admin activities
    await db.query(`
      CREATE TABLE IF NOT EXISTS admin_actions (
        id SERIAL PRIMARY KEY,
        admin_id INTEGER REFERENCES users(id),
        action_type VARCHAR(100) NOT NULL,
        target_user_id INTEGER REFERENCES users(id),
        action_details JSONB,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create ip_bans table for manual IP address banning
    await db.query(`
      CREATE TABLE IF NOT EXISTS ip_bans (
        id SERIAL PRIMARY KEY,
        ip_address INET NOT NULL,
        banned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        banned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        reason TEXT,
        expires_at TIMESTAMP,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create additional indexes for the new tables
    await db.query(`CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time ON login_attempts(ip_address, attempt_time)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_login_attempts_successful ON login_attempts(successful)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_admin_overrides_user_id ON admin_overrides(user_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_admin_overrides_type ON admin_overrides(override_type)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_admin_overrides_created_by ON admin_overrides(created_by)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_scan_history_file_id ON scan_history(file_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_scan_history_scanned_at ON scan_history(scanned_at)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_scan_history_scan_status ON scan_history(scan_status)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_scan_history_uploader_id ON scan_history(uploader_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_anonymous_shares_token ON anonymous_shares(share_token)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_anonymous_shares_expires_at ON anonymous_shares(expires_at)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_anonymous_shares_created_by ON anonymous_shares(created_by)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_anonymous_files_share_id ON anonymous_files(anonymous_share_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_anonymous_files_created_at ON anonymous_files(created_at)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_admin_actions_admin_id ON admin_actions(admin_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_admin_actions_target_user ON admin_actions(target_user_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_admin_actions_timestamp ON admin_actions(timestamp)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_admin_actions_type ON admin_actions(action_type)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_ip_bans_ip_address ON ip_bans(ip_address)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_ip_bans_is_active ON ip_bans(is_active)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_ip_bans_expires_at ON ip_bans(expires_at)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_ip_bans_banned_at ON ip_bans(banned_at)`);

    const adminExists = await db.query('SELECT id FROM users WHERE role = $1', ['admin']);
    const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'admin123', 10);
    
    if (adminExists.rows.length === 0) {
      console.log('Creating admin user...');
      
      await db.query(
        'INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4)',
        [
          process.env.ADMIN_USERNAME || 'admin',
          process.env.ADMIN_EMAIL || 'admin@localhost',
          hashedPassword,
          'admin'
        ]
      );
      console.log('Admin user created successfully');
    } else {
      console.log('Admin user already exists. Updating password...');
      const adminId = adminExists.rows[0].id;
      await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashedPassword, adminId]);
      console.log('Admin password updated successfully');
    }

    console.log('Database initialization completed successfully');
  } catch (error) {
    console.error('Database initialization failed:', error);
    throw error;
  }
}

// Export the function for use in server.js
module.exports = initDatabase;

// Run directly if called as a script
if (require.main === module) {
  initDatabase()
    .then(() => {
      console.log('Database initialization completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('Database initialization failed:', error);
      process.exit(1);
    });
}