const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

/**
 * Encryption Service for Relayum
 * Provides secure file encryption with per-user keys and AES-256-GCM
 */
class EncryptionService {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.keyLength = 32; // 256 bits
    this.ivLength = 16;  // 128 bits
    this.tagLength = 16; // 128 bits
    this.saltLength = 32; // 256 bits
    this.iterations = 100000; // PBKDF2 iterations
  }

  /**
   * Derive a master key from user password
   * @param {string} password - User password
   * @param {Buffer} salt - Salt for key derivation (optional, generates new if not provided)
   * @returns {Object} - {key: Buffer, salt: Buffer}
   */
  deriveMasterKey(password, salt = null) {
    if (!salt) {
      salt = crypto.randomBytes(this.saltLength);
    }
    
    const key = crypto.pbkdf2Sync(password, salt, this.iterations, this.keyLength, 'sha256');
    
    return { key, salt };
  }

  /**
   * Derive a file-specific key from master key and file identifier
   * @param {Buffer} masterKey - User's master key
   * @param {string} fileId - Unique file identifier
   * @returns {Buffer} - File-specific encryption key
   */
  deriveFileKey(masterKey, fileId) {
    const info = Buffer.from(`file:${fileId}`, 'utf8');
    const key = crypto.hkdfSync('sha256', masterKey, Buffer.alloc(0), info, this.keyLength);
    return key;
  }

  /**
   * Encrypt a file with AES-256-GCM
   * @param {Buffer} fileKey - File-specific encryption key
   * @param {Buffer|Stream} data - File data to encrypt
   * @returns {Object} - {encryptedData: Buffer, iv: Buffer, tag: Buffer}
   */
  encryptData(fileKey, data) {
    const iv = crypto.randomBytes(this.ivLength);
    const cipher = crypto.createCipheriv(this.algorithm, fileKey, iv);
    
    let encrypted = Buffer.alloc(0);
    
    if (Buffer.isBuffer(data)) {
      encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    } else {
      throw new Error('Streaming encryption not yet implemented');
    }
    
    const tag = cipher.getAuthTag();
    
    return {
      encryptedData: encrypted,
      iv,
      tag
    };
  }

  /**
   * Decrypt file data with AES-256-GCM
   * @param {Buffer} fileKey - File-specific encryption key
   * @param {Buffer} encryptedData - Encrypted file data
   * @param {Buffer} iv - Initialization vector
   * @param {Buffer} tag - Authentication tag
   * @returns {Buffer} - Decrypted data
   */
  decryptData(fileKey, encryptedData, iv, tag) {
    const decipher = crypto.createDecipheriv(this.algorithm, fileKey, iv);
    decipher.setAuthTag(tag);
    
    let decrypted = Buffer.concat([
      decipher.update(encryptedData),
      decipher.final()
    ]);
    
    return decrypted;
  }

  /**
   * Encrypt a file and save to disk
   * @param {string} sourcePath - Path to source file
   * @param {string} destinationPath - Path to save encrypted file
   * @param {Buffer} fileKey - File encryption key
   * @returns {Object} - Encryption metadata {iv, tag, hash}
   */
  async encryptFile(sourcePath, destinationPath, fileKey) {
    try {
      // Read source file
      const data = await fs.readFile(sourcePath);
      
      // Calculate file hash for integrity
      const hash = crypto.createHash('sha256').update(data).digest('hex');
      
      // Encrypt data
      const { encryptedData, iv, tag } = this.encryptData(fileKey, data);
      
      // Create encrypted file structure
      const encryptedFile = Buffer.concat([
        Buffer.from('RELAYUM1'), // File format identifier
        iv,
        tag,
        Buffer.from(hash, 'hex'),
        encryptedData
      ]);
      
      // Ensure destination directory exists
      await fs.mkdir(path.dirname(destinationPath), { recursive: true });
      
      // Write encrypted file
      await fs.writeFile(destinationPath, encryptedFile);
      
      return {
        iv: iv.toString('hex'),
        tag: tag.toString('hex'),
        hash,
        size: encryptedFile.length
      };
    } catch (error) {
      throw new Error(`File encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt a file from disk
   * @param {string} encryptedPath - Path to encrypted file
   * @param {Buffer} fileKey - File decryption key
   * @returns {Buffer} - Decrypted file data
   */
  async decryptFile(encryptedPath, fileKey) {
    try {
      // Read encrypted file
      const encryptedFile = await fs.readFile(encryptedPath);
      
      // Verify file format
      const formatId = encryptedFile.slice(0, 8).toString();
      if (formatId !== 'RELAYUM1') {
        throw new Error('Invalid encrypted file format');
      }
      
      // Extract components
      let offset = 8;
      const iv = encryptedFile.slice(offset, offset + this.ivLength);
      offset += this.ivLength;
      
      const tag = encryptedFile.slice(offset, offset + this.tagLength);
      offset += this.tagLength;
      
      const originalHash = encryptedFile.slice(offset, offset + 32).toString('hex');
      offset += 32;
      
      const encryptedData = encryptedFile.slice(offset);
      
      // Decrypt data
      const decryptedData = this.decryptData(fileKey, encryptedData, iv, tag);
      
      // Verify integrity
      const calculatedHash = crypto.createHash('sha256').update(decryptedData).digest('hex');
      if (calculatedHash !== originalHash) {
        throw new Error('File integrity verification failed');
      }
      
      return decryptedData;
    } catch (error) {
      throw new Error(`File decryption failed: ${error.message}`);
    }
  }

  /**
   * Generate a secure file identifier
   * @param {string} originalName - Original filename
   * @param {number} userId - User ID
   * @param {Date} timestamp - Upload timestamp
   * @returns {string} - Secure file identifier
   */
  generateFileId(originalName, userId, timestamp = new Date()) {
    const data = `${originalName}:${userId}:${timestamp.getTime()}:${crypto.randomBytes(16).toString('hex')}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Get metadata encryption key from environment
   * @returns {Buffer} - Metadata encryption key
   */
  getMetadataEncryptionKey() {
    const keyHex = process.env.METADATA_ENCRYPTION_KEY;
    if (!keyHex) {
      throw new Error('METADATA_ENCRYPTION_KEY environment variable is required');
    }
    
    if (keyHex.length !== 64) {
      throw new Error('METADATA_ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
    }
    
    const key = Buffer.from(keyHex, 'hex');
    if (!this.validateKey(key)) {
      throw new Error('Invalid metadata encryption key');
    }
    
    return key;
  }

  /**
   * Encrypt metadata (filename, mime type, etc.)
   * @param {Object} metadata - Metadata object
   * @param {Buffer} key - Encryption key (optional, uses env var if not provided)
   * @returns {string} - Encrypted metadata as hex string
   */
  encryptMetadata(metadata, key = null) {
    if (!key) {
      key = this.getMetadataEncryptionKey();
    }
    
    const data = Buffer.from(JSON.stringify(metadata), 'utf8');
    const { encryptedData, iv, tag } = this.encryptData(key, data);
    
    const result = Buffer.concat([iv, tag, encryptedData]);
    return result.toString('hex');
  }

  /**
   * Decrypt metadata
   * @param {string} encryptedMetadata - Encrypted metadata as hex string
   * @param {Buffer} key - Decryption key (optional, uses env var if not provided)
   * @returns {Object} - Decrypted metadata object
   */
  decryptMetadata(encryptedMetadata, key = null) {
    if (!key) {
      key = this.getMetadataEncryptionKey();
    }
    
    const data = Buffer.from(encryptedMetadata, 'hex');
    
    let offset = 0;
    const iv = data.slice(offset, offset + this.ivLength);
    offset += this.ivLength;
    
    const tag = data.slice(offset, offset + this.tagLength);
    offset += this.tagLength;
    
    const encryptedData = data.slice(offset);
    
    const decryptedData = this.decryptData(key, encryptedData, iv, tag);
    return JSON.parse(decryptedData.toString('utf8'));
  }

  /**
   * Securely delete a file by overwriting with random data
   * @param {string} filePath - Path to file to delete
   * @param {number} passes - Number of overwrite passes (default: optimized based on file size)
   */
  async secureDelete(filePath, passes = null) {
    try {
      const stats = await fs.stat(filePath);
      const fileSize = stats.size;
      
      // For encrypted files, simple deletion is usually sufficient since data was encrypted
      // Use environment variable to control secure deletion behavior
      const secureDeleteEnabled = process.env.ENABLE_SECURE_DELETE !== 'false';
      const maxSecureDeleteSize = parseInt(process.env.MAX_SECURE_DELETE_SIZE) || 100 * 1024 * 1024; // 100MB default
      
      // Auto-optimize passes based on file size and configuration
      if (passes === null) {
        if (!secureDeleteEnabled || fileSize > maxSecureDeleteSize) {
          // For large files or when disabled, just delete (files are encrypted anyway)
          passes = 0;
        } else if (fileSize > 10 * 1024 * 1024) { // > 10MB
          passes = 1; // Single pass for medium files
        } else {
          passes = 2; // Two passes for small files
        }
      }
      
      // Perform secure overwriting if requested
      if (passes > 0) {
        // For large files, use streaming to avoid memory issues
        if (fileSize > 50 * 1024 * 1024) { // > 50MB, use streaming
          await this.secureDeleteStream(filePath, passes);
        } else {
          // Small files, use simple overwrite
          for (let i = 0; i < passes; i++) {
            const randomData = crypto.randomBytes(fileSize);
            await fs.writeFile(filePath, randomData);
          }
        }
      }
      
      // Delete the file
      await fs.unlink(filePath);
    } catch (error) {
      // File might not exist, which is fine for deletion
      if (error.code !== 'ENOENT') {
        throw new Error(`Secure deletion failed: ${error.message}`);
      }
    }
  }

  /**
   * Securely delete large files using streaming to avoid memory issues
   * @param {string} filePath - Path to file to delete
   * @param {number} passes - Number of overwrite passes
   */
  async secureDeleteStream(filePath, passes) {
    try {
      const stats = await fs.stat(filePath);
      const fileSize = stats.size;
      const chunkSize = 1024 * 1024; // 1MB chunks
      
      for (let pass = 0; pass < passes; pass++) {
        const writeStream = require('fs').createWriteStream(filePath, { flags: 'r+' });
        
        let bytesWritten = 0;
        while (bytesWritten < fileSize) {
          const remainingBytes = fileSize - bytesWritten;
          const currentChunkSize = Math.min(chunkSize, remainingBytes);
          const randomChunk = crypto.randomBytes(currentChunkSize);
          
          await new Promise((resolve, reject) => {
            writeStream.write(randomChunk, (error) => {
              if (error) reject(error);
              else resolve();
            });
          });
          
          bytesWritten += currentChunkSize;
        }
        
        await new Promise((resolve, reject) => {
          writeStream.end((error) => {
            if (error) reject(error);
            else resolve();
          });
        });
      }
    } catch (error) {
      throw new Error(`Streaming secure deletion failed: ${error.message}`);
    }
  }

  /**
   * Validate encryption key strength
   * @param {Buffer} key - Key to validate
   * @returns {boolean} - True if key is strong enough
   */
  validateKey(key) {
    if (!Buffer.isBuffer(key)) {
      return false;
    }
    
    if (key.length !== this.keyLength) {
      return false;
    }
    
    // Check for obviously weak keys (all zeros, repeating patterns)
    const allZeros = Buffer.alloc(this.keyLength, 0);
    if (key.equals(allZeros)) {
      return false;
    }
    
    // Check for repeating bytes (less strict for random keys)
    const uniqueBytes = new Set(key);
    if (uniqueBytes.size < 2) {
      return false;
    }
    
    return true;
  }

  /**
   * Extract file headers without loading entire file
   * @param {string} encryptedPath - Path to encrypted file
   * @returns {Promise<Object>} - {iv, tag, hash, dataOffset}
   */
  async getFileHeaders(encryptedPath) {
    try {
      const fileHandle = await fs.open(encryptedPath, 'r');
      
      try {
        // Read headers: RELAYUM1(8) + IV(16) + Tag(16) + Hash(32) = 72 bytes
        const headerBuffer = Buffer.alloc(72);
        await fileHandle.read(headerBuffer, 0, 72, 0);
        
        // Verify file format
        const formatId = headerBuffer.slice(0, 8).toString();
        if (formatId !== 'RELAYUM1') {
          throw new Error('Invalid encrypted file format');
        }
        
        // Extract components
        const iv = headerBuffer.slice(8, 24);
        const tag = headerBuffer.slice(24, 40);
        const hash = headerBuffer.slice(40, 72).toString('hex');
        
        return {
          iv,
          tag,
          hash,
          dataOffset: 72
        };
      } finally {
        await fileHandle.close();
      }
    } catch (error) {
      throw new Error(`Failed to read file headers: ${error.message}`);
    }
  }

  /**
   * Create a streaming decryption from encrypted file
   * @param {string} encryptedPath - Path to encrypted file
   * @param {Buffer} fileKey - File decryption key
   * @returns {Promise<Object>} - {stream: ReadableStream, metadata: Object}
   */
  async decryptFileStream(encryptedPath, fileKey) {
    try {
      // Extract headers first
      const { iv, tag, hash, dataOffset } = await this.getFileHeaders(encryptedPath);
      
      // Create decipher stream
      const decipher = crypto.createDecipheriv(this.algorithm, fileKey, iv);
      decipher.setAuthTag(tag);
      
      // Create file read stream starting after headers
      const encryptedStream = require('fs').createReadStream(encryptedPath, {
        start: dataOffset,
        highWaterMark: parseInt(process.env.STREAM_CHUNK_SIZE) || 65536 // 64KB default
      });
      
      // Create hash verification stream
      const hashStream = crypto.createHash('sha256');
      let hashVerified = false;
      
      // Create a transform stream for hash verification
      const { Transform } = require('stream');
      const verificationStream = new Transform({
        transform(chunk, encoding, callback) {
          hashStream.update(chunk);
          callback(null, chunk);
        },
        flush(callback) {
          const calculatedHash = hashStream.digest('hex');
          if (calculatedHash !== hash) {
            return callback(new Error('File integrity verification failed'));
          }
          hashVerified = true;
          callback();
        }
      });
      
      // Create pipeline: EncryptedFile → Decipher → HashVerification → Output
      const { pipeline } = require('stream');
      const { Readable, PassThrough } = require('stream');
      
      const outputStream = new PassThrough({
        highWaterMark: parseInt(process.env.STREAM_BUFFER_SIZE) || 131072 // 128KB default
      });
      
      // Setup pipeline with error handling
      pipeline(
        encryptedStream,
        decipher,
        verificationStream,
        outputStream,
        (error) => {
          if (error) {
            outputStream.destroy(error);
          }
        }
      );
      
      return {
        stream: outputStream,
        metadata: {
          hash,
          verified: () => hashVerified
        }
      };
    } catch (error) {
      throw new Error(`Streaming decryption setup failed: ${error.message}`);
    }
  }

  /**
   * Encrypt a file using streams for memory efficiency
   * @param {string} sourcePath - Path to source file
   * @param {string} destinationPath - Path to save encrypted file
   * @param {Buffer} fileKey - File encryption key
   * @returns {Promise<Object>} - Encryption metadata {iv, tag, hash, size}
   */
  async encryptFileStream(sourcePath, destinationPath, fileKey) {
    try {
      // Generate IV for this encryption
      const iv = crypto.randomBytes(this.ivLength);
      
      // Create cipher stream
      const cipher = crypto.createCipheriv(this.algorithm, fileKey, iv);
      
      // Create hash stream for integrity
      const hashStream = crypto.createHash('sha256');
      
      // Create streams
      const sourceStream = require('fs').createReadStream(sourcePath, {
        highWaterMark: parseInt(process.env.STREAM_CHUNK_SIZE) || 65536 // 64KB default
      });
      
      // Ensure destination directory exists
      await fs.mkdir(path.dirname(destinationPath), { recursive: true });
      
      const destStream = require('fs').createWriteStream(destinationPath);
      
      // Create transform stream for hash calculation
      const { Transform } = require('stream');
      const hashingStream = new Transform({
        transform(chunk, encoding, callback) {
          hashStream.update(chunk);
          callback(null, chunk);
        }
      });
      
      // Write file headers first
      const headerBuffer = Buffer.concat([
        Buffer.from('RELAYUM1'), // File format identifier (8 bytes)
        iv,                      // IV (16 bytes)
        Buffer.alloc(16),        // Placeholder for auth tag (16 bytes)
        Buffer.alloc(32)         // Placeholder for hash (32 bytes)
      ]);
      
      destStream.write(headerBuffer);
      
      // Setup streaming pipeline
      const { pipeline } = require('stream');
      
      return new Promise((resolve, reject) => {
        pipeline(
          sourceStream,
          hashingStream,
          cipher,
          destStream,
          async (error) => {
            if (error) {
              return reject(new Error(`Streaming encryption failed: ${error.message}`));
            }
            
            try {
              // Get auth tag and hash after encryption
              const authTag = cipher.getAuthTag();
              const hash = hashStream.digest('hex');
              
              // Update the file with correct auth tag and hash
              const fileHandle = await fs.open(destinationPath, 'r+');
              
              try {
                // Write auth tag at position 24 (after RELAYUM1 + IV)
                await fileHandle.write(authTag, 0, 16, 24);
                
                // Write hash at position 40 (after RELAYUM1 + IV + Tag)
                const hashBuffer = Buffer.from(hash, 'hex');
                await fileHandle.write(hashBuffer, 0, 32, 40);
                
                // Get final file size
                const stats = await fs.stat(destinationPath);
                
                resolve({
                  iv: iv.toString('hex'),
                  tag: authTag.toString('hex'),
                  hash,
                  size: stats.size
                });
              } finally {
                await fileHandle.close();
              }
            } catch (updateError) {
              reject(new Error(`Failed to update file headers: ${updateError.message}`));
            }
          }
        );
      });
    } catch (error) {
      throw new Error(`Streaming encryption setup failed: ${error.message}`);
    }
  }
}

module.exports = EncryptionService;