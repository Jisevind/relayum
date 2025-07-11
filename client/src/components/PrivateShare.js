import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { sharesAPI, downloadAPI } from '../services/api';
import { formatDateTime } from '../utils/dateUtils';
import { useAuth } from '../contexts/AuthContext';
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
  Chip,
} from '@mui/material';
import {
  FolderOpen,
  InsertDriveFile,
  Download,
  Home,
  Error as ErrorIcon,
  Person,
  Visibility,
} from '@mui/icons-material';

const PrivateShare = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [share, setShare] = useState(null);
  const [folderContents, setFolderContents] = useState(null);
  const [folderError, setFolderError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    loadShare();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user]);

  const loadShare = useCallback(async () => {
    try {
      const response = await sharesAPI.getPrivateShare(token);
      setShare(response.data.share);
      
      // If it's a folder, load the contents
      if (response.data.share.folder_id) {
        try {
          const contentsResponse = await sharesAPI.getSharedFolderContents(response.data.share.id);
          setFolderContents(contentsResponse.data);
        } catch (contentsError) {
          console.error('Failed to load folder contents:', contentsError);
          setFolderError('Failed to load folder contents');
        }
      }
    } catch (error) {
      setError(error.response?.data?.error || 'Share not found or access denied');
    } finally {
      setLoading(false);
    }
  }, [token]);

  const handleDownload = () => {
    if (share.file_id) {
      downloadAPI.downloadFile(share.file_id);
    } else if (share.folder_id) {
      downloadAPI.downloadFolder(share.folder_id);
    }
  };

  const handleFileDownload = (fileId) => {
    downloadAPI.downloadFile(fileId);
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const goToDashboard = () => {
    navigate('/dashboard');
  };

  if (!user) {
    return null; // Will redirect to login
  }

  if (loading) {
    return (
      <Box 
        sx={{ 
          minHeight: '100vh', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          bgcolor: 'background.default'
        }}
      >
        <Stack direction="row" alignItems="center" spacing={2}>
          <CircularProgress />
          <Typography variant="body1">Loading private share...</Typography>
        </Stack>
      </Box>
    );
  }

  if (error) {
    return (
      <Box 
        sx={{ 
          minHeight: '100vh', 
          bgcolor: 'background.default',
          py: 4
        }}
      >
        <Container maxWidth="md">
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
            <Typography variant="h4" component="h1">
              Private Share
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Button
                startIcon={<Home />}
                onClick={goToDashboard}
                variant="outlined"
              >
                Dashboard
              </Button>
              <ThemeToggle />
            </Box>
          </Stack>
          
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <ErrorIcon color="error" sx={{ mr: 2 }} />
                <Typography variant="h6">Share Not Found</Typography>
              </Box>
              <Alert severity="error">
                {error}
              </Alert>
            </CardContent>
          </Card>
        </Container>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', py: 4 }}>
      <Container maxWidth="md">
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
          <Typography variant="h4" component="h1">
            Private Share
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Button
              startIcon={<Home />}
              onClick={goToDashboard}
              variant="outlined"
            >
              Dashboard
            </Button>
            <ThemeToggle />
          </Box>
        </Stack>

        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Avatar sx={{ bgcolor: 'primary.main', mr: 2, width: 56, height: 56 }}>
                  {share.folder_id ? <FolderOpen /> : <InsertDriveFile />}
                </Avatar>
                <Box>
                  <Typography variant="h5" component="h2" gutterBottom>
                    {share.folder_name || share.filename}
                  </Typography>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                    <Chip
                      icon={<Person />}
                      label={`Shared by ${share.shared_by_username}`}
                      variant="outlined"
                      size="small"
                    />
                    <Chip
                      icon={<Visibility />}
                      label="Private Share"
                      color="primary"
                      variant="outlined"
                      size="small"
                    />
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    Shared on {formatDateTime(share.created_at)}
                  </Typography>
                  {share.expires_at && (
                    <Typography variant="body2" color="text.secondary">
                      Expires on {formatDateTime(share.expires_at)}
                    </Typography>
                  )}
                </Box>
              </Box>
            </Box>

            {share.folder_id && folderContents && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="h6" gutterBottom>
                  Folder Contents ({folderContents.files?.length || 0} files)
                </Typography>
                {folderError && (
                  <Alert severity="warning" sx={{ mb: 2 }}>
                    {folderError}
                  </Alert>
                )}
                {folderContents.files && folderContents.files.length > 0 ? (
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
                          primary={file.filename}
                          secondary={
                            <Stack direction="row" spacing={1} alignItems="center">
                              <Typography variant="caption">
                                {formatFileSize(file.size)}
                              </Typography>
                              <Typography variant="caption">•</Typography>
                              <Typography variant="caption">
                                {formatDateTime(file.created_at)}
                              </Typography>
                              {file.folder_path && (
                                <>
                                  <Typography variant="caption">•</Typography>
                                  <Typography variant="caption">
                                    {file.folder_path}
                                  </Typography>
                                </>
                              )}
                            </Stack>
                          }
                        />
                        <ListItemSecondaryAction>
                          <IconButton
                            edge="end"
                            aria-label="download"
                            onClick={() => handleFileDownload(file.id)}
                            color="primary"
                          >
                            <Download />
                          </IconButton>
                        </ListItemSecondaryAction>
                      </ListItem>
                    ))}
                  </List>
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                    This folder appears to be empty.
                  </Typography>
                )}
              </>
            )}
          </CardContent>

          <CardActions>
            <Button
              startIcon={<Download />}
              onClick={handleDownload}
              variant="contained"
              color="primary"
            >
              Download {share.folder_id ? 'Folder' : 'File'}
            </Button>
          </CardActions>
        </Card>
      </Container>
    </Box>
  );
};

export default PrivateShare;