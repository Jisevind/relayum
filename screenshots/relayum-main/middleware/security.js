const rateLimit = require('express-rate-limit');
const winston = require('winston');

// Custom key generator that properly handles trust proxy
const createKeyGenerator = () => {
  return (req) => {
    // Use CF-Connecting-IP header if available (Cloudflare)
    const cfConnectingIp = req.get('CF-Connecting-IP');
    if (cfConnectingIp) {
      return cfConnectingIp;
    }
    
    // Use X-Forwarded-For header if available
    const xForwardedFor = req.get('X-Forwarded-For');
    if (xForwardedFor) {
      // Get the first IP from X-Forwarded-For header
      return xForwardedFor.split(',')[0].trim();
    }
    
    // Fall back to req.ip
    return req.ip;
  };
};

// Configure logging
const logDirectory = process.env.LOG_DIRECTORY || 'logs';
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'relayum' },
  transports: [
    new winston.transports.File({ filename: `${logDirectory}/error.log`, level: 'error' }),
    new winston.transports.File({ filename: `${logDirectory}/combined.log` })
  ],
});

// Add console logging in development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

// Enhanced rate limiters
const authLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes default
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX) || 5, // Strict limit for auth attempts
  message: {
    error: 'Too many authentication attempts, please try again later.',
    retryAfter: parseInt(process.env.RATE_LIMIT_RETRY_AFTER) || 15 * 60 // seconds
  },
  standardHeaders: true,
  skipSuccessfulRequests: true,
  keyGenerator: createKeyGenerator(),
  handler: (req, res, next, options) => {
    logger.warn('Auth rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.originalUrl
    });
    res.status(options.statusCode).json(options.message);
  }
});

const uploadLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes default
  max: process.env.NODE_ENV === 'production' 
    ? parseInt(process.env.UPLOAD_RATE_LIMIT_MAX_PROD) || 50
    : parseInt(process.env.UPLOAD_RATE_LIMIT_MAX_DEV) || 1000,
  message: {
    error: 'Too many uploads, please try again later.',
    retryAfter: parseInt(process.env.RATE_LIMIT_RETRY_AFTER) || 15 * 60
  },
  standardHeaders: true,
  keyGenerator: createKeyGenerator(),
  handler: (req, res, next, options) => {
    logger.warn('Upload rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: req.user?.id
    });
    res.status(options.statusCode).json(options.message);
  }
});

const publicShareLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes default
  max: parseInt(process.env.PUBLIC_SHARE_RATE_LIMIT_MAX) || 100, // public share accesses per window
  message: {
    error: 'Too many share access attempts, please try again later.',
    retryAfter: parseInt(process.env.RATE_LIMIT_RETRY_AFTER) || 15 * 60
  },
  standardHeaders: true,
  keyGenerator: createKeyGenerator(),
  handler: (req, res, next, options) => {
    logger.warn('Public share rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      shareToken: req.params.token
    });
    res.status(options.statusCode).json(options.message);
  }
});

const generalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes default
  max: process.env.NODE_ENV === 'production' 
    ? parseInt(process.env.GENERAL_RATE_LIMIT_MAX_PROD) || 1000
    : parseInt(process.env.GENERAL_RATE_LIMIT_MAX_DEV) || 10000,
  message: {
    error: 'Too many requests, please try again later.',
    retryAfter: parseInt(process.env.RATE_LIMIT_RETRY_AFTER) || 15 * 60
  },
  standardHeaders: true,
  keyGenerator: createKeyGenerator(),
  // Skip rate limiting for static assets and virus scanning polling
  skip: (req) => {
    // Always skip static assets and favicon
    if (req.url.includes('/static/') || req.url.includes('/favicon.ico')) {
      return true;
    }
    
    // Skip virus scanning endpoints to prevent polling rate limit issues
    if (req.url.includes('/api/admin/virus-scanning')) {
      return true;
    }
    
    return false;
  },
  handler: (req, res, next, options) => {
    logger.warn('General rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.originalUrl
    });
    res.status(options.statusCode).json(options.message);
  }
});

// Request logging middleware
const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: req.user?.id,
      contentLength: res.get('Content-Length')
    };

    if (res.statusCode >= 400) {
      logger.error('HTTP Error', logData);
    } else if (res.statusCode === 304) {
      // 304 Not Modified is normal/efficient, log as info
      logger.info('HTTP Request', logData);
    } else if (res.statusCode >= 300) {
      // Only log actual redirects (301, 302, 307, 308) as warnings
      logger.warn('HTTP Redirect', logData);
    } else {
      logger.info('HTTP Request', logData);
    }
  });

  next();
};

// Security headers middleware
const securityHeaders = (req, res, next) => {
  // Remove server header
  res.removeHeader('X-Powered-By');
  
  // Add security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  next();
};

// Input validation middleware
const validateInput = (req, res, next) => {
  // Skip validation for multipart/form-data (file uploads)
  const contentType = req.get('Content-Type') || '';
  if (contentType.includes('multipart/form-data')) {
    return next();
  }
  
  // Check for common injection patterns
  const suspiciousPatterns = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /\b(union|select|insert|update|delete|drop|create|alter)\b/gi
  ];

  const checkValue = (value) => {
    if (typeof value === 'string') {
      for (const pattern of suspiciousPatterns) {
        if (pattern.test(value)) {
          return true;
        }
      }
    }
    return false;
  };

  const checkObject = (obj) => {
    for (const key in obj) {
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        if (checkObject(obj[key])) return true;
      } else if (checkValue(obj[key]) || checkValue(key)) {
        return true;
      }
    }
    return false;
  };

  if (checkObject(req.body) || checkObject(req.query) || checkObject(req.params)) {
    logger.warn('Suspicious input detected', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      body: req.body,
      query: req.query,
      params: req.params
    });
    
    return res.status(400).json({
      error: 'Invalid input detected'
    });
  }

  next();
};

module.exports = {
  logger,
  authLimiter,
  uploadLimiter,
  publicShareLimiter,
  generalLimiter,
  requestLogger,
  securityHeaders,
  validateInput
};