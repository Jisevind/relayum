import React, { useState, useRef, useEffect } from 'react';
import { filesAPI, usersAPI, authAPI } from '../services/api';
import { useQueryClient } from '@tanstack/react-query';
import { useVirusScannerStatus } from '../hooks/useVirusScannerStatus';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  LinearProgress,
  Alert,
  Stack,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Avatar,
  Chip,
  Paper,
} from '@mui/material';
import {
  CloudUpload,
  InsertDriveFile,
  Folder,
  CheckCircle,
  Error,
  Upload,
  Settings,
} from '@mui/icons-material';

const FileUpload = ({ onUploadSuccess, currentFolderId = null }) => {
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [uploadProgress, setUploadProgress] = useState([]);
  const [config, setConfig] = useState({ maxFileSizeFormatted: '100MB' });
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const queryClient = useQueryClient();
  
  // Get virus scanner status
  const { status: virusScannerStatus } = useVirusScannerStatus();
  const isVirusScanningEnabled = virusScannerStatus?.enabled || false;
  
  // Fetch configuration on component mount
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await authAPI.getConfig();
        setConfig(response.data);
      } catch (error) {
        console.error('Failed to fetch config:', error);
        // Keep default value if config fetch fails
      }
    };
    fetchConfig();
  }, []);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    const files = [];
    
    try {
      // Handle both files and directories
      if (e.dataTransfer.items) {
        const items = Array.from(e.dataTransfer.items);
        
        for (const item of items) {
          if (item.kind === 'file') {
            const entry = item.webkitGetAsEntry();
            if (entry) {
              if (entry.isFile) {
                const file = item.getAsFile();
                files.push(file);
              } else if (entry.isDirectory) {
                await Promise.race([
                  readDirectory(entry, files, entry.name),
                  new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Directory read timeout')), 30000)
                  )
                ]);
              }
            }
          }
        }
      } else if (e.dataTransfer.files) {
        // Fallback for browsers that don't support DataTransferItem
        files.push(...Array.from(e.dataTransfer.files));
      }
      
      if (files.length > 0) {
        handleFiles(files);
      } else {
        setError('No files found to upload');
      }
    } catch (error) {
      console.error('Error processing dropped files:', error);
      setError('Error processing dropped files. Try using the "Select Folder" button instead.');
    }
  };

  const readDirectory = async (dirEntry, files, path = '') => {
    const dirReader = dirEntry.createReader();
    
    return new Promise((resolve) => {
      const readEntries = () => {
        dirReader.readEntries(async (entries) => {
          if (entries.length === 0) {
            resolve();
            return;
          }
          
          const promises = [];
          
          for (const entry of entries) {
            if (entry.isFile) {
              promises.push(new Promise((fileResolve) => {
                entry.file((file) => {
                  // Set webkitRelativePath manually for drag&drop
                  const relativePath = path ? `${path}/${file.name}` : file.name;
                  Object.defineProperty(file, 'webkitRelativePath', {
                    value: relativePath,
                    writable: false
                  });
                  files.push(file);
                  fileResolve();
                });
              }));
            } else if (entry.isDirectory) {
              promises.push(readDirectory(entry, files, path ? `${path}/${entry.name}` : entry.name));
            }
          }
          
          await Promise.all(promises);
          readEntries(); // Continue reading if there are more entries
        });
      };
      
      readEntries();
    });
  };

  const handleChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const files = Array.from(e.target.files);
      handleFiles(files);
    }
  };

  const handleFiles = async (files) => {
    setUploading(true);
    setError('');
    setSuccess('');
    
    // Initialize progress tracking for each file
    const fileArray = Array.from(files);
    const initialProgress = fileArray.map((file, index) => ({
      id: index,
      name: file.name,
      size: file.size,
      progress: 0,
      status: 'uploading'
    }));
    setUploadProgress(initialProgress);

    // Check quota before upload
    try {
      const quotaResponse = await usersAPI.getQuota();
      const totalUploadSize = fileArray.reduce((sum, file) => sum + file.size, 0);
      
      if (totalUploadSize > quotaResponse.data.disk_available_bytes) {
        const formatBytes = (bytes) => {
          if (bytes === 0) return '0 Bytes';
          const k = 1024;
          const sizes = ['Bytes', 'KB', 'MB', 'GB'];
          const i = Math.floor(Math.log(bytes) / Math.log(k));
          return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        };
        
        setError(`Upload size (${formatBytes(totalUploadSize)}) exceeds available space (${formatBytes(quotaResponse.data.disk_available_bytes)}). Please free up space or select fewer files.`);
        setUploading(false);
        setUploadProgress([]);
        return;
      }
    } catch (quotaError) {
      console.warn('Could not check quota before upload:', quotaError);
      // Continue with upload even if quota check fails
    }

    try {
      const formData = new FormData();
      fileArray.forEach((file, index) => {
        formData.append('files', file);
        // Include webkitRelativePath if available (for folder uploads)
        if (file.webkitRelativePath) {
          formData.append(`webkitRelativePath_${index}`, file.webkitRelativePath);
        }
      });
      
      // Files are automatically encrypted on the server
      
      // Add folder_id if we're uploading to a specific folder
      if (currentFolderId) {
        formData.append('folder_id', currentFolderId);
      }

      const response = await filesAPI.upload(formData, {
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          
          // Update progress for all files (since we're uploading as a batch)
          setUploadProgress(prev => 
            prev.map(file => ({
              ...file,
              progress: percentCompleted,
              status: percentCompleted === 100 ? 'processing' : 'uploading'
            }))
          );
        }
      });
      
      // Set processing state during virus scanning
      setProcessing(true);
      setUploadProgress(prev => 
        prev.map(file => ({
          ...file,
          progress: 100,
          status: 'processing'
        }))
      );
      
      // Wait a moment to show processing state, then mark as completed
      // Shorter delay when virus scanning is disabled since no actual scanning occurs
      const processingDelay = isVirusScanningEnabled ? 1000 : 200;
      setTimeout(() => {
        setUploadProgress(prev => 
          prev.map(file => ({
            ...file,
            status: 'completed'
          }))
        );
        setProcessing(false);
      }, processingDelay);
      
      // Show success message with quota info if available
      let successMessage = `Successfully uploaded and encrypted ${response.data.files.length} file(s)`;
      if (response.data.disk_usage) {
        const formatBytes = (bytes) => {
          if (bytes === 0) return '0 Bytes';
          const k = 1024;
          const sizes = ['Bytes', 'KB', 'MB', 'GB'];
          const i = Math.floor(Math.log(bytes) / Math.log(k));
          return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        };
        
        const usage = response.data.disk_usage;
        const usagePercent = Math.round((usage.used_bytes / usage.quota_bytes) * 100);
        successMessage += `. Storage: ${formatBytes(usage.used_bytes)} of ${formatBytes(usage.quota_bytes)} used (${usagePercent}%)`;
      }
      setSuccess(successMessage);
      
      // Invalidate React Query cache to refresh file browser, tree view, and quota display
      queryClient.invalidateQueries({ queryKey: ['files'] });
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      queryClient.invalidateQueries({ queryKey: ['folderTree'] });
      queryClient.invalidateQueries({ queryKey: ['quota'] });
      
      if (onUploadSuccess) {
        onUploadSuccess(response.data.files);
      }
      
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      if (folderInputRef.current) {
        folderInputRef.current.value = '';
      }
      
      // Clear progress after success message
      setTimeout(() => {
        setSuccess('');
        setUploadProgress([]);
      }, 3000);
    } catch (error) {
      // Handle quota-specific errors with better messaging
      if (error.response?.status === 413) {
        const errorData = error.response.data;
        if (errorData.quota_bytes && errorData.used_bytes && errorData.available_bytes) {
          const formatBytes = (bytes) => {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
          };
          
          setError(`${errorData.error}. Available space: ${formatBytes(errorData.available_bytes)} of ${formatBytes(errorData.quota_bytes)} total.${errorData.has_admin_override ? ' (Admin override active)' : ''}`);
        } else {
          setError(errorData.error || 'Upload would exceed disk quota');
        }
      } else {
        setError(error.response?.data?.error || 'Upload failed');
      }
      
      // Mark all files as failed
      setUploadProgress(prev => 
        prev.map(file => ({
          ...file,
          status: 'failed'
        }))
      );
    } finally {
      setUploading(false);
      setProcessing(false);
    }
  };

  const onFileButtonClick = () => {
    fileInputRef.current?.click();
  };

  const onFolderButtonClick = () => {
    folderInputRef.current?.click();
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'uploading': return <Upload color="primary" />;
      case 'processing': return <Settings color="primary" />;
      case 'completed': return <CheckCircle color="success" />;
      case 'failed': return <Error color="error" />;
      default: return <InsertDriveFile />;
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'uploading': return 'Uploading...';
      case 'processing': return isVirusScanningEnabled ? 'Virus Scanning...' : 'Processing...';
      case 'completed': return 'Completed';
      case 'failed': return 'Failed';
      default: return '';
    }
  };

  return (
    <Box sx={{ width: '100%' }}>
      <Card>
        <CardContent>
          <Paper
            elevation={0}
            sx={{
              border: '2px dashed',
              borderColor: dragActive ? 'primary.main' : 'divider',
              backgroundColor: dragActive ? 'primary.50' : 'background.paper',
              borderRadius: 2,
              p: 6,
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s ease-in-out',
              '&:hover': {
                borderColor: dragActive ? 'primary.main' : 'primary.light',
                backgroundColor: dragActive ? 'primary.50' : 'action.hover',
              },
            }}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            {/* Hidden file inputs */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleChange}
              style={{ display: 'none' }}
              accept=".jpg,.jpeg,.png,.gif,.pdf,.doc,.docx,.txt,.zip,.rar,.mp4,.mp3,.xlsx,.pptx"
            />
            <input
              ref={folderInputRef}
              type="file"
              multiple
              webkitdirectory=""
              onChange={handleChange}
              style={{ display: 'none' }}
            />
            
            <Stack spacing={3} alignItems="center">
              <CloudUpload 
                sx={{ 
                  fontSize: 64, 
                  color: (uploading || processing) ? 'primary.main' : 'text.secondary',
                  opacity: (uploading || processing) ? 0.7 : 1,
                }} 
              />
              
              <Box sx={{ width: '100%', maxWidth: 400 }}>
                <Typography variant="h6" component="h2" gutterBottom align="center">
                  {uploading ? 'Uploading...' : processing ? (isVirusScanningEnabled ? 'Processing & Scanning...' : 'Processing & Finalizing...') : 'Upload Files or Folders'}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }} align="center">
                  Drag and drop files/folders here, or use the buttons below.<br/>
                  <strong>All files are automatically encrypted and secured on upload.</strong>
                  {processing && isVirusScanningEnabled && (<><br/><strong style={{color: '#1976d2'}}>Files are being scanned for viruses - please wait...</strong></>)}
                  {processing && !isVirusScanningEnabled && (<><br/><strong style={{color: '#1976d2'}}>Files are being processed and encrypted - please wait...</strong></>)}
                </Typography>
                
                <Stack direction="row" spacing={2} justifyContent="center">
                  <Button
                    variant="contained"
                    startIcon={<InsertDriveFile />}
                    onClick={onFileButtonClick}
                    disabled={uploading || processing}
                    sx={{ minWidth: 140 }}
                  >
                    {uploading ? 'Uploading...' : processing ? 'Processing...' : 'Select Files'}
                  </Button>
                  <Button
                    variant="contained"
                    color="success"
                    startIcon={<Folder />}
                    onClick={onFolderButtonClick}
                    disabled={uploading || processing}
                    sx={{ minWidth: 140 }}
                  >
                    {uploading ? 'Uploading...' : processing ? 'Processing...' : 'Select Folder'}
                  </Button>
                </Stack>
                
                <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }} align="center">
                  Max file size: {config.maxFileSizeFormatted}. Supported formats: Images, Documents, Archives, Videos, Audio
                </Typography>
              </Box>
            </Stack>
          </Paper>

          {/* Upload Progress */}
          {uploadProgress.length > 0 && (
            <Box sx={{ mt: 3 }}>
              <Typography variant="subtitle2" gutterBottom>
                Upload Progress
              </Typography>
              <List sx={{ bgcolor: 'background.paper', borderRadius: 1 }}>
                {uploadProgress.map((file, index) => (
                  <ListItem
                    key={file.id}
                    divider={index < uploadProgress.length - 1}
                    sx={{ py: 2 }}
                  >
                    <ListItemAvatar>
                      <Avatar
                        sx={{
                          bgcolor: file.status === 'failed' 
                            ? 'error.main' 
                            : file.status === 'completed'
                            ? 'success.main'
                            : 'primary.main',
                        }}
                      >
                        {getStatusIcon(file.status)}
                      </Avatar>
                    </ListItemAvatar>
                    
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="body2" noWrap sx={{ flexGrow: 1, maxWidth: 300 }}>
                            {file.name}
                          </Typography>
                          <Chip
                            label={getStatusText(file.status)}
                            size="small"
                            variant="outlined"
                            color={
                              file.status === 'failed' 
                                ? 'error' 
                                : file.status === 'completed'
                                ? 'success'
                                : 'primary'
                            }
                          />
                          <Typography variant="body2" color="text.secondary">
                            {file.progress}%
                          </Typography>
                        </Box>
                      }
                      secondary={
                        <span style={{ marginTop: '8px', display: 'block' }}>
                          <Typography variant="caption" color="text.secondary" display="block">
                            {formatFileSize(file.size)}
                          </Typography>
                          <LinearProgress
                            variant="determinate"
                            value={file.progress}
                            sx={{
                              mt: 0.5,
                              height: 6,
                              borderRadius: 3,
                              '& .MuiLinearProgress-bar': {
                                backgroundColor: file.status === 'failed' 
                                  ? 'error.main' 
                                  : file.status === 'completed'
                                  ? 'success.main'
                                  : 'primary.main',
                              },
                            }}
                          />
                        </span>
                      }
                    />
                  </ListItem>
                ))}
              </List>
            </Box>
          )}

          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}

          {success && (
            <Alert severity="success" sx={{ mt: 2 }}>
              {success}
            </Alert>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default FileUpload;