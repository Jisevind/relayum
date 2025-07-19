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
} from '@mui/icons-material';

const SharesList = ({ type }) => {
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [unviewedCount, setUnviewedCount] = useState(0);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [shareToDelete, setShareToDelete] = useState(null);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [selectedShare, setSelectedShare] = useState(null);
  const [showFolderBrowser, setShowFolderBrowser] = useState(false);

  useEffect(() => {
    loadShares();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  const loadShares = useCallback(async () => {
    setLoading(true);
    setError('');
    
    try {
      let response;
      switch (type) {
        case 'sent':
          response = await sharesAPI.getSentShares();
          break;
        case 'received':
          response = await sharesAPI.getReceivedShares();
          break;
        case 'all':
          response = await sharesAPI.getAllShares();
          break;
        default:
          throw new Error('Invalid share type');
      }
      
      setShares(response.data.shares || []);
      if (type === 'received' && response.data.unviewedCount !== undefined) {
        setUnviewedCount(response.data.unviewedCount);
      }
    } catch (error) {
      setError('Failed to load shares');
    } finally {
      setLoading(false);
    }
  }, [type]);

  const handleDeleteClick = (share) => {
    setShareToDelete(share);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!shareToDelete) return;

    try {
      if (type === 'received') {
        await sharesAPI.deleteReceivedShare(shareToDelete.id);
        setSnackbarMessage('Share removed from your list successfully');
      } else {
        await sharesAPI.deleteShare(shareToDelete.id);
        setSnackbarMessage('Share deleted successfully');
      }
      setShares(shares.filter(share => share.id !== shareToDelete.id));
      setSnackbarOpen(true);
    } catch (error) {
      setError(type === 'received' ? 'Failed to remove share' : 'Failed to delete share');
    } finally {
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
      if (share.file_id) {
        await downloadAPI.downloadFile(share.file_id);
      } else if (share.folder_id) {
        await downloadAPI.downloadFolder(share.folder_id);
      }
    } catch (error) {
      setError('Failed to download');
    }
  };

  const copyPublicLink = async (token) => {
    const url = `${window.location.origin}/public/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setSnackbarMessage('Public link copied to clipboard!');
      setSnackbarOpen(true);
    } catch (error) {
      setError('Failed to copy link to clipboard');
    }
  };

  const copyPrivateLink = async (token) => {
    const url = `${window.location.origin}/private/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setSnackbarMessage('Private share link copied to clipboard!');
      setSnackbarOpen(true);
    } catch (error) {
      setError('Failed to copy link to clipboard');
    }
  };

  const handleFolderShareClick = (share) => {
    setSelectedShare(share);
    setShowFolderBrowser(true);
  };

  const handleBackToShares = () => {
    setShowFolderBrowser(false);
    setSelectedShare(null);
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };


  const isExpired = (expiresAt) => {
    return expiresAt && new Date(expiresAt) < new Date();
  };

  const getTitle = () => {
    switch (type) {
      case 'sent':
        return 'Items You\'ve Shared';
      case 'received':
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            Items Shared With You
            {unviewedCount > 0 && (
              <Badge 
                badgeContent={unviewedCount} 
                color="error"
                sx={{ ml: 1 }}
              >
                <Box />
              </Badge>
            )}
          </Box>
        );
      case 'all':
        return 'All System Shares';
      default:
        return 'Shares';
    }
  };

  const getShareDisplayName = (share) => {
    if (!share) return 'Unknown Item';
    
    // Check if the file/folder still exists
    if (share.file_id && !share.filename) return 'File Not Found';
    if (share.folder_id && !share.folder_name) return 'Folder Not Found';
    
    return share.filename || share.folder_name || 'Unknown Item';
  };

  const isItemMissing = (share) => {
    if (!share) return true;
    return (share.file_id && !share.filename) || (share.folder_id && !share.folder_name);
  };

  const getShareIcon = (share) => {
    if (!share) return <InsertDriveFile />;
    if (share.folder_id) {
      return <FolderOpen />;
    } else {
      return <InsertDriveFile />;
    }
  };

  const getShareIconColor = (share) => {
    if (!share) return '#625B71';
    if (share.folder_id) {
      return '#6750A4';
    } else {
      return '#625B71';
    }
  };

  const getShareSize = (share) => {
    if (!share) return 'Unknown';
    return share.size ? formatFileSize(share.size) : 'Folder';
  };

  if (loading) {
    return (
      <Card>
        <CardContent>
          <Box display="flex" justifyContent="center" alignItems="center" py={4}>
            <CircularProgress />
            <Typography variant="body1" sx={{ ml: 2 }}>
              Loading shares...
            </Typography>
          </Box>
        </CardContent>
      </Card>
    );
  }

  // If showing folder browser, render that instead
  if (showFolderBrowser && selectedShare) {
    return (
      <SharedFolderBrowser
        shareId={selectedShare.id}
        shareName={getShareDisplayName(selectedShare)}
        onBack={handleBackToShares}
      />
    );
  }

  return (
    <>
      <Card>
        <CardContent>
          <Box sx={{ mb: 2 }}>
            <Typography variant="h6" component="h2" gutterBottom>
              {getTitle()}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {shares.length} share(s) found
            </Typography>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {shares.length === 0 ? (
            <Box 
              sx={{ 
                textAlign: 'center', 
                py: 6,
                color: 'text.secondary' 
              }}
            >
              <Share sx={{ fontSize: 64, mb: 2, opacity: 0.5 }} />
              <Typography variant="body1">
                No shares found.
              </Typography>
            </Box>
          ) : (
            <List disablePadding>
              {shares.filter(share => share && share.id).map((share, index) => (
                <ListItem
                  key={share.id}
                  divider={index < shares.length - 1}
                  sx={{
                    px: 0,
                    cursor: share.folder_id && !isItemMissing(share) ? 'pointer' : 'default',
                    opacity: isItemMissing(share) ? 0.6 : 1,
                    '&:hover': {
                      backgroundColor: 'action.hover',
                    },
                  }}
                  onClick={() => {
                    if (share.folder_id && !isItemMissing(share)) {
                      handleFolderShareClick(share);
                    }
                  }}
                >
                  <ListItemAvatar>
                    <Avatar
                      sx={{
                        bgcolor: getShareIconColor(share),
                        width: 48,
                        height: 48,
                      }}
                    >
                      {getShareIcon(share)}
                    </Avatar>
                  </ListItemAvatar>
                  
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Typography variant="subtitle1" noWrap sx={{ flexGrow: 1, minWidth: 0 }}>
                          {getShareDisplayName(share)}
                        </Typography>
                        {type === 'received' && !share.is_viewed && (
                          <Chip
                            label="NEW"
                            size="small"
                            color="primary"
                            variant="filled"
                            sx={{ ml: 1, fontSize: '0.7rem', height: 20 }}
                          />
                        )}
                        {isExpired(share.expires_at) && (
                          <Chip
                            icon={<Warning />}
                            label="Expired"
                            size="small"
                            color="error"
                            variant="outlined"
                          />
                        )}
                        {isItemMissing(share) && (
                          <Chip
                            icon={<ErrorOutline />}
                            label="Missing"
                            size="small"
                            color="error"
                            variant="filled"
                          />
                        )}
                      </Box>
                    }
                    secondary={
                      <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Typography variant="caption" color="text.secondary">
                            {getShareSize(share)}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            •
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {formatDateTime(share.created_at)}
                          </Typography>
                          {share.file_id && share.download_count !== undefined && (
                            <>
                              <Typography variant="caption" color="text.secondary">
                                •
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                <Download sx={{ fontSize: 12, mr: 0.5, verticalAlign: 'middle' }} />
                                {share.download_count} download{share.download_count !== 1 ? 's' : ''}
                              </Typography>
                            </>
                          )}
                          {share.expires_at && (
                            <>
                              <Typography variant="caption" color="text.secondary">
                                •
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                <AccessTime sx={{ fontSize: 12, mr: 0.5, verticalAlign: 'middle' }} />
                                Expires: {formatDateTime(share.expires_at)}
                              </Typography>
                            </>
                          )}
                        </Stack>
                        
                        <Box>
                          {type === 'sent' && share.shared_with_username && (
                            <Typography variant="body2" color="primary.main" sx={{ fontWeight: 'medium' }}>
                              <Person sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'middle' }} />
                              Shared with: {share.shared_with_username}
                            </Typography>
                          )}
                          {type === 'sent' && share.public_token && !share.shared_with_username && (
                            <Typography variant="body2" color="success.main" sx={{ fontWeight: 'medium' }}>
                              <Public sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'middle' }} />
                              Public share
                            </Typography>
                          )}
                          {type === 'received' && share.shared_by_username && (
                            <Typography variant="body2" color="primary.main" sx={{ fontWeight: 'medium' }}>
                              <Person sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'middle' }} />
                              Shared by: {share.shared_by_username}
                            </Typography>
                          )}
                          {type === 'all' && (
                            <Typography variant="body2" color="primary.main" sx={{ fontWeight: 'medium' }}>
                              <Person sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'middle' }} />
                              {share.shared_by_username} → {share.shared_with_username || 'Public'}
                            </Typography>
                          )}
                        </Box>
                      </Stack>
                    }
                  />
                  
                  <ListItemSecondaryAction>
                    <Stack direction="row" spacing={1} alignItems="center">
                      {!isExpired(share.expires_at) && !isItemMissing(share) && (
                        <IconButton
                          edge="end"
                          aria-label="download"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(share);
                          }}
                          size="small"
                          color="primary"
                        >
                          <Download />
                        </IconButton>
                      )}
                      {share.public_token && (
                        <IconButton
                          edge="end"
                          aria-label="copy public link"
                          onClick={(e) => {
                            e.stopPropagation();
                            copyPublicLink(share.public_token);
                          }}
                          size="small"
                          color="success"
                        >
                          <LinkIcon />
                        </IconButton>
                      )}
                      {share.private_token && (
                        <IconButton
                          edge="end"
                          aria-label="copy private link"
                          onClick={(e) => {
                            e.stopPropagation();
                            copyPrivateLink(share.private_token);
                          }}
                          size="small"
                          sx={{ color: 'primary.main' }}
                        >
                          <LinkIcon />
                        </IconButton>
                      )}
                      {(type === 'sent' || type === 'received') && (
                        <IconButton
                          edge="end"
                          aria-label={type === 'received' ? 'remove' : 'delete'}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteClick(share);
                          }}
                          size="small"
                          color="error"
                        >
                          <Delete />
                        </IconButton>
                      )}
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
          {type === 'received' ? 'Remove Share' : 'Delete Share'}
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="delete-dialog-description">
            {type === 'received' 
              ? `Are you sure you want to remove "${shareToDelete ? getShareDisplayName(shareToDelete) : 'this item'}" from your received shares list? This will not affect the original share.`
              : `Are you sure you want to delete the share for "${shareToDelete ? getShareDisplayName(shareToDelete) : 'this item'}"? This action cannot be undone.`
            }
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel} color="primary">
            Cancel
          </Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            {type === 'received' ? 'Remove' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Success Snackbar */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={() => setSnackbarOpen(false)}
        message={snackbarMessage}
      />
    </>
  );
};

export default SharesList;