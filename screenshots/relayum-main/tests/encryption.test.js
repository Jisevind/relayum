const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const EncryptionService = require('../utils/encryptionService');
const StorageService = require('../utils/storageService');
const { dbUtils } = require('./testUtils');

// Set test environment
process.env.STREAM_CHUNK_SIZE = '8192';
process.env.STREAM_BUFFER_SIZE = '16384';

describe('Encryption and Storage Services', () => {
  let encryptionService, storageService;
  let testUser;

  beforeAll(async () => {
    encryptionService = new EncryptionService();
    storageService = new StorageService();
    await storageService.initializeStorage();
  });

  beforeEach(async () => {
    await dbUtils.cleanDatabase();
    await dbUtils.cleanupTestFiles();
    
    testUser = await dbUtils.createTestUser({
      username: 'encryptionuser',
      email: 'encryption@example.com'
    });
  });

  afterEach(async () => {
    await dbUtils.cleanupTestFiles();
  });

  describe('EncryptionService', () => {
    describe('Key Generation and Derivation', () => {
      it('should generate secure file IDs', () => {
        const fileId1 = encryptionService.generateFileId('test.txt', 123);
        const fileId2 = encryptionService.generateFileId('test.txt', 123);
        
        expect(fileId1).toHaveLength(64); // SHA256 hex
        expect(fileId2).toHaveLength(64);
        expect(fileId1).not.toBe(fileId2); // Should be unique
      });

      it('should derive consistent file keys', () => {
        const masterKey = crypto.randomBytes(32);
        const fileId = 'test-file-id';
        
        const key1 = encryptionService.deriveFileKey(masterKey, fileId);
        const key2 = encryptionService.deriveFileKey(masterKey, fileId);
        
        expect(key1).toEqual(key2);
        expect(key1).toHaveLength(32);
      });

      it('should validate encryption keys correctly', () => {
        const validKey = crypto.randomBytes(32);
        const invalidKey1 = crypto.randomBytes(16); // Wrong length
        const invalidKey2 = Buffer.alloc(32, 0); // All zeros
        
        expect(encryptionService.validateKey(validKey)).toBe(true);
        expect(encryptionService.validateKey(invalidKey1)).toBe(false);
        expect(encryptionService.validateKey(invalidKey2)).toBe(false);
      });
    });

    describe('Buffer-based Encryption/Decryption', () => {
      it('should encrypt and decrypt data correctly', () => {
        const fileKey = crypto.randomBytes(32);
        const testData = Buffer.from('Test encryption data');
        
        const { encryptedData, iv, tag } = encryptionService.encryptData(fileKey, testData);
        const decryptedData = encryptionService.decryptData(fileKey, encryptedData, iv, tag);
        
        expect(decryptedData).toEqual(testData);
      });

      it('should fail decryption with wrong key', () => {
        const fileKey1 = crypto.randomBytes(32);
        const fileKey2 = crypto.randomBytes(32);
        const testData = Buffer.from('Test data');
        
        const { encryptedData, iv, tag } = encryptionService.encryptData(fileKey1, testData);
        
        expect(() => {
          encryptionService.decryptData(fileKey2, encryptedData, iv, tag);
        }).toThrow();
      });

      it('should fail decryption with tampered data', () => {
        const fileKey = crypto.randomBytes(32);
        const testData = Buffer.from('Test data');
        
        const { encryptedData, iv, tag } = encryptionService.encryptData(fileKey, testData);
        
        // Tamper with encrypted data
        encryptedData[0] = encryptedData[0] ^ 1;
        
        expect(() => {
          encryptionService.decryptData(fileKey, encryptedData, iv, tag);
        }).toThrow();
      });
    });

    describe('File-based Encryption/Decryption', () => {
      it('should encrypt and decrypt files correctly', async () => {
        const testDir = path.join(__dirname, 'temp');
        await fs.mkdir(testDir, { recursive: true });
        
        const sourcePath = path.join(testDir, 'source.txt');
        const encryptedPath = path.join(testDir, 'encrypted.enc');
        const testContent = 'Test file content for encryption';
        
        await fs.writeFile(sourcePath, testContent);
        
        const fileKey = crypto.randomBytes(32);
        const encryptResult = await encryptionService.encryptFile(sourcePath, encryptedPath, fileKey);
        
        expect(encryptResult).toHaveProperty('iv');
        expect(encryptResult).toHaveProperty('tag');
        expect(encryptResult).toHaveProperty('hash');
        expect(encryptResult).toHaveProperty('size');
        
        const decryptedData = await encryptionService.decryptFile(encryptedPath, fileKey);
        expect(decryptedData.toString()).toBe(testContent);
        
        // Verify hash
        const expectedHash = crypto.createHash('sha256').update(testContent).digest('hex');
        expect(encryptResult.hash).toBe(expectedHash);
      });

      it('should handle file format validation', async () => {
        const testDir = path.join(__dirname, 'temp');
        await fs.mkdir(testDir, { recursive: true });
        
        const invalidPath = path.join(testDir, 'invalid.enc');
        await fs.writeFile(invalidPath, 'Invalid file format');
        
        const fileKey = crypto.randomBytes(32);
        
        await expect(encryptionService.decryptFile(invalidPath, fileKey))
          .rejects.toThrow('Invalid encrypted file format');
      });
    });

    describe('Streaming Encryption/Decryption', () => {
      it('should extract file headers correctly', async () => {
        const testDir = path.join(__dirname, 'temp');
        await fs.mkdir(testDir, { recursive: true });
        
        const sourcePath = path.join(testDir, 'source.txt');
        const encryptedPath = path.join(testDir, 'encrypted.enc');
        const testContent = 'Header extraction test content';
        
        await fs.writeFile(sourcePath, testContent);
        
        const fileKey = crypto.randomBytes(32);
        const encryptResult = await encryptionService.encryptFileStream(sourcePath, encryptedPath, fileKey);
        
        const headers = await encryptionService.getFileHeaders(encryptedPath);
        
        expect(headers).toHaveProperty('iv');
        expect(headers).toHaveProperty('tag');
        expect(headers).toHaveProperty('hash');
        expect(headers).toHaveProperty('dataOffset', 72);
        expect(headers.hash).toBe(encryptResult.hash);
      });

      it('should stream encrypt and decrypt correctly', async () => {
        const testDir = path.join(__dirname, 'temp');
        await fs.mkdir(testDir, { recursive: true });
        
        const sourcePath = path.join(testDir, 'source.txt');
        const encryptedPath = path.join(testDir, 'encrypted.enc');
        const testContent = 'Streaming encryption test content. '.repeat(100); // ~3KB
        
        await fs.writeFile(sourcePath, testContent);
        
        const fileKey = crypto.randomBytes(32);
        
        // Stream encrypt
        const encryptResult = await encryptionService.encryptFileStream(sourcePath, encryptedPath, fileKey);
        expect(encryptResult).toHaveProperty('hash');
        
        // Stream decrypt
        const streamResult = await encryptionService.decryptFileStream(encryptedPath, fileKey);
        
        // Collect streamed data
        const chunks = [];
        streamResult.stream.on('data', chunk => chunks.push(chunk));
        
        await new Promise((resolve, reject) => {
          streamResult.stream.on('end', resolve);
          streamResult.stream.on('error', reject);
        });
        
        const decryptedContent = Buffer.concat(chunks).toString();
        expect(decryptedContent).toBe(testContent);
        
        // Verify hash
        const expectedHash = crypto.createHash('sha256').update(testContent).digest('hex');
        expect(encryptResult.hash).toBe(expectedHash);
      });

      it('should verify integrity during streaming', async () => {
        const testDir = path.join(__dirname, 'temp');
        await fs.mkdir(testDir, { recursive: true });
        
        const sourcePath = path.join(testDir, 'source.txt');
        const encryptedPath = path.join(testDir, 'encrypted.enc');
        const testContent = 'Integrity test content';
        
        await fs.writeFile(sourcePath, testContent);
        
        const fileKey = crypto.randomBytes(32);
        await encryptionService.encryptFileStream(sourcePath, encryptedPath, fileKey);
        
        // Tamper with encrypted file (after headers)
        const fileData = await fs.readFile(encryptedPath);
        fileData[100] = fileData[100] ^ 1; // Flip a bit
        await fs.writeFile(encryptedPath, fileData);
        
        const streamResult = await encryptionService.decryptFileStream(encryptedPath, fileKey);
        
        // Should fail during streaming due to integrity check
        await expect(new Promise((resolve, reject) => {
          const chunks = [];
          streamResult.stream.on('data', chunk => chunks.push(chunk));
          streamResult.stream.on('end', () => resolve(Buffer.concat(chunks)));
          streamResult.stream.on('error', reject);
        })).rejects.toThrow('File integrity verification failed');
      });

      it('should handle large files efficiently', async () => {
        const testDir = path.join(__dirname, 'temp');
        await fs.mkdir(testDir, { recursive: true });
        
        const sourcePath = path.join(testDir, 'large.txt');
        const encryptedPath = path.join(testDir, 'large.enc');
        
        // Create a ~1MB file
        const largeContent = 'Large file test content line. '.repeat(32000);
        await fs.writeFile(sourcePath, largeContent);
        
        const startMemory = process.memoryUsage().heapUsed;
        const startTime = Date.now();
        
        const fileKey = crypto.randomBytes(32);
        
        // Stream encrypt
        const encryptResult = await encryptionService.encryptFileStream(sourcePath, encryptedPath, fileKey);
        
        // Stream decrypt
        const streamResult = await encryptionService.decryptFileStream(encryptedPath, fileKey);
        
        const chunks = [];
        streamResult.stream.on('data', chunk => chunks.push(chunk));
        
        await new Promise((resolve, reject) => {
          streamResult.stream.on('end', resolve);
          streamResult.stream.on('error', reject);
        });
        
        const endTime = Date.now();
        const endMemory = process.memoryUsage().heapUsed;
        const memoryIncrease = endMemory - startMemory;
        
        const decryptedContent = Buffer.concat(chunks).toString();
        expect(decryptedContent).toBe(largeContent);
        
        // Performance checks
        expect(endTime - startTime).toBeLessThan(5000); // Less than 5 seconds
        expect(memoryIncrease).toBeLessThan(2 * 1024 * 1024); // Less than 2MB memory increase
      });
    });
  });

  describe('StorageService', () => {
    describe('User Storage Management', () => {
      it('should initialize user storage correctly', async () => {
        await storageService.initializeUserStorage(testUser.id);
        
        const userExists = await storageService.userStorageExists(testUser.id);
        expect(userExists).toBe(true);
        
        const stats = await storageService.getUserStorageStats(testUser.id);
        expect(stats).toHaveProperty('totalFiles', 0);
        expect(stats).toHaveProperty('encryptedSize', 0);
      });

      it('should generate unique user paths', () => {
        const path1 = storageService.getUserStoragePath(testUser.id);
        const path2 = storageService.getUserStoragePath(testUser.id + 1);
        
        expect(path1).not.toBe(path2);
        expect(path1).toContain('users');
        expect(path2).toContain('users');
      });
    });

    describe('File Storage and Retrieval', () => {
      it('should store and retrieve files correctly', async () => {
        const testDir = path.join(__dirname, 'temp');
        await fs.mkdir(testDir, { recursive: true });
        
        const sourcePath = path.join(testDir, 'test.txt');
        const testContent = 'Storage service test content';
        await fs.writeFile(sourcePath, testContent);
        
        // Store file
        const storeResult = await storageService.storeFile(
          testUser.id,
          sourcePath,
          'test.txt',
          'text/plain',
          Buffer.byteLength(testContent)
        );
        
        expect(storeResult).toHaveProperty('fileId');
        expect(storeResult).toHaveProperty('encryptedPath');
        expect(storeResult).toHaveProperty('hash');
        expect(storeResult.originalSize).toBe(Buffer.byteLength(testContent));
        
        // Retrieve file (buffer mode)
        const retrieveResult = await storageService.retrieveFile(testUser.id, storeResult.fileId);
        expect(retrieveResult.data.toString()).toBe(testContent);
        expect(retrieveResult.metadata.originalName).toBe('test.txt');
        expect(retrieveResult.metadata.mimeType).toBe('text/plain');
        
        // Retrieve file (streaming mode)
        const streamResult = await storageService.retrieveFileStream(testUser.id, storeResult.fileId);
        
        const chunks = [];
        streamResult.stream.on('data', chunk => chunks.push(chunk));
        
        await new Promise((resolve, reject) => {
          streamResult.stream.on('end', resolve);
          streamResult.stream.on('error', reject);
        });
        
        const streamedContent = Buffer.concat(chunks).toString();
        expect(streamedContent).toBe(testContent);
        expect(streamResult.metadata.originalName).toBe('test.txt');
      });

      it('should get file metadata without loading content', async () => {
        const testDir = path.join(__dirname, 'temp');
        await fs.mkdir(testDir, { recursive: true });
        
        const sourcePath = path.join(testDir, 'metadata-test.txt');
        const testContent = 'Metadata test content';
        await fs.writeFile(sourcePath, testContent);
        
        const storeResult = await storageService.storeFile(
          testUser.id,
          sourcePath,
          'metadata-test.txt',
          'text/plain',
          Buffer.byteLength(testContent)
        );
        
        const metadata = await storageService.getFileMetadata(testUser.id, storeResult.fileId);
        
        expect(metadata.originalName).toBe('metadata-test.txt');
        expect(metadata.mimeType).toBe('text/plain');
        expect(metadata.originalSize).toBe(Buffer.byteLength(testContent));
        expect(metadata).toHaveProperty('hash');
        expect(metadata).toHaveProperty('uploadedAt');
      });

      it('should delete files correctly', async () => {
        const testDir = path.join(__dirname, 'temp');
        await fs.mkdir(testDir, { recursive: true });
        
        const sourcePath = path.join(testDir, 'delete-test.txt');
        await fs.writeFile(sourcePath, 'Delete test content');
        
        const storeResult = await storageService.storeFile(
          testUser.id,
          sourcePath,
          'delete-test.txt',
          'text/plain',
          17
        );
        
        // Verify file exists
        const metadata = await storageService.getFileMetadata(testUser.id, storeResult.fileId);
        expect(metadata.originalName).toBe('delete-test.txt');
        
        // Delete file
        await storageService.deleteFile(testUser.id, storeResult.fileId);
        
        // Verify file no longer exists
        await expect(storageService.getFileMetadata(testUser.id, storeResult.fileId))
          .rejects.toThrow('File not found');
      });

      it('should handle file not found errors', async () => {
        await expect(storageService.retrieveFile(testUser.id, 'non-existent-id'))
          .rejects.toThrow('File not found');
          
        await expect(storageService.retrieveFileStream(testUser.id, 'non-existent-id'))
          .rejects.toThrow('File not found');
          
        await expect(storageService.getFileMetadata(testUser.id, 'non-existent-id'))
          .rejects.toThrow('File not found');
      });
    });

    describe('Storage Validation', () => {
      it('should validate user storage integrity', async () => {
        const testDir = path.join(__dirname, 'temp');
        await fs.mkdir(testDir, { recursive: true });
        
        const sourcePath = path.join(testDir, 'validation-test.txt');
        await fs.writeFile(sourcePath, 'Validation test content');
        
        const storeResult = await storageService.storeFile(
          testUser.id,
          sourcePath,
          'validation-test.txt',
          'text/plain',
          22
        );
        
        const validation = await storageService.validateUserStorage(testUser.id);
        
        expect(validation.valid).toBe(true);
        expect(validation.files).toHaveLength(1);
        expect(validation.files[0]).toHaveProperty('fileId', storeResult.fileId);
        expect(validation.files[0]).toHaveProperty('status', 'valid');
        expect(validation.errors).toHaveLength(0);
      });
    });
  });
});