const { logger } = require('../middleware/security');
const { parseFileSize } = require('../utils/fileSizeUtils');

/**
 * Optional Virus Scanner Service
 * Provides virus scanning capabilities with graceful fallbacks when scanner is unavailable
 */
class OptionalVirusScanner {
  constructor() {
    // Default values from environment
    this.enabled = process.env.ENABLE_VIRUS_SCANNING === 'true';
    this.required = process.env.CLAMAV_REQUIRED === 'true';
    this.host = process.env.CLAMAV_HOST || 'clamav';
    this.port = parseInt(process.env.CLAMAV_PORT || '3310');
    this.timeout = parseInt(process.env.CLAMAV_TIMEOUT || '30000');
    this.scanMode = process.env.VIRUS_SCAN_MODE || 'async'; // sync, async, disabled
    this.maxFileSize = parseFileSize(process.env.VIRUS_SCAN_MAX_FILE_SIZE || '50MB');
    
    this.available = false;
    this.lastHealthCheck = null;
    this.healthCheckInterval = 60000; // 1 minute
    this.clamClient = null;
    this.backgroundRetryInterval = null;
    
    // Initialization is now deferred until explicitly called
  }

  /**
   * Initialize scanner with database configuration
   */
  async initialize() {
    try {
      // Check if virus scanning is explicitly disabled via environment
      const envDisabled = process.env.ENABLE_VIRUS_SCANNING === 'false' || 
                         process.env.VIRUS_SCAN_MODE === 'disabled';
      
      if (envDisabled) {
        logger.info('Virus scanning explicitly disabled via environment variables');
        this.enabled = false;
        this.scanMode = 'disabled';
        
        // Update database to match environment setting
        await this.updateDatabaseConfig();
      } else {
        // Load configuration from database only if not explicitly disabled
        await this.loadConfigFromDatabase();
        
        // Environment variables take precedence over database configuration
        await this.syncEnvironmentToDatabase();
      }
      
      // Initialize ClamAV client if enabled
      if (this.enabled) {
        await this.initializeScannerWithRetry();
      }
      
      logger.info('Virus scanner initialized', {
        enabled: this.enabled,
        required: this.required,
        mode: this.scanMode,
        host: this.host,
        port: this.port,
        available: this.available
      });
    } catch (error) {
      logger.warn('Failed to load scanner configuration from database, using environment defaults', {
        error: error.message
      });
      
      // Fall back to environment-based initialization
      if (this.enabled) {
        await this.initializeScannerWithRetry();
      }
    }
  }

  /**
   * Initialize scanner with retry logic for startup timing issues
   */
  async initializeScannerWithRetry(maxRetries = 10, retryDelay = 10000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.info(`Attempting to initialize ClamAV scanner (attempt ${attempt}/${maxRetries})`, {
          host: this.host,
          port: this.port,
          timeout: this.timeout
        });
        
        await this.initializeScanner();
        
        if (this.available) {
          logger.info('ClamAV scanner initialization successful', {
            attempt,
            available: this.available,
            version: await this.getVersion()
          });
          return;
        } else {
          throw new Error('Scanner initialized but health check failed');
        }
      } catch (error) {
        logger.warn(`ClamAV scanner initialization attempt ${attempt} failed`, {
          error: error.message,
          attempt,
          maxRetries,
          willRetry: attempt < maxRetries
        });
        
        if (attempt < maxRetries) {
          logger.info(`Waiting ${retryDelay}ms before next attempt...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          // Exponential backoff: increase delay for next attempt
          retryDelay = Math.min(retryDelay * 1.5, 30000);
        } else {
          // Final attempt failed
          this.available = false;
          
          if (this.required) {
            throw new Error(`ClamAV scanner is required but failed to initialize after ${maxRetries} attempts: ${error.message}`);
          } else {
            logger.warn(`ClamAV scanner failed to initialize after ${maxRetries} attempts, starting background retry process`, {
              error: error.message,
              enabled: this.enabled,
              required: this.required
            });
            
            // Start background retry process
            this.startBackgroundRetry();
          }
        }
      }
    }
  }

  /**
   * Start background retry process to connect to ClamAV when it becomes available
   */
  startBackgroundRetry() {
    if (this.backgroundRetryInterval) {
      clearInterval(this.backgroundRetryInterval);
    }
    
    logger.info('Starting background ClamAV connection retry process');
    
    this.backgroundRetryInterval = setInterval(async () => {
      if (!this.enabled || this.available) {
        // Stop retrying if disabled or already connected
        clearInterval(this.backgroundRetryInterval);
        this.backgroundRetryInterval = null;
        return;
      }
      
      try {
        logger.info('Background retry: attempting ClamAV connection');
        await this.initializeScanner();
        
        if (this.available) {
          logger.info('Background retry successful: ClamAV scanner is now available');
          clearInterval(this.backgroundRetryInterval);
          this.backgroundRetryInterval = null;
        }
      } catch (error) {
        logger.debug('Background retry failed, will try again in 30 seconds', {
          error: error.message
        });
      }
    }, 30000); // Retry every 30 seconds
  }

  /**
   * Update database configuration to match environment settings
   */
  async updateDatabaseConfig() {
    try {
      const db = require('../models/database');
      
      // Check if scanner_config table exists
      const tableExists = await db.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'scanner_config'
        )
      `);
      
      if (!tableExists.rows[0].exists) {
        logger.debug('Scanner config table does not exist, skipping database update');
        return;
      }
      
      // Update database with current environment settings
      const updates = [
        { key: 'enabled', value: this.enabled, type: 'boolean' },
        { key: 'required', value: this.required, type: 'boolean' },
        { key: 'mode', value: this.scanMode, type: 'string' },
        { key: 'timeout', value: this.timeout, type: 'integer' }
      ];
      
      for (const update of updates) {
        await db.query(`
          INSERT INTO scanner_config (config_key, config_value, config_type) 
          VALUES ($1, $2, $3)
          ON CONFLICT (config_key) 
          DO UPDATE SET 
            config_value = EXCLUDED.config_value,
            config_type = EXCLUDED.config_type,
            updated_at = CURRENT_TIMESTAMP
        `, [update.key, update.value.toString(), update.type]);
      }
      
      logger.info('Database configuration updated to match environment settings');
    } catch (error) {
      logger.warn('Failed to update database configuration', {
        error: error.message
      });
    }
  }

  /**
   * Sync environment variables to database, giving environment precedence
   */
  async syncEnvironmentToDatabase() {
    try {
      // Override database settings with environment variables if they exist
      const envEnabled = process.env.ENABLE_VIRUS_SCANNING;
      const envRequired = process.env.CLAMAV_REQUIRED;
      const envMode = process.env.VIRUS_SCAN_MODE;
      const envTimeout = process.env.CLAMAV_TIMEOUT;
      
      if (envEnabled !== undefined) {
        this.enabled = envEnabled === 'true';
      }
      
      if (envRequired !== undefined) {
        this.required = envRequired === 'true';
      }
      
      if (envMode !== undefined) {
        this.scanMode = envMode;
      }
      
      if (envTimeout !== undefined) {
        this.timeout = parseInt(envTimeout);
      }
      
      // Update database to match environment
      await this.updateDatabaseConfig();
      
      logger.debug('Environment variables synchronized to database');
    } catch (error) {
      logger.warn('Failed to sync environment to database', {
        error: error.message
      });
    }
  }

  /**
   * Load configuration from database
   */
  async loadConfigFromDatabase() {
    try {
      const db = require('../models/database');
      
      // Check if scanner_config table exists first
      const tableExists = await db.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'scanner_config'
        )
      `);
      
      if (!tableExists.rows[0].exists) {
        logger.warn('Scanner config table does not exist, using environment defaults');
        return;
      }
      
      const result = await db.query('SELECT config_key, config_value, config_type FROM scanner_config');
      
      for (const row of result.rows) {
        const { config_key, config_value, config_type } = row;
        
        let value = config_value;
        switch (config_type) {
          case 'boolean':
            value = config_value === 'true';
            break;
          case 'integer':
            value = parseInt(config_value);
            break;
        }
        
        // Apply configuration
        switch (config_key) {
          case 'enabled':
            this.enabled = value;
            break;
          case 'required':
            this.required = value;
            break;
          case 'mode':
            this.scanMode = value;
            break;
          case 'timeout':
            this.timeout = value;
            break;
        }
      }
    } catch (error) {
      logger.warn('Database configuration load failed, using environment defaults', {
        error: error.message
      });
    }
  }

  /**
   * Initialize ClamAV scanner
   */
  async initializeScanner() {
    // Reset state before attempting initialization
    this.available = false;
    this.clamClient = null;
    
    try {
      // Dynamically import clamscan only if scanning is enabled
      const clamscan = require('clamscan');
      
      logger.debug('Creating ClamAV client instance', {
        host: this.host,
        port: this.port,
        timeout: this.timeout
      });
      
      this.clamClient = await new clamscan().init({
        clamdscan: {
          host: this.host,
          port: this.port,
          timeout: this.timeout,
          local_fallback: false,
        },
        preference: 'clamdscan',
        debug_mode: process.env.NODE_ENV === 'development',
      });

      logger.debug('ClamAV client created, performing health check...');
      await this.healthCheck();
      
      if (!this.available) {
        throw new Error('Health check failed after client initialization');
      }
      
      // Set up periodic health checks only after successful initialization
      setInterval(() => this.healthCheck(), this.healthCheckInterval);
      
      logger.info('ClamAV scanner initialized successfully', {
        version: await this.getVersion(),
        available: this.available,
        host: this.host,
        port: this.port
      });
    } catch (error) {
      // Ensure state is properly reset on failure
      this.available = false;
      this.clamClient = null;
      
      logger.warn('Failed to initialize ClamAV scanner', {
        error: error.message,
        stack: error.stack,
        enabled: this.enabled,
        required: this.required,
        host: this.host,
        port: this.port
      });
      
      if (this.required) {
        throw new Error(`ClamAV is required but unavailable: ${error.message}`);
      } else {
        // For non-required scanner, log the error but don't throw
        throw error; // Re-throw so retry logic can handle it
      }
    }
  }

  /**
   * Perform health check on ClamAV scanner
   */
  async healthCheck() {
    if (!this.enabled || !this.clamClient) {
      this.available = false;
      return false;
    }

    try {
      // Use getVersion as a more reliable health check
      const version = await this.clamClient.getVersion();
      if (version && typeof version === 'string' && version.includes('ClamAV')) {
        this.available = true;
        this.lastHealthCheck = new Date();
        
        logger.debug('ClamAV health check passed', { version });
        return true;
      } else {
        throw new Error('Invalid version response');
      }
    } catch (error) {
      this.available = false;
      this.lastHealthCheck = new Date();
      
      logger.warn('ClamAV health check failed', {
        error: error.message,
        required: this.required
      });
      
      return false;
    }
  }

  /**
   * Get scanner version information
   */
  async getVersion() {
    if (!this.enabled || !this.clamClient) {
      return null;
    }

    try {
      return await this.clamClient.getVersion();
    } catch (error) {
      logger.error('Failed to get ClamAV version', { error: error.message });
      return null;
    }
  }

  /**
   * Get scanner status for monitoring
   */
  getStatus() {
    const envDisabled = process.env.ENABLE_VIRUS_SCANNING === 'false' || 
                       process.env.VIRUS_SCAN_MODE === 'disabled';
    
    return {
      enabled: this.enabled,
      required: this.required,
      available: this.available,
      mode: this.scanMode,
      lastHealthCheck: this.lastHealthCheck,
      host: this.host,
      port: this.port,
      environmentDisabled: envDisabled
    };
  }

  /**
   * Get enhanced status including version and configuration
   */
  async getEnhancedStatus() {
    const status = this.getStatus();
    
    try {
      const version = await this.getVersion();
      const db = require('../models/database');
      const configResult = await db.query('SELECT config_key, config_value, config_type, description FROM scanner_config ORDER BY config_key');
      
      const config = {};
      configResult.rows.forEach(row => {
        let value = row.config_value;
        
        switch (row.config_type) {
          case 'boolean':
            value = value === 'true';
            break;
          case 'integer':
            value = parseInt(value);
            break;
        }
        
        config[row.config_key] = {
          value,
          description: row.description,
          type: row.config_type
        };
      });

      return {
        ...status,
        version,
        config
      };
    } catch (error) {
      logger.warn('Failed to get enhanced status', { error: error.message });
      return status;
    }
  }

  /**
   * Enable virus scanning
   */
  async enable() {
    try {
      this.enabled = true;
      
      // Initialize scanner if not already done, using retry logic
      if (!this.clamClient || !this.available) {
        logger.info('Initializing ClamAV client for enable operation');
        await this.initializeScannerWithRetry(2, 2000); // Shorter retry for manual enable
        
        // If still not available, start background retry
        if (!this.available) {
          this.startBackgroundRetry();
        }
      }
      
      // Perform additional health check if client exists but we're not sure about availability
      if (this.clamClient && !this.available) {
        const healthResult = await this.healthCheck();
        logger.debug('Additional health check result', { healthResult });
      }
      
      logger.info('Virus scanning enabled', {
        available: this.available,
        hasClient: !!this.clamClient,
        host: this.host,
        port: this.port
      });

      return {
        success: true,
        message: this.available 
          ? 'Virus scanning enabled successfully' 
          : 'Virus scanning enabled but ClamAV service unavailable',
        status: this.getStatus()
      };
    } catch (error) {
      logger.error('Failed to enable virus scanning', { error: error.message });
      return {
        success: false,
        message: `Failed to enable virus scanning: ${error.message}`,
        status: this.getStatus()
      };
    }
  }

  /**
   * Disable virus scanning
   */
  disable() {
    this.enabled = false;
    this.available = false;
    
    // Stop background retry process
    if (this.backgroundRetryInterval) {
      clearInterval(this.backgroundRetryInterval);
      this.backgroundRetryInterval = null;
      logger.info('Stopped background ClamAV retry process');
    }
    
    logger.info('Virus scanning disabled');

    return {
      success: true,
      message: 'Virus scanning disabled successfully',
      status: this.getStatus()
    };
  }

  /**
   * Scan a single file
   * @param {string} filePath - Path to file to scan
   * @param {Object} options - Scan options
   * @returns {Object} Scan result
   */
  async scanFile(filePath, options = {}) {
    const startTime = Date.now();
    
    // Check if scanning is disabled
    if (!this.enabled || this.scanMode === 'disabled') {
      return {
        status: 'disabled',
        clean: true,
        threat: null,
        scanTime: 0,
        engine: 'disabled',
        message: 'Virus scanning is disabled'
      };
    }

    // Check file size limit
    const fileSize = options.fileSize;
    if (fileSize && fileSize > this.maxFileSize) {
      const maxSizeMB = Math.round(this.maxFileSize / 1024 / 1024);
      const fileSizeMB = Math.round(fileSize / 1024 / 1024);
      return {
        status: 'unscanned',
        clean: true,
        threat: null,
        scanTime: Date.now() - startTime,
        engine: 'skipped',
        message: `File too large for virus scanning (${fileSizeMB}MB > ${maxSizeMB}MB limit)`
      };
    }

    // Check if scanner is available
    if (!this.available || !this.clamClient) {
      const message = this.required 
        ? 'Virus scanner is required but unavailable'
        : 'Virus scanner is unavailable, file uploaded without scanning';
        
      if (this.required) {
        throw new Error(message);
      }

      return {
        status: 'unavailable',
        clean: !this.required, // Clean if not required, blocked if required
        threat: null,
        scanTime: Date.now() - startTime,
        engine: 'unavailable',
        message
      };
    }

    try {
      logger.info('Starting virus scan', {
        filePath,
        enabled: this.enabled,
        available: this.available,
        hasClient: !!this.clamClient
      });

      // Perform the actual scan
      // Note: clamscan library expects (filePath, callback) or just (filePath) for promises
      const result = await this.clamClient.isInfected(filePath);

      const scanTime = Date.now() - startTime;
      const version = await this.getVersion();

      logger.info('Virus scan completed', {
        filePath,
        scanTime,
        isInfected: result.is_infected,
        viruses: result.viruses,
        file: result.file,
        fullResult: result
      });

      // Check for threats - some versions of clamscan might not set is_infected correctly
      const hasThreats = result.viruses && result.viruses.length > 0;
      const isInfected = result.is_infected || hasThreats;

      const scanResult = {
        status: isInfected ? 'infected' : 'clean',
        clean: !isInfected,
        threat: hasThreats ? result.viruses[0] : null,
        scanTime,
        engine: version || 'clamav',
        message: isInfected 
          ? `Threat detected: ${result.viruses.join(', ')}`
          : 'File is clean'
      };

      // Log scan result
      if (isInfected) {
        logger.warn('Infected file detected', {
          filePath,
          threats: result.viruses,
          scanTime,
          engine: version,
          originalIsInfected: result.is_infected,
          hasThreats
        });
      } else {
        logger.debug('File scan completed', {
          filePath,
          status: 'clean',
          scanTime,
          engine: version
        });
      }

      // Note: Scan history logging is handled by the calling code (file upload routes)
      // to avoid duplicate entries and ensure proper context (file_id, uploader_id, etc.)

      // Handle infected files for automated flagging (only if file_id is provided)
      if (isInfected && options.fileId) {
        try {
          const db = require('../models/database');
          
          // Check if file has any active shares
          const shares = await db.query(`
            SELECT id, shared_by FROM shares 
            WHERE file_id = $1 AND suspended = FALSE
          `, [options.fileId]);

          if (shares.rows.length > 0) {
            // Auto-suspend all shares of infected file
            await db.query(`
              UPDATE shares 
              SET suspended = TRUE, 
                  suspended_at = CURRENT_TIMESTAMP,
                  suspended_by = NULL,
                  suspension_reason = 'Automatically suspended due to virus detection'
              WHERE file_id = $1 AND suspended = FALSE
            `, [options.fileId]);

            // Create automated report for each share
            for (const share of shares.rows) {
              await db.query(`
                INSERT INTO share_reports (share_id, reporter_id, reporter_ip, report_type, description, status, priority)
                VALUES ($1, NULL, '127.0.0.1', 'malware', $2, 'resolved', 'high')
              `, [share.id, `Virus detected: ${scanResult.threat}. File automatically suspended.`]);
            }

            // Log automated action
            await db.query(`
              INSERT INTO admin_actions (admin_id, action_type, target_user_id, action_details, timestamp)
              VALUES (NULL, 'automated_virus_suspend', $1, $2, CURRENT_TIMESTAMP)
            `, [shares.rows[0].shared_by, JSON.stringify({
              file_id: options.fileId,
              threat: scanResult.threat,
              shares_suspended: shares.rows.length,
              reason: 'virus_detection'
            })]);

            logger.warn('Infected file shares automatically suspended', {
              fileId: options.fileId,
              threat: scanResult.threat,
              sharesSuspended: shares.rows.length
            });
          }
        } catch (flaggingError) {
          logger.error('Error integrating with automated flagging:', flaggingError);
        }
      }

      return scanResult;
    } catch (error) {
      const scanTime = Date.now() - startTime;
      
      logger.error('File scan failed', {
        filePath,
        error: error.message,
        errorStack: error.stack,
        scanTime,
        enabled: this.enabled,
        available: this.available,
        hasClient: !!this.clamClient
      });

      // If scanning is required, propagate the error
      if (this.required) {
        throw new Error(`Virus scan failed: ${error.message}`);
      }

      // If scanning is optional, return error status but allow file
      return {
        status: 'error',
        clean: true, // Allow file through on scan error when not required
        threat: null,
        scanTime,
        engine: 'error',
        message: `Scan error: ${error.message}`
      };
    }
  }

  /**
   * Scan multiple files
   * @param {Array} filePaths - Array of file paths to scan
   * @param {Object} options - Scan options
   * @returns {Array} Array of scan results
   */
  async scanFiles(filePaths, options = {}) {
    if (!Array.isArray(filePaths)) {
      throw new Error('filePaths must be an array');
    }

    const results = [];
    
    if (this.scanMode === 'sync') {
      // Sequential scanning
      for (const filePath of filePaths) {
        const result = await this.scanFile(filePath, options);
        results.push({ filePath, ...result });
      }
    } else {
      // Parallel scanning (default for async mode)
      const scanPromises = filePaths.map(async (filePath) => {
        try {
          const result = await this.scanFile(filePath, options);
          return { filePath, ...result };
        } catch (error) {
          return {
            filePath,
            status: 'error',
            clean: !this.required,
            threat: null,
            scanTime: 0,
            engine: 'error',
            message: error.message
          };
        }
      });

      const scanResults = await Promise.allSettled(scanPromises);
      
      for (const promiseResult of scanResults) {
        if (promiseResult.status === 'fulfilled') {
          results.push(promiseResult.value);
        } else {
          results.push({
            filePath: 'unknown',
            status: 'error',
            clean: !this.required,
            threat: null,
            scanTime: 0,
            engine: 'error',
            message: promiseResult.reason.message
          });
        }
      }
    }

    return results;
  }


  /**
   * Test scanner functionality
   */
  async test() {
    if (!this.enabled) {
      return {
        success: false,
        message: 'Virus scanning is disabled',
        status: this.getStatus()
      };
    }

    try {
      const version = await this.getVersion();
      const healthCheck = await this.healthCheck();
      
      return {
        success: healthCheck,
        message: healthCheck ? 'Scanner is working correctly' : 'Scanner health check failed',
        version,
        status: this.getStatus()
      };
    } catch (error) {
      return {
        success: false,
        message: `Scanner test failed: ${error.message}`,
        status: this.getStatus()
      };
    }
  }

  /**
   * Get scanning statistics
   */
  getStatistics() {
    // This would be enhanced with actual statistics tracking
    return {
      enabled: this.enabled,
      available: this.available,
      uptime: this.lastHealthCheck ? Date.now() - this.lastHealthCheck.getTime() : 0,
      // Additional statistics would be added here
      // totalScans, cleanFiles, infectedFiles, etc.
    };
  }
}

// Create singleton instance
let scannerInstance = null;

function getVirusScanner() {
  if (!scannerInstance) {
    scannerInstance = new OptionalVirusScanner();
  }
  return scannerInstance;
}

module.exports = {
  OptionalVirusScanner,
  getVirusScanner
};