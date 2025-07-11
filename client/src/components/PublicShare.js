import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { sharesAPI } from '../services/api';
import { formatDateTime } from '../utils/dateUtils';
import ThemeToggle from './ThemeToggle';
import {
  Box,
  Container,
  Card,
  CardContent,
  CardActions,
  Typography,
  Button,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  ListItemSecondaryAction,
  Avatar,
  IconButton,
  Divider,
  Alert,
  CircularProgress,
  Stack,
  TextField,
  InputAdornment,
} from '@mui/material';
import {
  FolderOpen,
  InsertDriveFile,
  Download,
  Home,
  Error as ErrorIcon,
  Lock,
  Visibility,
  VisibilityOff,
} from '@mui/icons-material';

const PublicShare = () => {
  const { token } = useParams();
  const [share, setShare] = useState(null);
  const [folderContents, setFolderContents] = useState(null);
  const [folderError, setFolderError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [shareInfo, setShareInfo] = useState(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [passwordVerified, setPasswordVerified] = useState(false);

  useEffect(() => {
    checkShareInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Load share when password is verified
  useEffect(() => {
    if (passwordVerified && shareInfo) {
      setLoading(true);
      loadShare();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passwordVerified, shareInfo]);

  const checkShareInfo = async () => {
    try {
      const API_BASE_URL = process.env.REACT_APP_API_URL;
      const response = await fetch(`${API_BASE_URL}/download/public/${token}/check`);
      if (!response.ok) {
        throw new Error('Share not found or expired');
      }
      const data = await response.json();
      setShareInfo(data);
      
      // If no password is required, load the share immediately
      if (!data.requires_password) {
        setPasswordVerified(true);
        loadShare();
      } else {
        setLoading(false);
      }
    } catch (error) {
      setError(error.message || 'Failed to check share');
      setLoading(false);
    }
  };

  const verifyPassword = async () => {
    if (!password.trim()) {
      setError('Password is required');
      return;
    }

    setVerifying(true);
    setError('');

    try {
      const API_BASE_URL = process.env.REACT_APP_API_URL;
      const response = await fetch(`${API_BASE_URL}/download/public/${token}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          password: password.trim()
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Password verification failed');
      }
      
      setPasswordVerified(true);
    } catch (error) {
      setError(error.message || 'Password verification failed');
    } finally {
      setVerifying(false);
    }
  };

  const loadShare = useCallback(async () => {
    if (!passwordVerified && shareInfo?.requires_password) {
      return;
    }

    try {
      // Include password in the API call if required
      const response = shareInfo?.requires_password 
        ? await sharesAPI.getPublicShare(token, password)
        : await sharesAPI.getPublicShare(token);
      setShare(response.data.share);
      
      // If it's a folder, load the contents
      if (response.data.share.folder_id) {
        try {
          const contentsResponse = shareInfo?.requires_password 
            ? await sharesAPI.getPublicFolderContents(token, password)
            : await sharesAPI.getPublicFolderContents(token);
          setFolderContents(contentsResponse.data);
        } catch (contentsError) {
          console.error('Failed to load folder contents:', contentsError);
          setFolderError('Failed to load folder contents');
        }
      }
    } catch (error) {
      setError(error.response?.data?.error || 'Share not found or expired');
    } finally {
      setLoading(false);
    }
  }, [token, passwordVerified, shareInfo, password]);

  const handleDownload = () => {
    const API_BASE_URL = process.env.REACT_APP_API_URL;
    const link = document.createElement('a');
    const downloadUrl = shareInfo?.requires_password 
      ? `${API_BASE_URL}/download/public/${token}?password=${encodeURIComponent(password)}`
      : `${API_BASE_URL}/download/public/${token}`;
    link.href = downloadUrl;
    
    // For files, use original filename; for folders, use .zip extension
    if (share?.folder_id) {
      link.download = `${share.folder_name || 'download'}.zip`;
    } else {
      // Don't set download attribute for files - let the server's Content-Disposition header handle it
      // This ensures the correct filename and extension are used
    }
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileDownload = (fileId, filename) => {
    const API_BASE_URL = process.env.REACT_APP_API_URL;
    const link = document.createElement('a');
    const downloadUrl = shareInfo?.requires_password 
      ? `${API_BASE_URL}/download/public/${token}/file/${fileId}?password=${encodeURIComponent(password)}`
      : `${API_BASE_URL}/download/public/${token}/file/${fileId}`;
    link.href = downloadUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.click();
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };


  if (loading) {
    return (
      <Box 
        sx={{ 
          minHeight: '100vh', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          backgroundColor: 'background.default',
          position: 'relative'
        }}
      >
        <Box sx={{ position: 'absolute', top: 16, right: 16 }}>
          <ThemeToggle />
        </Box>
        <Box sx={{ textAlign: 'center' }}>
          <CircularProgress size={60} sx={{ mb: 3 }} />
          <Typography variant="h6" color="text.secondary">
            Loading shared file...
          </Typography>
        </Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box 
        sx={{ 
          minHeight: '100vh', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          backgroundColor: 'background.default',
          position: 'relative'
        }}
      >
        <Box sx={{ position: 'absolute', top: 16, right: 16 }}>
          <ThemeToggle />
        </Box>
        <Container maxWidth="sm">
          <Card sx={{ textAlign: 'center', p: 3 }}>
            <CardContent>
              <ErrorIcon sx={{ fontSize: 80, color: 'error.main', mb: 2 }} />
              <Typography variant="h5" component="h2" gutterBottom>
                Share Not Found
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                {error}
              </Typography>
            </CardContent>
            <CardActions sx={{ justifyContent: 'center' }}>
              <Button
                variant="contained"
                startIcon={<Home />}
                href="/"
                size="large"
              >
                Go to Homepage
              </Button>
            </CardActions>
          </Card>
        </Container>
      </Box>
    );
  }

  // Show password verification screen
  if (shareInfo?.requires_password && !passwordVerified) {
    return (
      <Box 
        sx={{ 
          minHeight: '100vh', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          backgroundColor: 'background.default',
          position: 'relative'
        }}
      >
        <Box sx={{ position: 'absolute', top: 16, right: 16 }}>
          <ThemeToggle />
        </Box>
        <Container maxWidth="sm">
          <Card sx={{ p: 3 }}>
            <CardContent>
              <Stack spacing={3} alignItems="center">
                <Box sx={{ textAlign: 'center' }}>
                  <Lock sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
                  <Typography variant="h5" gutterBottom>
                    Password Protected Share
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    This {shareInfo.type} is password protected. Please enter the password to access it.
                  </Typography>
                </Box>

                <form onSubmit={(e) => { e.preventDefault(); verifyPassword(); }} style={{ width: '100%' }}>
                  <Stack spacing={2}>
                    <TextField
                      label="Password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      fullWidth
                      variant="outlined"
                      placeholder="Enter share password"
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <Lock sx={{ color: 'text.secondary' }} />
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
                    />
                    
                    <Button
                      type="submit"
                      variant="contained"
                      fullWidth
                      disabled={!password.trim() || verifying}
                      startIcon={verifying ? <CircularProgress size={20} /> : <Lock />}
                      size="large"
                    >
                      {verifying ? 'Verifying...' : 'Verify Password'}
                    </Button>
                  </Stack>
                </form>

                {error && (
                  <Alert severity="error" sx={{ width: '100%' }}>
                    {error}
                  </Alert>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Container>
      </Box>
    );
  }

  // Don't render main content if share is not loaded yet
  if (!share) {
    return (
      <Box 
        sx={{ 
          minHeight: '100vh', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          backgroundColor: 'background.default',
          position: 'relative'
        }}
      >
        <Box sx={{ position: 'absolute', top: 16, right: 16 }}>
          <ThemeToggle />
        </Box>
        <Box sx={{ textAlign: 'center' }}>
          <CircularProgress size={60} sx={{ mb: 3 }} />
          <Typography variant="h6" color="text.secondary">
            Loading share...
          </Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Box 
      sx={{ 
        minHeight: '100vh', 
        backgroundColor: 'background.default',
        py: 6,
        position: 'relative'
      }}
    >
      <Box sx={{ position: 'absolute', top: 16, right: 16 }}>
        <ThemeToggle />
      </Box>
      <Container maxWidth="md">
        <Stack spacing={3}>
          {/* Main Share Card */}
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 6 }}>
              <Avatar
                sx={{
                  width: 80,
                  height: 80,
                  bgcolor: share?.folder_id ? 'primary.main' : 'secondary.main',
                  mx: 'auto',
                  mb: 3,
                }}
              >
                {share?.folder_id ? (
                  <FolderOpen sx={{ fontSize: 40 }} />
                ) : (
                  <InsertDriveFile sx={{ fontSize: 40 }} />
                )}
              </Avatar>
              
              <Typography variant="h4" component="h1" gutterBottom>
                Shared {share?.folder_id ? 'Folder' : 'File'}
              </Typography>
              
              <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
                Someone has shared {share?.folder_id ? 'a folder' : 'a file'} with you
              </Typography>
            </CardContent>

            <Divider />

            <CardContent>
              <Stack spacing={2}>
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">
                    {share?.folder_id ? 'Folder Name' : 'Filename'}
                  </Typography>
                  <Typography variant="body1" sx={{ fontWeight: 500 }}>
                    {share?.filename || share?.folder_name}
                  </Typography>
                </Box>

                {share?.size && (
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">
                      Size
                    </Typography>
                    <Typography variant="body1">
                      {formatFileSize(share.size)}
                    </Typography>
                  </Box>
                )}

                <Box>
                  <Typography variant="subtitle2" color="text.secondary">
                    Shared on
                  </Typography>
                  <Typography variant="body1">
                    {formatDateTime(share?.created_at)}
                  </Typography>
                </Box>

                {share?.expires_at && (
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">
                      Expires
                    </Typography>
                    <Typography variant="body1">
                      {formatDateTime(share?.expires_at)}
                    </Typography>
                  </Box>
                )}
              </Stack>
            </CardContent>

            <CardActions sx={{ p: 3 }}>
              <Button
                variant="contained"
                fullWidth
                size="large"
                startIcon={<Download />}
                onClick={handleDownload}
              >
                Download {share?.folder_id ? 'Folder (ZIP)' : 'File'}
              </Button>
            </CardActions>
          </Card>

          {/* Folder Contents */}
          {share?.folder_id && (
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                  <FolderOpen color="primary" />
                  <Typography variant="h6" component="h3">
                    Folder Contents
                  </Typography>
                </Box>
                
                {folderContents ? (
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {folderContents.files.length} file(s)
                  </Typography>
                ) : folderError ? (
                  <Alert severity="error" sx={{ mb: 2 }}>
                    {folderError}
                  </Alert>
                ) : (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <CircularProgress size={16} />
                    <Typography variant="body2" color="text.secondary">
                      Loading...
                    </Typography>
                  </Box>
                )}

                {folderContents && folderContents.files.length > 0 ? (
                  <List disablePadding>
                    {folderContents.files.map((file, index) => (
                      <ListItem
                        key={file.id}
                        divider={index < folderContents.files.length - 1}
                        sx={{ px: 0 }}
                      >
                        <ListItemAvatar>
                          <Avatar sx={{ bgcolor: 'secondary.main' }}>
                            <InsertDriveFile />
                          </Avatar>
                        </ListItemAvatar>
                        
                        <ListItemText
                          primary={
                            <Typography variant="body2" noWrap>
                              {file.folder_path ? `${file.folder_path}/${file.filename}` : file.filename}
                            </Typography>
                          }
                          secondary={
                            <Stack direction="row" spacing={1} alignItems="center">
                              <Typography variant="caption" color="text.secondary">
                                {formatFileSize(file.size)}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                •
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {formatDateTime(file.created_at)}
                              </Typography>
                            </Stack>
                          }
                        />
                        
                        <ListItemSecondaryAction>
                          <IconButton
                            edge="end"
                            aria-label="download"
                            onClick={() => handleFileDownload(file.id, file.filename)}
                            color="primary"
                          >
                            <Download />
                          </IconButton>
                        </ListItemSecondaryAction>
                      </ListItem>
                    ))}
                  </List>
                ) : folderContents && folderContents.files.length === 0 ? (
                  <Box sx={{ textAlign: 'center', py: 4 }}>
                    <Typography variant="body2" color="text.secondary">
                      This folder is empty
                    </Typography>
                  </Box>
                ) : !folderError ? (
                  <Box sx={{ textAlign: 'center', py: 4 }}>
                    <CircularProgress size={24} />
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                      Loading folder contents...
                    </Typography>
                  </Box>
                ) : null}
              </CardContent>
            </Card>
          )}

          <Box sx={{ textAlign: 'center', mt: 4 }}>
            <Typography variant="caption" color="text.secondary">
              Powered by Relayum
            </Typography>
          </Box>
        </Stack>
      </Container>
    </Box>
  );
};

export default PublicShare;