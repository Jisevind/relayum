/**
 * Utility functions for file size parsing and formatting
 */

/**
 * Parse human-readable file size string to bytes
 * Supports: B, KB, MB, GB, TB (case-insensitive)
 * Examples: "50MB", "2GB", "1.5GB", "512kb"
 * 
 * @param {string|number} input - File size string or number in bytes
 * @returns {number} Size in bytes
 */
function parseFileSize(input) {
  // If it's already a number, return it
  if (typeof input === 'number') {
    return input;
  }
  
  // If it's a string that's just a number, return it as number
  if (typeof input === 'string' && /^\d+$/.test(input.trim())) {
    return parseInt(input, 10);
  }
  
  if (typeof input !== 'string') {
    throw new Error('Invalid file size format');
  }
  
  // Remove spaces and convert to uppercase
  const cleanInput = input.trim().toUpperCase();
  
  // Parse the numeric part and unit
  const match = cleanInput.match(/^(\d+(?:\.\d+)?)\s*([KMGT]?B?)$/);
  
  if (!match) {
    throw new Error(`Invalid file size format: ${input}`);
  }
  
  const value = parseFloat(match[1]);
  const unit = match[2] || 'B';
  
  // Define multipliers (using 1024 for binary units)
  const multipliers = {
    'B': 1,
    'KB': 1024,
    'MB': 1024 * 1024,
    'GB': 1024 * 1024 * 1024,
    'TB': 1024 * 1024 * 1024 * 1024,
    // Also support units without 'B'
    'K': 1024,
    'M': 1024 * 1024,
    'G': 1024 * 1024 * 1024,
    'T': 1024 * 1024 * 1024 * 1024,
  };
  
  const multiplier = multipliers[unit];
  if (multiplier === undefined) {
    throw new Error(`Unknown file size unit: ${unit}`);
  }
  
  return Math.floor(value * multiplier);
}

/**
 * Format bytes to human-readable string
 * 
 * @param {number} bytes - Size in bytes
 * @param {number} decimals - Number of decimal places (default: 1)
 * @returns {string} Formatted file size
 */
function formatFileSize(bytes, decimals = 1) {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

module.exports = {
  parseFileSize,
  formatFileSize
};