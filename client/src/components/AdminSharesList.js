import React, { useState, useEffect, useCallback } from 'react';
import { sharesAPI, downloadAPI } from '../services/api';
import SharedFolderBrowser from './SharedFolderBrowser';
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
  Chip,
  Alert,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  Snackbar,
  Badge,
} from '@mui/material';
import {
  InsertDriveFile,
  Download,
  Delete,
  FolderOpen,
  Share,
  Link as LinkIcon,
  Public,
  Person,
  AccessTime,
  Warning,
  ErrorOutline,
  People,
} from '@mui/icons-material';

const AdminSharesList = () => {
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [shareToDelete, setShareToDelete] = useState(null);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [selectedShare, setSelectedShare] = useState(null);
  const [showFolderBrowser, setShowFolderBrowser] = useState(false);

  useEffect(() => {
    loadShares();
  }, []);

  const loadShares = useCallback(async () => {
    setLoading(true);
    setError('');
    
    try {
      const response = await sharesAPI.getAllShares();
      setShares(response.data.shares || []);
    } catch (error) {
      setError('Failed to load shares');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDeleteClick = (share) => {
    setShareToDelete(share);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!shareToDelete) return;

    try {
      await sharesAPI.deleteShare(shareToDelete.id);
      setSnackbarMessage('Share deleted successfully');
      setSnackbarOpen(true);
      setDeleteDialogOpen(false);
      setShareToDelete(null);
      loadShares();
    } catch (error) {
      setError('Failed to delete share');
      setDeleteDialogOpen(false);
      setShareToDelete(null);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setShareToDelete(null);
  };

  const handleDownload = async (share) => {
    try {
      const response = share.file_id
        ? await downloadAPI.downloadFile(share.file_id)
        : await downloadAPI.downloadFolder(share.folder_id);
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = share.filename || share.folder_name || 'download';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setError('Failed to download file');
    }
  };

  const handleFolderClick = (share) => {
    setSelectedShare(share);
    setShowFolderBrowser(true);
  };

  const handleCloseFolderBrowser = () => {
    setShowFolderBrowser(false);
    setSelectedShare(null);
  };

  const getShareTypeIcon = (share) => {
    if (share.folder_id) {
      return <FolderOpen />;
    }
    return <InsertDriveFile />;
  };

  const getShareInfo = (share) => {
    const sharedBy = share.shared_by_username || 'Unknown';
    const sharedWith = share.shared_with_username || 'Public';
    const isPublic = !share.shared_with_username;
    
    return (
      <Box>
        <Typography variant="body2" color="text.secondary">
          Shared by: {sharedBy}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Shared with: {isPublic ? 'Public' : sharedWith}
        </Typography>
      </Box>
    );
  };

  const getShareIcon = (share) => {
    if (share.public_token) {
      return <Public color="success" />;
    } else if (share.private_token) {
      return <Person color="info" />;
    }
    return <Share color="action" />;
  };

  const copyShareLink = (share) => {
    const baseUrl = window.location.origin;
    const shareUrl = share.public_token
      ? `${baseUrl}/public/${share.public_token}`
      : `${baseUrl}/private/${share.private_token}`;
    
    navigator.clipboard.writeText(shareUrl);
    setSnackbarMessage('Share link copied to clipboard');
    setSnackbarOpen(true);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        {error}
      </Alert>
    );
  }

  return (
    <Box>
      <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <People color="primary" />
        All Shares
      </Typography>
      
      {shares.length === 0 ? (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 4 }}>
            <Share sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              No shares found
            </Typography>
            <Typography variant="body2" color="text.secondary">
              No shares have been created yet in the system.
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent>
            <List>
              {shares.map((share) => (
                <ListItem key={share.id} divider>
                  <ListItemAvatar>
                    <Avatar sx={{ bgcolor: 'primary.main' }}>
                      {getShareTypeIcon(share)}
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body1" component="span">
                          {share.filename || share.folder_name}
                        </Typography>
                        {share.expires_at && (
                          <Chip
                            icon={<AccessTime />}
                            label={`Expires ${formatDateTime(share.expires_at)}`}
                            size="small"
                            color="warning"
                            variant="outlined"
                          />
                        )}
                      </Box>
                    }
                    secondary={
                      <Box sx={{ mt: 1 }}>
                        {getShareInfo(share)}
                        <Typography variant="caption" color="text.secondary">
                          Created: {formatDateTime(share.created_at)}
                        </Typography>
                      </Box>
                    }
                  />
                  <ListItemSecondaryAction>
                    <Stack direction="row" spacing={1}>
                      <IconButton
                        size="small"
                        onClick={() => copyShareLink(share)}
                        title="Copy share link"
                      >
                        {getShareIcon(share)}
                      </IconButton>
                      
                      {share.file_id && (
                        <IconButton
                          size="small"
                          onClick={() => handleDownload(share)}
                          title="Download file"
                        >
                          <Download />
                        </IconButton>
                      )}
                      
                      {share.folder_id && (
                        <IconButton
                          size="small"
                          onClick={() => handleFolderClick(share)}
                          title="Browse folder"
                        >
                          <FolderOpen />
                        </IconButton>
                      )}
                      
                      <IconButton
                        size="small"
                        onClick={() => handleDeleteClick(share)}
                        title="Delete share"
                        color="error"
                      >
                        <Delete />
                      </IconButton>
                    </Stack>
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </List>
          </CardContent>
        </Card>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={handleDeleteCancel}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Warning color="error" />
          Delete Share
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete this share? This action cannot be undone.
            {shareToDelete && (
              <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
                <Typography variant="body2" fontWeight="medium">
                  {shareToDelete.filename || shareToDelete.folder_name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Shared by: {shareToDelete.shared_by_username || 'Unknown'}
                </Typography>
              </Box>
            )}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel}>Cancel</Button>
          <Button onClick={handleDeleteConfirm} variant="contained" color="error">
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Folder Browser Dialog */}
      {showFolderBrowser && selectedShare && (
        <Dialog
          open={showFolderBrowser}
          onClose={handleCloseFolderBrowser}
          maxWidth="md"
          fullWidth
        >
          <DialogTitle>
            Browse Shared Folder: {selectedShare.folder_name}
          </DialogTitle>
          <DialogContent>
            <SharedFolderBrowser
              shareId={selectedShare.id}
              folderId={selectedShare.folder_id}
              isPublic={!!selectedShare.public_token}
              token={selectedShare.public_token || selectedShare.private_token}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseFolderBrowser}>Close</Button>
          </DialogActions>
        </Dialog>
      )}

      {/* Success Snackbar */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={6000}
        onClose={() => setSnackbarOpen(false)}
        message={snackbarMessage}
      />
    </Box>
  );
};

export default AdminSharesList;