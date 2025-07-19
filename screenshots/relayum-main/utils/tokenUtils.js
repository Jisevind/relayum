const crypto = require('crypto');

/**
 * Generate a secure random token for anonymous sharing
 * @param {number} length - Length of the token (default: 32)
 * @returns {string} - Random token string
 */
function generateShareToken(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Generate a URL-safe share token
 * @param {number} length - Length of the token (default: 24)
 * @returns {string} - URL-safe token string
 */
function generateUrlSafeToken(length = 24) {
  return crypto.randomBytes(length).toString('base64url');
}

/**
 * Validate if a token matches the expected format
 * @param {string} token - Token to validate
 * @returns {boolean} - True if token is valid format
 */
function validateTokenFormat(token) {
  if (!token || typeof token !== 'string') {
    return false;
  }
  
  // Check if token is hexadecimal (for hex tokens)
  if (/^[a-f0-9]+$/i.test(token) && token.length >= 32) {
    return true;
  }
  
  // Check if token is base64url (for URL-safe tokens)
  if (/^[A-Za-z0-9_-]+$/.test(token) && token.length >= 16) {
    return true;
  }
  
  return false;
}

/**
 * Calculate expiration date based on days from now
 * @param {number} days - Number of days from now
 * @returns {Date} - Expiration date
 */
function calculateExpirationDate(days) {
  const expiration = new Date();
  expiration.setDate(expiration.getDate() + days);
  return expiration;
}

/**
 * Check if a share has expired
 * @param {Date|string} expiresAt - Expiration timestamp
 * @returns {boolean} - True if expired
 */
function isExpired(expiresAt) {
  if (!expiresAt) return false;
  const expireDate = new Date(expiresAt);
  return expireDate < new Date();
}

/**
 * Generate share metadata
 * @param {Object} options - Share options
 * @param {number} options.fileId - File ID (optional)
 * @param {number} options.folderId - Folder ID (optional)
 * @param {number} options.createdBy - User ID who created the share
 * @param {number} options.expirationDays - Days until expiration
 * @param {number} options.maxAccess - Maximum access count (optional)
 * @returns {Object} - Share metadata
 */
function generateShareMetadata(options) {
  const {
    fileId,
    folderId,
    createdBy,
    expirationDays = parseInt(process.env.ANONYMOUS_SHARE_EXPIRATION_DAYS) || 7,
    maxAccess = parseInt(process.env.ANONYMOUS_SHARE_MAX_ACCESS) || null
  } = options;

  return {
    share_token: generateUrlSafeToken(),
    file_id: fileId || null,
    folder_id: folderId || null,
    created_by: createdBy,
    expires_at: calculateExpirationDate(expirationDays),
    max_access_count: maxAccess,
    access_count: 0
  };
}

module.exports = {
  generateShareToken,
  generateUrlSafeToken,
  validateTokenFormat,
  calculateExpirationDate,
  isExpired,
  generateShareMetadata
};