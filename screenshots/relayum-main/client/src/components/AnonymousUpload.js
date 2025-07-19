import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  TextField,
  Alert,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Chip,
  Stack,
  InputAdornment,
  IconButton,
  Tooltip,
  Card,
  CardContent,
} from '@mui/material';
import {
  CloudUpload,
  InsertDriveFile,
  CheckCircle,
  Error,
  ContentCopy,
  Lock,
  Visibility,
  VisibilityOff,
  Public,
  Schedule,
} from '@mui/icons-material';
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL;

const AnonymousUpload = ({ maxFileSize = 1073741824 }) => { // Default 1GB
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [sharePassword, setSharePassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [config, setConfig] = useState({ 
    anonymousMaxFileSizeFormatted: '1GB',
    anonymousShareExpirationDays: 7
  });
  
  // Fetch configuration on component mount
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/auth/config`);
        setConfig(response.data);
      } catch (error) {
        console.error('Failed to fetch config:', error);
        // Keep default values if config fetch fails
      }
    };
    fetchConfig();
  }, []);

  const handleFileSelect = (e) => {
    const selectedFiles = Array.from(e.target.files);
    setFiles(selectedFiles);
    setError('');
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    setFiles(droppedFiles);
    setError('');
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleUpload = async () => {
    if (files.length === 0) {
      setError('Please select files to upload');
      return;
    }

    setUploading(true);
    setError('');
    setSuccess('');

    // Initialize progress tracking
    const initialProgress = files.map((file, index) => ({
      id: index,
      name: file.name,
      size: file.size,
      progress: 0,
      status: 'uploading'
    }));
    setUploadProgress(initialProgress);

    try {
      const formData = new FormData();
      files.forEach(file => {
        formData.append('files', file);
      });

      // Add password if provided
      if (sharePassword) {
        formData.append('password', sharePassword);
      }

      // Anonymous upload endpoint
      const response = await axios.post(`${API_BASE_URL}/anonymous/upload`, formData, {
        headers: {}, // Let browser set Content-Type automatically for FormData
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          
          setUploadProgress(prev => 
            prev.map(file => ({
              ...file,
              progress: percentCompleted,
              status: percentCompleted === 100 ? 'processing' : 'uploading'
            }))
          );
        }
      });

      // Mark all files as completed
      setUploadProgress(prev => 
        prev.map(file => ({
          ...file,
          progress: 100,
          status: 'completed'
        }))
      );

      setShareUrl(response.data.share_url);
      setSuccess(`Files uploaded successfully! Your anonymous share link is ready.`);

      // Clear files after successful upload
      setTimeout(() => {
        setFiles([]);
        setUploadProgress([]);
      }, 2000);

    } catch (err) {
      setError(err.response?.data?.error || 'Upload failed');
      
      // Mark all files as failed
      setUploadProgress(prev => 
        prev.map(file => ({
          ...file,
          status: 'failed'
        }))
      );
    } finally {
      setUploading(false);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setSuccess('Share link copied to clipboard!');
    } catch (error) {
      setError('Failed to copy link to clipboard');
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'uploading': return <CloudUpload color="primary" />;
      case 'processing': return <CloudUpload color="primary" />;
      case 'completed': return <CheckCircle color="success" />;
      case 'failed': return <Error color="error" />;
      default: return <InsertDriveFile />;
    }
  };

  return (
    <Box sx={{ maxWidth: 600, mx: 'auto', p: 3 }}>
      <Typography variant="h4" component="h1" gutterBottom align="center">
        Anonymous File Share
      </Typography>
      <Typography variant="body1" color="text.secondary" align="center" sx={{ mb: 4 }}>
        Upload files without creating an account. Share links expire after {config.anonymousShareExpirationDays} {config.anonymousShareExpirationDays === 1 ? 'day' : 'days'}.
      </Typography>

      {/* Upload Area */}
      <Paper
        elevation={0}
        sx={{
          border: '2px dashed',
          borderColor: dragActive ? 'primary.main' : 'divider',
          backgroundColor: dragActive ? 'primary.50' : 'background.paper',
          borderRadius: 2,
          p: 4,
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'all 0.2s ease-in-out',
          mb: 3,
          '&:hover': {
            borderColor: dragActive ? 'primary.main' : 'primary.light',
            backgroundColor: dragActive ? 'primary.50' : 'action.hover',
          },
        }}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => document.getElementById('file-input').click()}
      >
        <input
          id="file-input"
          type="file"
          multiple
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
        
        <CloudUpload sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
        <Typography variant="h6" gutterBottom>
          {files.length > 0 ? `${files.length} file(s) selected` : 'Drop files here or click to browse'}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Maximum file size: {formatFileSize(maxFileSize)} per file
        </Typography>
      </Paper>

      {/* Selected Files */}
      {files.length > 0 && (
        <Paper sx={{ mb: 3, p: 2 }}>
          <Typography variant="h6" gutterBottom>
            Selected Files ({files.length})
          </Typography>
          <List dense>
            {files.map((file, index) => (
              <ListItem key={index}>
                <ListItemAvatar>
                  <Avatar>
                    <InsertDriveFile />
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={file.name}
                  secondary={formatFileSize(file.size)}
                />
              </ListItem>
            ))}
          </List>
        </Paper>
      )}

      {/* Upload Progress */}
      {uploadProgress.length > 0 && (
        <Paper sx={{ mb: 3, p: 2 }}>
          <Typography variant="h6" gutterBottom>
            Upload Progress
          </Typography>
          <List>
            {uploadProgress.map((file) => (
              <ListItem key={file.id}>
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
                      <Typography variant="body2" noWrap sx={{ flexGrow: 1 }}>
                        {file.name}
                      </Typography>
                      <Chip
                        label={`${file.progress}%`}
                        size="small"
                        color={
                          file.status === 'failed' 
                            ? 'error' 
                            : file.status === 'completed'
                            ? 'success'
                            : 'primary'
                        }
                      />
                    </Box>
                  }
                  secondary={
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
                  }
                />
              </ListItem>
            ))}
          </List>
        </Paper>
      )}

      {/* Password Protection */}
      <TextField
        fullWidth
        type={showPassword ? 'text' : 'password'}
        label="Password Protection (Optional)"
        value={sharePassword}
        onChange={(e) => setSharePassword(e.target.value)}
        placeholder="Enter password to protect your share"
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <Lock />
            </InputAdornment>
          ),
          endAdornment: (
            <InputAdornment position="end">
              <IconButton
                onClick={() => setShowPassword(!showPassword)}
                edge="end"
              >
                {showPassword ? <VisibilityOff /> : <Visibility />}
              </IconButton>
            </InputAdornment>
          ),
        }}
        helperText="If set, users will need this password to download the files"
        sx={{ mb: 3 }}
      />

      {/* Upload Button */}
      <Button
        fullWidth
        variant="contained"
        size="large"
        onClick={handleUpload}
        disabled={uploading || files.length === 0}
        startIcon={<Public />}
        sx={{ mb: 3 }}
      >
        {uploading ? 'Uploading...' : 'Create Anonymous Share'}
      </Button>

      {/* Alerts */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {success}
        </Alert>
      )}

      {/* Share URL */}
      {shareUrl && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <Public color="success" />
              <Typography variant="h6" color="success.main">
                Anonymous Share Created!
              </Typography>
            </Box>
            
            <Box sx={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 1,
              p: 2,
              border: '1px solid',
              borderColor: 'success.main',
              borderRadius: 1,
              bgcolor: 'success.50',
              mb: 2
            }}>
              <Typography 
                variant="body2" 
                sx={{ 
                  flexGrow: 1, 
                  wordBreak: 'break-all',
                  fontFamily: 'monospace'
                }}
              >
                {shareUrl}
              </Typography>
              <Tooltip title="Copy link">
                <IconButton onClick={copyToClipboard} color="success">
                  <ContentCopy />
                </IconButton>
              </Tooltip>
            </Box>
            
            <Stack spacing={1}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Schedule fontSize="small" />
                <Typography variant="caption" color="text.secondary">
                  Expires in {config.anonymousShareExpirationDays} {config.anonymousShareExpirationDays === 1 ? 'day' : 'days'}
                </Typography>
              </Box>
              {sharePassword && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Lock fontSize="small" />
                  <Typography variant="caption" color="text.secondary">
                    Password protected
                  </Typography>
                </Box>
              )}
              <Typography variant="caption" color="text.secondary">
                Anyone with this link can download the files (no account required)
              </Typography>
            </Stack>
          </CardContent>
        </Card>
      )}

      {/* Info */}
      <Paper sx={{ p: 2, bgcolor: 'background.default' }}>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          <strong>Anonymous sharing features:</strong>
        </Typography>
        <Typography variant="caption" color="text.secondary" component="div">
          • No account required to share or download<br/>
          • Files automatically expire after {config.anonymousShareExpirationDays} {config.anonymousShareExpirationDays === 1 ? 'day' : 'days'}<br/>
          • Optional password protection<br/>
          • Share link works immediately<br/>
          • Maximum {config.anonymousMaxFileSizeFormatted} per file
        </Typography>
      </Paper>
    </Box>
  );
};

export default AnonymousUpload;