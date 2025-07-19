import React, { useState, useEffect, useCallback } from 'react';
import { foldersAPI } from '../services/api';
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
  TextField,
  Stack,
  Breadcrumbs,
  Link,
} from '@mui/material';
import {
  Folder,
  FolderOpen,
  Add,
  Share,
  Delete,
  ArrowBack,
  Home,
} from '@mui/icons-material';

const FolderManager = ({ currentFolderId, onFolderChange, onFileRefresh, onShare }) => {
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [breadcrumb, setBreadcrumb] = useState([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState(null);

  useEffect(() => {
    loadFolders();
    if (currentFolderId) {
      loadBreadcrumb();
    } else {
      setBreadcrumb([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFolderId]);

  const loadFolders = useCallback(async () => {
    setLoading(true);
    try {
      const response = await foldersAPI.getFolders(currentFolderId);
      setFolders(response.data.folders);
    } catch (error) {
      setError('Failed to load folders');
    } finally {
      setLoading(false);
    }
  }, [currentFolderId]);

  const loadBreadcrumb = useCallback(async () => {
    try {
      const response = await foldersAPI.getBreadcrumb(currentFolderId);
      setBreadcrumb(response.data.breadcrumb);
    } catch (error) {
      console.error('Failed to load breadcrumb:', error);
    }
  }, [currentFolderId]);

  const handleCreateFolder = async (e) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    try {
      await foldersAPI.createFolder({
        name: newFolderName.trim(),
        parent_id: currentFolderId
      });
      
      setNewFolderName('');
      setShowCreateFolder(false);
      loadFolders();
    } catch (error) {
      setError(error.response?.data?.error || 'Failed to create folder');
    }
  };

  const handleDeleteClick = (folder) => {
    setFolderToDelete(folder);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!folderToDelete) return;

    try {
      await foldersAPI.deleteFolder(folderToDelete.id);
      loadFolders();
      if (onFileRefresh) onFileRefresh();
    } catch (error) {
      setError('Failed to delete folder');
    } finally {
      setDeleteDialogOpen(false);
      setFolderToDelete(null);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setFolderToDelete(null);
  };

  const handleFolderClick = (folderId) => {
    if (onFolderChange) {
      onFolderChange(folderId);
    }
  };

  const handleBreadcrumbClick = (folderId) => {
    if (onFolderChange) {
      onFolderChange(folderId);
    }
  };

  const handleBackClick = () => {
    if (breadcrumb.length > 1) {
      const parentFolder = breadcrumb[breadcrumb.length - 2];
      onFolderChange(parentFolder.id);
    } else {
      onFolderChange(null);
    }
  };

  return (
    <>
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
            <Box>
              <Typography variant="h6" component="h2" gutterBottom>
                Folders
              </Typography>
              
              {/* Breadcrumb Navigation */}
              {breadcrumb.length > 0 && (
                <Breadcrumbs aria-label="breadcrumb" sx={{ mt: 1 }}>
                  <Link
                    component="button"
                    variant="body2"
                    color="primary"
                    onClick={() => handleBreadcrumbClick(null)}
                    sx={{ textDecoration: 'none' }}
                  >
                    <Home sx={{ mr: 0.5, fontSize: 16 }} />
                    Home
                  </Link>
                  {breadcrumb.map((folder, index) => (
                    index === breadcrumb.length - 1 ? (
                      <Typography key={folder.id} color="text.primary" variant="body2">
                        {folder.name}
                      </Typography>
                    ) : (
                      <Link
                        key={folder.id}
                        component="button"
                        variant="body2"
                        color="primary"
                        onClick={() => handleBreadcrumbClick(folder.id)}
                        sx={{ textDecoration: 'none' }}
                      >
                        {folder.name}
                      </Link>
                    )
                  ))}
                </Breadcrumbs>
              )}
            </Box>
            
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={() => setShowCreateFolder(true)}
              size="small"
            >
              New Folder
            </Button>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {/* Create Folder Form */}
          {showCreateFolder && (
            <Card variant="outlined" sx={{ mb: 2, p: 2 }}>
              <form onSubmit={handleCreateFolder}>
                <Stack direction="row" spacing={2} alignItems="center">
                  <TextField
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="Folder name"
                    size="small"
                    fullWidth
                    autoFocus
                    variant="outlined"
                  />
                  <Button
                    type="submit"
                    variant="contained"
                    size="small"
                  >
                    Create
                  </Button>
                  <Button
                    type="button"
                    variant="outlined"
                    size="small"
                    onClick={() => {
                      setShowCreateFolder(false);
                      setNewFolderName('');
                      setError('');
                    }}
                  >
                    Cancel
                  </Button>
                </Stack>
              </form>
            </Card>
          )}

          {/* Back Navigation */}
          {currentFolderId && (
            <Box sx={{ mb: 2 }}>
              <Button
                startIcon={<ArrowBack />}
                onClick={handleBackClick}
                variant="text"
                size="small"
              >
                Back
              </Button>
            </Box>
          )}

          {loading ? (
            <Box display="flex" justifyContent="center" alignItems="center" py={4}>
              <CircularProgress />
              <Typography variant="body1" sx={{ ml: 2 }}>
                Loading folders...
              </Typography>
            </Box>
          ) : folders.length === 0 ? (
            <Box 
              sx={{ 
                textAlign: 'center', 
                py: 6,
                color: 'text.secondary' 
              }}
            >
              <Folder sx={{ fontSize: 64, mb: 2, opacity: 0.5 }} />
              <Typography variant="body1">
                No folders found. Create your first folder!
              </Typography>
            </Box>
          ) : (
            <List disablePadding>
              {folders.map((folder, index) => (
                <ListItem
                  key={folder.id}
                  divider={index < folders.length - 1}
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
                        bgcolor: 'primary.main',
                        width: 48,
                        height: 48,
                      }}
                    >
                      <FolderOpen />
                    </Avatar>
                  </ListItemAvatar>
                  
                  <ListItemText
                    primary={
                      <Button
                        variant="text"
                        onClick={() => handleFolderClick(folder.id)}
                        sx={{ 
                          textTransform: 'none',
                          fontWeight: 500,
                          justifyContent: 'flex-start',
                          p: 0,
                          minWidth: 'auto',
                        }}
                      >
                        {folder.name}
                      </Button>
                    }
                    secondary={
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                        <Chip
                          label={`${folder.subfolder_count} folders`}
                          size="small"
                          variant="outlined"
                        />
                        <Chip
                          label={`${folder.file_count} files`}
                          size="small"
                          variant="outlined"
                        />
                      </Stack>
                    }
                  />
                  
                  <ListItemSecondaryAction>
                    <Stack direction="row" spacing={1}>
                      <IconButton
                        edge="end"
                        aria-label="share"
                        onClick={() => onShare && onShare(folder)}
                        size="small"
                        color="success"
                      >
                        <Share />
                      </IconButton>
                      <IconButton
                        edge="end"
                        aria-label="delete"
                        onClick={() => handleDeleteClick(folder)}
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
          Delete Folder
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="delete-dialog-description">
            Are you sure you want to delete "{folderToDelete?.name}" and all its contents? 
            This action cannot be undone.
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

export default FolderManager;