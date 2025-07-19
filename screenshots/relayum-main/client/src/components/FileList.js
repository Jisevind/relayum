import React, { useState, useEffect, useCallback } from 'react';
import { filesAPI, downloadAPI } from '../services/api';
import { formatDateTime } from '../utils/dateUtils';
import {
  Box,
  Card,
  CardContent,
  Typography,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  ListItemSecondaryAction,
  Avatar,
  IconButton,
  Button,
  Alert,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
} from '@mui/material';
import {
  InsertDriveFile,
  Download,
  Share,
  Delete,
  Image,
  VideoFile,
  AudioFile,
  Archive,
  Description,
} from '@mui/icons-material';

const FileList = ({ currentFolderId, onRefresh, onShare }) => {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState(null);

  useEffect(() => {
    loadFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFolderId]);

  const loadFiles = useCallback(async () => {
    try {
      setLoading(true);
      const response = await filesAPI.getFiles(currentFolderId);
      setFiles(response.data.files);
    } catch (error) {
      setError('Failed to load files');
    } finally {
      setLoading(false);
    }
  }, [currentFolderId]);

  const handleDeleteClick = (file) => {
    setFileToDelete(file);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!fileToDelete) return;

    try {
      await filesAPI.deleteFile(fileToDelete.id);
      setFiles(files.filter(file => file.id !== fileToDelete.id));
      if (onRefresh) onRefresh();
    } catch (error) {
      setError('Failed to delete file');
    } finally {
      setDeleteDialogOpen(false);
      setFileToDelete(null);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setFileToDelete(null);
  };

  const handleShare = (file) => {
    if (onShare) {
      onShare(file);
    }
  };

  const handleDownload = async (fileId, filename) => {
    try {
      await downloadAPI.downloadFile(fileId);
    } catch (error) {
      setError('Failed to download file');
    }
  };

  const getFileIcon = (mimeType) => {
    if (mimeType.startsWith('image/')) return <Image />;
    if (mimeType.startsWith('video/')) return <VideoFile />;
    if (mimeType.startsWith('audio/')) return <AudioFile />;
    if (mimeType.includes('zip') || mimeType.includes('archive')) return <Archive />;
    if (mimeType.includes('pdf') || mimeType.includes('document')) return <Description />;
    return <InsertDriveFile />;
  };

  const getFileTypeColor = (mimeType) => {
    if (mimeType.startsWith('image/')) return '#4CAF50';
    if (mimeType.startsWith('video/')) return '#FF9800';
    if (mimeType.startsWith('audio/')) return '#9C27B0';
    if (mimeType.includes('zip') || mimeType.includes('archive')) return '#607D8B';
    if (mimeType.includes('pdf')) return '#F44336';
    return '#6750A4';
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
      <Card>
        <CardContent>
          <Box display="flex" justifyContent="center" alignItems="center" py={4}>
            <CircularProgress />
            <Typography variant="body1" sx={{ ml: 2 }}>
              Loading files...
            </Typography>
          </Box>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardContent>
          <Box sx={{ mb: 2 }}>
            <Typography variant="h6" component="h2" gutterBottom>
              Your Files
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Files you have uploaded ({files.length} total)
            </Typography>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {files.length === 0 ? (
            <Box 
              sx={{ 
                textAlign: 'center', 
                py: 6,
                color: 'text.secondary' 
              }}
            >
              <InsertDriveFile sx={{ fontSize: 64, mb: 2, opacity: 0.5 }} />
              <Typography variant="body1">
                No files uploaded yet. Upload some files to get started!
              </Typography>
            </Box>
          ) : (
            <List disablePadding>
              {files.map((file, index) => (
                <ListItem
                  key={file.id}
                  divider={index < files.length - 1}
                  sx={{
                    px: 0,
                    '&:hover': {
                      backgroundColor: 'action.hover',
                    },
                  }}
                >
                  <ListItemAvatar>
                    <Avatar
                      sx={{
                        bgcolor: getFileTypeColor(file.mime_type),
                        width: 48,
                        height: 48,
                      }}
                    >
                      {getFileIcon(file.mime_type)}
                    </Avatar>
                  </ListItemAvatar>
                  
                  <ListItemText
                    primary={
                      <Typography variant="subtitle1" noWrap>
                        {file.filename}
                      </Typography>
                    }
                    secondary={
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
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
                    <Stack direction="row" spacing={1}>
                      <IconButton
                        edge="end"
                        aria-label="download"
                        onClick={() => handleDownload(file.id, file.filename)}
                        size="small"
                        color="primary"
                      >
                        <Download />
                      </IconButton>
                      <IconButton
                        edge="end"
                        aria-label="share"
                        onClick={() => handleShare(file)}
                        size="small"
                        color="success"
                      >
                        <Share />
                      </IconButton>
                      <IconButton
                        edge="end"
                        aria-label="delete"
                        onClick={() => handleDeleteClick(file)}
                        size="small"
                        color="error"
                      >
                        <Delete />
                      </IconButton>
                    </Stack>
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </List>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={handleDeleteCancel}
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-description"
      >
        <DialogTitle id="delete-dialog-title">
          Delete File
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="delete-dialog-description">
            Are you sure you want to delete "{fileToDelete?.filename}"? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel} color="primary">
            Cancel
          </Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default FileList;