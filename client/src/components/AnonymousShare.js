import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box,
  Container,
  Paper,
  Typography,
  Button,
  TextField,
  Alert,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Card,
  CardContent,
  CircularProgress,
  InputAdornment,
  Chip,
  Stack,
  AppBar,
  Toolbar,
} from '@mui/material';
import {
  InsertDriveFile,
  Download,
  Lock,
  Visibility,
  VisibilityOff,
  Public,
  Schedule,
} from '@mui/icons-material';
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL;

const AnonymousShare = () => {
  const { token } = useParams();
  const [shareData, setShareData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [downloading, setDownloading] = useState({});

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  const getDaysUntilExpiration = (expiresAt) => {
    const now = new Date();
    const expiry = new Date(expiresAt);
    const diffTime = expiry - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const loadShareData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const requestData = { password: password || undefined };
      
      const response = await axios.post(
        `${API_BASE_URL}/anonymous/access/${token}`, 
        requestData
      );

      setShareData(response.data);
      setPasswordRequired(false);
    } catch (err) {
      if (err.response?.status === 401) {
        setPasswordRequired(true);
        setError('This share is password protected');
      } else if (err.response?.status === 404) {
        setError('Share not found or has expired');
      } else if (err.response?.status === 410) {
        setError('This share has expired or reached its access limit');
      } else {
        setError(err.response?.data?.error || 'Failed to load share');
      }
    } finally {
      setLoading(false);
    }
  }, [token, password]);

  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    if (password.trim()) {
      loadShareData();
    }
  };

  const handleDownload = async (fileId, filename) => {
    try {
      setDownloading(prev => ({ ...prev, [fileId]: true }));

      const requestData = { password: password || undefined };
      
      const response = await axios.post(
        `${API_BASE_URL}/anonymous/download/${token}/${fileId}`,
        requestData,
        {
          responseType: 'blob'
        }
      );

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

    } catch (err) {
      setError(err.response?.data?.error || 'Failed to download file');
    } finally {
      setDownloading(prev => ({ ...prev, [fileId]: false }));
    }
  };

  const handleDownloadAll = async () => {
    try {
      setDownloading(prev => ({ ...prev, 'all': true }));

      const requestData = { password: password || undefined };
      
      const response = await axios.post(
        `${API_BASE_URL}/anonymous/download/${token}`,
        requestData,
        {
          responseType: 'blob'
        }
      );

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `anonymous-share-${token.slice(0, 8)}.zip`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

    } catch (err) {
      setError(err.response?.data?.error || 'Failed to download files');
    } finally {
      setDownloading(prev => ({ ...prev, 'all': false }));
    }
  };

  useEffect(() => {
    loadShareData();
  }, [token, loadShareData]);

  if (loading) {
    return (
      <Box sx={{ minHeight: '100vh', backgroundColor: 'background.default' }}>
        <AppBar position="static" elevation={0}>
          <Toolbar>
            <Typography variant="h6">
              Anonymous Share
            </Typography>
          </Toolbar>
        </AppBar>
        <Container maxWidth="md" sx={{ py: 4 }}>
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
            <CircularProgress />
          </Box>
        </Container>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', backgroundColor: 'background.default' }}>
      <AppBar position="static" elevation={0}>
        <Toolbar>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Public />
            <Typography variant="h6">
              Anonymous Share
            </Typography>
          </Box>
        </Toolbar>
      </AppBar>

      <Container maxWidth="md" sx={{ py: 4 }}>
        {error && !shareData && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        {passwordRequired && !shareData && (
          <Paper sx={{ p: 4, textAlign: 'center' }}>
            <Lock sx={{ fontSize: 64, color: 'warning.main', mb: 2 }} />
            <Typography variant="h5" gutterBottom>
              Password Protected Share
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
              This share is protected with a password. Enter the password to access the files.
            </Typography>
            
            <Box component="form" onSubmit={handlePasswordSubmit} sx={{ maxWidth: 400, mx: 'auto' }}>
              <TextField
                fullWidth
                type={showPassword ? 'text' : 'password'}
                label="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter share password"
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
                sx={{ mb: 3 }}
              />
              <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={!password.trim()}
                fullWidth
              >
                Access Share
              </Button>
            </Box>
          </Paper>
        )}

        {shareData && (
          <Box>
            {/* Share Info */}
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                  <Public color="success" />
                  <Typography variant="h5">
                    Anonymous File Share
                  </Typography>
                </Box>
                
                <Stack direction="row" spacing={2} flexWrap="wrap">
                  <Chip
                    icon={<Schedule />}
                    label={`Expires: ${formatDate(shareData.expires_at)}`}
                    color={getDaysUntilExpiration(shareData.expires_at) <= 1 ? 'error' : 'default'}
                    variant="outlined"
                  />
                  <Chip
                    icon={<Download />}
                    label={`${shareData.access_count} access${shareData.access_count !== 1 ? 'es' : ''}`}
                    variant="outlined"
                  />
                  {shareData.password_protected && (
                    <Chip
                      icon={<Lock />}
                      label="Password Protected"
                      color="warning"
                      variant="outlined"
                    />
                  )}
                </Stack>

                {getDaysUntilExpiration(shareData.expires_at) <= 1 && (
                  <Alert severity="warning" sx={{ mt: 2 }}>
                    <Typography variant="body2">
                      This share will expire soon! Download the files before it expires.
                    </Typography>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {/* Files List */}
            <Paper sx={{ mb: 3 }}>
              <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="h6">
                    Files ({shareData.files.length})
                  </Typography>
                  {shareData.files.length > 1 && (
                    <Button
                      variant="contained"
                      startIcon={<Download />}
                      onClick={handleDownloadAll}
                      disabled={downloading['all']}
                    >
                      {downloading['all'] ? 'Downloading...' : 'Download All'}
                    </Button>
                  )}
                </Box>
              </Box>

              <List>
                {shareData.files.map((file, index) => (
                  <ListItem key={file.id} divider={index < shareData.files.length - 1}>
                    <ListItemIcon>
                      <InsertDriveFile color="primary" />
                    </ListItemIcon>
                    <ListItemText
                      primary={file.filename}
                      secondary={formatFileSize(file.size)}
                    />
                    <ListItemSecondaryAction>
                      <IconButton
                        edge="end"
                        onClick={() => handleDownload(file.id, file.filename)}
                        disabled={downloading[file.id]}
                        color="primary"
                      >
                        {downloading[file.id] ? (
                          <CircularProgress size={24} />
                        ) : (
                          <Download />
                        )}
                      </IconButton>
                    </ListItemSecondaryAction>
                  </ListItem>
                ))}
              </List>
            </Paper>

            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            {/* Info */}
            <Paper sx={{ p: 2, bgcolor: 'background.default' }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                <strong>About anonymous shares:</strong>
              </Typography>
              <Typography variant="caption" color="text.secondary" component="div">
                • Files are securely encrypted and stored temporarily<br/>
                • This share will automatically expire after the specified time<br/>
                • No account is required to download these files<br/>
                • Once expired, files cannot be recovered
              </Typography>
            </Paper>
          </Box>
        )}
      </Container>
    </Box>
  );
};

export default AnonymousShare;