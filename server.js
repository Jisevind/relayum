const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const https = require('https');
require('dotenv').config();

// Import security middleware
const {
  logger,
  authLimiter,
  uploadLimiter,
  publicShareLimiter,
  generalLimiter,
  requestLogger,
  securityHeaders,
  validateInput
} = require('./middleware/security');

const authRoutes = require('./routes/auth');
const fileRoutes = require('./routes/files');
const folderRoutes = require('./routes/folders');
const shareRoutes = require('./routes/shares');
const downloadRoutes = require('./routes/download');
const userRoutes = require('./routes/users');
const anonymousRoutes = require('./routes/anonymous');
const adminRoutes = require('./routes/admin');
const virusScanningRoutes = require('./routes/virusScanning');

const app = express();
const PORT = process.env.PORT;

// Configure trust proxy for proper IP detection behind reverse proxies/Docker/Cloudflare
// Use more specific trust proxy configuration instead of 'true' to avoid security warnings
// This trusts the first proxy (Docker/nginx/Cloudflare) but not unlimited proxies
app.set('trust proxy', 1);

// Add middleware to properly extract client IP from Cloudflare headers
app.use((req, res, next) => {
  // Use CF-Connecting-IP header if available (Cloudflare)
  const cfConnectingIp = req.get('CF-Connecting-IP');
  if (cfConnectingIp) {
    req.ip = cfConnectingIp;
  }
  next();
});

// Ensure logs directory exists
const logDirectory = process.env.LOG_DIRECTORY || 'logs';
fs.mkdirSync(logDirectory, { recursive: true });

// Enhanced Helmet configuration with conditional security headers
if (process.env.DISABLE_SECURITY_HEADERS !== 'true') {
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // unsafe-eval needed for React dev
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        mediaSrc: ["'self'"],
        objectSrc: ["'none'"],
        childSrc: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: [],
      },
    },
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true
    },
    noSniff: true,
    frameguard: { action: 'deny' },
    xssFilter: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
  }));
}


// CORS configuration
const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS 
  ? process.env.CORS_ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : [
      'http://localhost:3000',
      'http://localhost:3001',
      'https://localhost:3001',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001',
      'https://127.0.0.1:3001'
    ];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      // In development, be more permissive
      if (process.env.NODE_ENV === 'development') {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    }
  },
  credentials: true, // Allow cookies
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Cookie parser for httpOnly cookies
app.use(cookieParser());

// Security headers
app.use(securityHeaders);

// Request logging
app.use(requestLogger);

// Body parsing with size limits
app.use(express.json({ 
  limit: '10mb',
  strict: true,
  type: ['application/json']
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: '10mb',
  parameterLimit: 100,
  type: 'application/x-www-form-urlencoded'
}));

// Input validation
app.use(validateInput);

// General rate limiting
app.use(generalLimiter);

// Apply specific rate limiting to auth routes
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// Route configuration with appropriate rate limiting
app.use('/api/auth', authRoutes);
app.use('/api/files', uploadLimiter, fileRoutes);
app.use('/api/folders', folderRoutes);
app.use('/api/shares', shareRoutes);
app.use('/api/download', downloadRoutes);
app.use('/api/users', userRoutes);
app.use('/api/anonymous', publicShareLimiter, anonymousRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/virus-scanning', virusScanningRoutes);


// Apply rate limiting to public share routes
app.use('/api/shares/public*', publicShareLimiter);
app.use('/api/download/public*', publicShareLimiter);


// Serve the React application in production, redirect to dev server in development
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'client/build')));
  
  // Catch-all route to serve the React app (only for non-API routes)
  app.get('*', (req, res) => {
    // Don't serve HTML for API routes - they should have been handled above
    if (req.originalUrl.startsWith('/api/')) {
      return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
  });
} else {
  // In development, redirect frontend routes to the React dev server
  app.get('*', (req, res) => {
    // Don't redirect API routes - they should have been handled above
    if (req.originalUrl.startsWith('/api/')) {
      return res.status(404).json({ error: 'API endpoint not found' });
    }
    // Redirect to React dev server on port 3001
    const redirectUrl = `http://${req.get('host').replace(':3020', ':3021')}${req.originalUrl}`;
    res.redirect(redirectUrl);
  });
}

if (process.env.NODE_ENV === 'production') {
  // Production-specific configurations can go here
}


// Enhanced error handling
app.use((err, req, res, next) => {
  // Log the error
  logger.error('Server error', {
    error: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id
  });

  // Don't leak error details in production
  if (process.env.NODE_ENV === 'production') {
    res.status(500).json({ 
      error: 'Internal server error',
      requestId: req.id // Could add request ID for tracking
    });
  } else {
    res.status(500).json({ 
      error: 'Something went wrong!',
      details: err.message
    });
  }
});



// Start server and initialize virus scanner
const startServer = async () => {
  return new Promise((resolve, reject) => {
    // Check if we should use HTTPS
    const useHttps = process.env.NODE_ENV === 'development' && process.env.HTTPS === 'true';
    
    let server;
    
    if (useHttps) {
      // Load SSL certificates
      const sslDir = path.join(__dirname, 'ssl');
      const keyPath = path.join(sslDir, 'server.key');
      const certPath = path.join(sslDir, 'server.crt');
      
      // Generate certificates if they don't exist
      if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
        console.log('SSL certificates not found, generating...');
        try {
          require('./scripts/generate-ssl-cert');
        } catch (error) {
          console.error('Failed to generate SSL certificates:', error.message);
          // Fall back to HTTP
          server = app.listen(PORT, () => {
            logger.info(`Server started on port ${PORT} (HTTP fallback)`, {
              environment: process.env.NODE_ENV,
              port: PORT,
              protocol: 'http'
            });
            console.log(`Server running on port ${PORT} (HTTP)`);
            resolve(server);
          });
          server.on('error', reject);
          return;
        }
      }
      
      try {
        const key = fs.readFileSync(keyPath);
        const cert = fs.readFileSync(certPath);
        
        server = https.createServer({ key, cert }, app);
        server.listen(PORT, () => {
          logger.info(`Server started on port ${PORT} (HTTPS)`, {
            environment: process.env.NODE_ENV,
            port: PORT,
            protocol: 'https'
          });
          console.log(`Server running on port ${PORT} (HTTPS)`);
          resolve(server);
        });
      } catch (error) {
        console.error('Failed to start HTTPS server:', error.message);
        // Fall back to HTTP
        server = app.listen(PORT, () => {
          logger.info(`Server started on port ${PORT} (HTTP fallback)`, {
            environment: process.env.NODE_ENV,
            port: PORT,
            protocol: 'http'
          });
          console.log(`Server running on port ${PORT} (HTTP)`);
          resolve(server);
        });
      }
    } else {
      // Use HTTP
      server = app.listen(PORT, () => {
        logger.info(`Server started on port ${PORT}`, {
          environment: process.env.NODE_ENV,
          port: PORT,
          protocol: 'http'
        });
        console.log(`Server running on port ${PORT}`);
        resolve(server);
      });
    }
    
    server.on('error', reject);
  });
};

// Initialize application
const initializeApp = async () => {
  try {
    // Initialize database first
    await initializeDatabase();
    
    // Start the server after database is ready
    await startServer();
    
    // Initialize virus scanner after server starts and DB is ready
    const { getVirusScanner } = require('./services/virusScanner');
    const virusScanner = getVirusScanner();
    await virusScanner.initialize();
    
    logger.info('Application fully initialized', {
      virusScanning: virusScanner.enabled ? 'enabled' : 'disabled'
    });
  } catch (error) {
    logger.error('Failed to initialize application', {
      error: error.message,
      stack: error.stack
    });
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Database connection retry function
const waitForDatabase = async (maxRetries = 30, delay = 1000) => {
  const db = require('./models/database');
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      await db.query('SELECT 1');
      logger.info('Database connection established');
      return;
    } catch (error) {
      logger.info(`Waiting for database connection (attempt ${i + 1}/${maxRetries})...`);
      if (i === maxRetries - 1) {
        throw new Error(`Failed to connect to database after ${maxRetries} attempts: ${error.message}`);
      }
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

// Database initialization function
const initializeDatabase = async () => {
  try {
    logger.info('Waiting for database to be ready...');
    
    // Wait for database connection first
    await waitForDatabase();
    
    const db = require('./models/database');
    
    logger.info('Checking database initialization status...');
    
    // Check if database is already initialized by checking for all required tables and key columns
    const checkTablesAndColumns = await db.query(`
      SELECT 
        (SELECT COUNT(*) FROM information_schema.tables 
         WHERE table_schema = 'public' 
         AND table_name IN ('users', 'files', 'folders', 'shares', 'admin_overrides', 'scan_history', 'login_attempts', 'refresh_tokens', 'anonymous_shares', 'anonymous_files', 'admin_actions')) as table_count,
        (SELECT COUNT(*) FROM information_schema.columns 
         WHERE table_schema = 'public' 
         AND table_name = 'files' 
         AND column_name IN ('encrypted', 'file_id')) as encryption_columns
    `);
    
    const tableCount = parseInt(checkTablesAndColumns.rows[0].table_count);
    const encryptionColumns = parseInt(checkTablesAndColumns.rows[0].encryption_columns);
    logger.info(`Found ${tableCount} required tables out of 11, ${encryptionColumns} encryption columns out of 2`);
    
    if (tableCount === 11 && encryptionColumns === 2) {
      logger.info('Database already initialized');
      return;
    }
    
    logger.info('Database not initialized, creating tables...');
    
    // Run the database initialization
    const initDb = require('./scripts/init-db');
    await initDb();
    
    logger.info('Database initialized successfully');
  } catch (error) {
    logger.error('Database initialization failed', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
};

// Start the application
initializeApp();