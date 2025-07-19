import React, { useState } from 'react';
import { downloadAPI } from '../services/api';
import { useDrag } from '../contexts/DragContext';
import { useFiles } from '../hooks/useFiles';
import { useFolders, useBreadcrumb } from '../hooks/useFolders';
import { useDeleteFile, useMoveFile } from '../hooks/useFiles';
import { useDeleteFolder, useMoveFolder } from '../hooks/useFolders';
import { formatDateTime } from '../utils/dateUtils';
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Breadcrumbs,
  Link,
  Grid,
  Card,
  CardActionArea,
  Avatar,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Alert,
  CircularProgress,
  Chip,
  Stack,
  Tooltip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Button,
} from '@mui/material';
import {
  FolderOpen,
  InsertDriveFile,
  Home,
  MoreVert,
  Download,
  Share,
  Delete,
  Image,
  VideoFile,
  AudioFile,
  Archive,
  Description,
  Upload,
  CreateNewFolder,
  ViewModule,
  ViewList,
  Lock,
} from '@mui/icons-material';

const FileBrowserView = ({ 
  currentFolderId, 
  onFolderChange, 
  onShare, 
  onUpload,
  onCreateFolder,
  onRefresh,
  viewMode = 'grid' // 'grid' or 'list'
}) => {
  const [currentViewMode, setCurrentViewMode] = React.useState(() => {
    // Load view mode from localStorage or use default
    return localStorage.getItem('fileBrowserViewMode') || viewMode;
  });
  const { data: files = [], isLoading: filesLoading, error: filesError } = useFiles(currentFolderId);
  const { data: folders = [], isLoading: foldersLoading, error: foldersError } = useFolders(currentFolderId);
  const { data: breadcrumb = [] } = useBreadcrumb(currentFolderId);
  
  const deleteFileMutation = useDeleteFile();
  const moveFileMutation = useMoveFile();
  const deleteFolderMutation = useDeleteFolder();
  const moveFolderMutation = useMoveFolder();
  
  const loading = filesLoading || foldersLoading;
  const error = filesError || foldersError;
  const [contextMenu, setContextMenu] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [localDragOverFolder, setLocalDragOverFolder] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const { draggedItem, startDrag, endDrag } = useDrag();

  const handleFolderClick = (folderId) => {
    onFolderChange(folderId);
  };

  const handleBreadcrumbClick = (folderId) => {
    onFolderChange(folderId);
  };

  const handleContextMenu = (event, item, type) => {
    event.preventDefault();
    setContextMenu({
      mouseX: event.clientX + 2,
      mouseY: event.clientY - 6,
    });
    setSelectedItem({ ...item, type });
  };

  const handleContextMenuClose = () => {
    setContextMenu(null);
    setSelectedItem(null);
  };

  const handleDownload = async (item) => {
    try {
      if (item.type === 'file') {
        // All files are encrypted, download directly (server handles decryption)
        await downloadAPI.downloadFile(item.id);
      } else {
        await downloadAPI.downloadFolder(item.id);
      }
    } catch (error) {
      console.error(`Failed to download ${item.type}:`, error);
    }
    handleContextMenuClose();
  };

  const handleShare = (item) => {
    if (onShare) {
      onShare(item);
    }
    handleContextMenuClose();
  };

  const handleDelete = (item) => {
    setItemToDelete(item);
    setDeleteDialogOpen(true);
    handleContextMenuClose();
  };

  const handleDeleteConfirm = async () => {
    if (!itemToDelete) return;

    try {
      if (itemToDelete.type === 'file') {
        await deleteFileMutation.mutateAsync(itemToDelete.id);
      } else {
        await deleteFolderMutation.mutateAsync(itemToDelete.id);
      }
    } catch (error) {
      console.error(`Failed to delete ${itemToDelete.type}:`, error);
    } finally {
      setDeleteDialogOpen(false);
      setItemToDelete(null);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setItemToDelete(null);
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


  // Drag and Drop handlers
  const handleDragStart = (e, item, type) => {
    // Include current location info for better move logic
    startDrag({ 
      ...item, 
      type, 
      currentFolderId: currentFolderId,
      originalParentId: type === 'folder' ? item.parent_id : item.folder_id,
      source: 'browser'
    });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', ''); // Required for Firefox
  };

  const handleDragEnd = () => {
    endDrag();
    setLocalDragOverFolder(null);
  };

  const handleDragOver = (e, folderId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setLocalDragOverFolder(folderId);
  };

  const handleDragLeave = (e) => {
    // Improved drag leave detection
    const currentTarget = e.currentTarget;
    const relatedTarget = e.relatedTarget;
    
    // Clear drag over if:
    // 1. Related target is null (left browser area)
    // 2. Related target is not a child of current target
    if (!relatedTarget || !currentTarget.contains(relatedTarget)) {
      setLocalDragOverFolder(null);
    }
  };

  const handleDrop = async (e, targetFolderId) => {
    e.preventDefault();
    setLocalDragOverFolder(null);

    if (!draggedItem) return;

    // Don't drop item on itself
    if (draggedItem.type === 'folder' && draggedItem.id === targetFolderId) {
      return;
    }

    // Don't move if already in target location
    if ((draggedItem.type === 'file' && draggedItem.folder_id === targetFolderId) ||
        (draggedItem.type === 'folder' && draggedItem.parent_id === targetFolderId)) {
      return;
    }

    try {
      if (draggedItem.type === 'file') {
        await moveFileMutation.mutateAsync({ fileId: draggedItem.id, targetFolderId });
      } else if (draggedItem.type === 'folder') {
        await moveFolderMutation.mutateAsync({ folderId: draggedItem.id, targetParentId: targetFolderId });
      }
      
      // Refresh the tree view 
      if (onRefresh) {
        onRefresh();
      }
    } catch (error) {
      console.error('Move error:', error);
    }
  };

  // Handle drop on root/current folder
  const handleRootDrop = async (e) => {
    e.preventDefault();
    setLocalDragOverFolder(null);

    if (!draggedItem) return;

    // Don't move if already in current location
    if ((draggedItem.type === 'file' && draggedItem.folder_id === currentFolderId) ||
        (draggedItem.type === 'folder' && draggedItem.parent_id === currentFolderId)) {
      return;
    }

    try {
      if (draggedItem.type === 'file') {
        await moveFileMutation.mutateAsync({ fileId: draggedItem.id, targetFolderId: currentFolderId });
      } else if (draggedItem.type === 'folder') {
        await moveFolderMutation.mutateAsync({ folderId: draggedItem.id, targetParentId: currentFolderId });
      }
      
      // Refresh the tree view
      if (onRefresh) {
        onRefresh();
      }
    } catch (error) {
      console.error('Move error:', error);
    }
  };

  const renderGridView = () => (
    <Grid container spacing={2}>
      {folders.map((folder) => (
        <Grid item xs={12} sm={6} md={4} lg={3} key={`folder-${folder.id}`}>
          <Card 
            draggable
            onDragStart={(e) => handleDragStart(e, folder, 'folder')}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => handleDragOver(e, folder.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, folder.id)}
            sx={{ 
              height: 140,
              cursor: 'pointer',
              opacity: draggedItem?.id === folder.id ? 0.5 : 1,
              backgroundColor: localDragOverFolder === folder.id ? 'action.hover' : 'background.paper',
              border: localDragOverFolder === folder.id ? '2px dashed' : '1px solid',
              borderColor: localDragOverFolder === folder.id ? 'primary.main' : 'divider',
              '&:hover': { 
                boxShadow: 4,
                transform: draggedItem?.id === folder.id ? 'none' : 'translateY(-2px)',
                transition: 'all 0.2s ease-in-out'
              }
            }}
          >
            <CardActionArea
              sx={{ height: '100%', p: 2 }}
              onClick={() => handleFolderClick(folder.id)}
              onContextMenu={(e) => handleContextMenu(e, folder, 'folder')}
            >
              <Box sx={{ textAlign: 'center', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <FolderOpen sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
                <Typography variant="body2" noWrap title={folder.name}>
                  {folder.name}
                </Typography>
                <Stack direction="row" spacing={1} justifyContent="center" sx={{ mt: 1 }}>
                  <Chip label={`${folder.file_count || 0} files`} size="small" variant="outlined" />
                </Stack>
              </Box>
            </CardActionArea>
          </Card>
        </Grid>
      ))}
      
      {files.map((file) => (
        <Grid item xs={12} sm={6} md={4} lg={3} key={`file-${file.id}`}>
          <Card 
            draggable
            onDragStart={(e) => handleDragStart(e, file, 'file')}
            onDragEnd={handleDragEnd}
            sx={{ 
              height: 140,
              cursor: 'pointer',
              opacity: draggedItem?.id === file.id && draggedItem?.type === 'file' ? 0.5 : 1,
              '&:hover': { 
                boxShadow: 4,
                transform: draggedItem?.id === file.id && draggedItem?.type === 'file' ? 'none' : 'translateY(-2px)',
                transition: 'all 0.2s ease-in-out'
              }
            }}
          >
            <CardActionArea
              sx={{ height: '100%', p: 2 }}
              onContextMenu={(e) => handleContextMenu(e, file, 'file')}
            >
              <Box sx={{ textAlign: 'center', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <Avatar
                  sx={{
                    bgcolor: getFileTypeColor(file.mime_type),
                    width: 48,
                    height: 48,
                    mx: 'auto',
                    mb: 1,
                  }}
                >
                  {getFileIcon(file.mime_type)}
                </Avatar>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                  <Typography variant="body2" noWrap title={file.filename} sx={{ maxWidth: '120px' }}>
                    {file.filename}
                  </Typography>
                  {file.encrypted && (
                    <Tooltip title="Encrypted file">
                      <Lock sx={{ fontSize: 12, color: 'primary.main' }} />
                    </Tooltip>
                  )}
                </Box>
                <Typography variant="caption" color="text.secondary">
                  {formatFileSize(file.size)}
                </Typography>
              </Box>
            </CardActionArea>
          </Card>
        </Grid>
      ))}
    </Grid>
  );

  const renderTableView = () => (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={{ width: 40 }}></TableCell>
            <TableCell>Name</TableCell>
            <TableCell sx={{ width: 140 }}>Date Created</TableCell>
            <TableCell sx={{ width: 100 }}>Size</TableCell>
            <TableCell sx={{ width: 50 }}></TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {folders.map((folder) => (
            <TableRow
              key={`folder-${folder.id}`}
              draggable
              onDragStart={(e) => handleDragStart(e, folder, 'folder')}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => handleDragOver(e, folder.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, folder.id)}
              sx={{
                cursor: 'pointer',
                opacity: draggedItem?.id === folder.id ? 0.5 : 1,
                backgroundColor: localDragOverFolder === folder.id ? 'action.hover' : 'transparent',
                '&:hover': {
                  backgroundColor: 'action.hover',
                },
              }}
              onClick={() => handleFolderClick(folder.id)}
              onContextMenu={(e) => handleContextMenu(e, folder, 'folder')}
            >
              <TableCell>
                <FolderOpen sx={{ color: 'primary.main', fontSize: 20 }} />
              </TableCell>
              <TableCell>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {folder.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {folder.file_count || 0} files
                </Typography>
              </TableCell>
              <TableCell>
                <Typography variant="body2" color="text.secondary">
                  {formatDateTime(folder.created_at)}
                </Typography>
              </TableCell>
              <TableCell>
                <Typography variant="body2" color="text.secondary">
                  {folder.total_size ? formatFileSize(folder.total_size) : '—'}
                </Typography>
              </TableCell>
              <TableCell>
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleContextMenu(e, folder, 'folder');
                  }}
                >
                  <MoreVert />
                </IconButton>
              </TableCell>
            </TableRow>
          ))}
          
          {files.map((file) => (
            <TableRow
              key={`file-${file.id}`}
              draggable
              onDragStart={(e) => handleDragStart(e, file, 'file')}
              onDragEnd={handleDragEnd}
              sx={{
                cursor: 'pointer',
                opacity: draggedItem?.id === file.id && draggedItem?.type === 'file' ? 0.5 : 1,
                '&:hover': {
                  backgroundColor: 'action.hover',
                },
              }}
              onContextMenu={(e) => handleContextMenu(e, file, 'file')}
            >
              <TableCell>
                <Avatar
                  sx={{
                    bgcolor: getFileTypeColor(file.mime_type),
                    width: 24,
                    height: 24,
                  }}
                >
                  {React.cloneElement(getFileIcon(file.mime_type), { sx: { fontSize: 14 } })}
                </Avatar>
              </TableCell>
              <TableCell>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography variant="body2" title={file.filename}>
                    {file.filename}
                  </Typography>
                  {file.encrypted && (
                    <Tooltip title="Encrypted file">
                      <Lock sx={{ fontSize: 12, color: 'primary.main' }} />
                    </Tooltip>
                  )}
                </Box>
              </TableCell>
              <TableCell>
                <Typography variant="body2" color="text.secondary">
                  {formatDateTime(file.created_at)}
                </Typography>
              </TableCell>
              <TableCell>
                <Typography variant="body2" color="text.secondary">
                  {formatFileSize(file.size)}
                </Typography>
              </TableCell>
              <TableCell>
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleContextMenu(e, file, 'file');
                  }}
                >
                  <MoreVert />
                </IconButton>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );

  return (
    <Paper 
      elevation={0} 
      sx={{ 
        height: '100%', 
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {/* Header with breadcrumbs and actions */}
      <Box sx={{ 
        p: 2, 
        borderBottom: '1px solid',
        borderColor: 'divider',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <Box sx={{ flex: 1 }}>
          <Breadcrumbs aria-label="breadcrumb" sx={{ mb: 1 }}>
            <Link
              component="button"
              variant="body2"
              color="primary"
              onClick={() => handleBreadcrumbClick(null)}
              sx={{ textDecoration: 'none', display: 'flex', alignItems: 'center' }}
            >
              <Home sx={{ mr: 0.5, fontSize: 16 }} />
              Home
            </Link>
            {breadcrumb.map((folder) => (
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
            ))}
          </Breadcrumbs>
          
          <Typography variant="caption" color="text.secondary">
            {folders.length} folders, {files.length} files
          </Typography>
        </Box>
        
        <Stack direction="row" spacing={1}>
          <Tooltip title={currentViewMode === 'grid' ? 'List View' : 'Grid View'}>
            <IconButton 
              onClick={() => {
                const newMode = currentViewMode === 'grid' ? 'list' : 'grid';
                setCurrentViewMode(newMode);
                localStorage.setItem('fileBrowserViewMode', newMode);
              }}
              color="primary"
            >
              {currentViewMode === 'grid' ? <ViewList /> : <ViewModule />}
            </IconButton>
          </Tooltip>
          <Tooltip title="Upload Files">
            <IconButton onClick={onUpload} color="primary">
              <Upload />
            </IconButton>
          </Tooltip>
          <Tooltip title="Create Folder">
            <IconButton onClick={onCreateFolder} color="primary">
              <CreateNewFolder />
            </IconButton>
          </Tooltip>
        </Stack>
      </Box>

      {/* Content area */}
      <Box 
        sx={{ 
          flex: 1, 
          overflow: 'auto', 
          p: 2,
          backgroundColor: localDragOverFolder === 'root' ? 'action.hover' : 'background.default',
          border: localDragOverFolder === 'root' ? '2px dashed' : 'none',
          borderColor: localDragOverFolder === 'root' ? 'primary.main' : 'transparent',
          borderRadius: 1
        }}
        onDragOver={(e) => handleDragOver(e, 'root')}
        onDragLeave={handleDragLeave}
        onDrop={handleRootDrop}
      >
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50%' }}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Alert severity="error">{error?.message || 'Failed to load content'}</Alert>
        ) : folders.length === 0 && files.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <FolderOpen sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" color="text.secondary">
              This folder is empty
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Upload files or create folders to get started
            </Typography>
          </Box>
        ) : (
          currentViewMode === 'grid' ? renderGridView() : renderTableView()
        )}
      </Box>

      {/* Context Menu */}
      <Menu
        open={contextMenu !== null}
        onClose={handleContextMenuClose}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu !== null
            ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
            : undefined
        }
      >
        <MenuItem onClick={() => handleDownload(selectedItem)}>
          <ListItemIcon>
            <Download fontSize="small" />
          </ListItemIcon>
          <ListItemText>Download</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => handleShare(selectedItem)}>
          <ListItemIcon>
            <Share fontSize="small" />
          </ListItemIcon>
          <ListItemText>Share</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => handleDelete(selectedItem)} sx={{ color: 'error.main' }}>
          <ListItemIcon>
            <Delete fontSize="small" color="error" />
          </ListItemIcon>
          <ListItemText>Delete</ListItemText>
        </MenuItem>
      </Menu>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={handleDeleteCancel}
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-description"
      >
        <DialogTitle id="delete-dialog-title">
          Delete {itemToDelete?.type === 'file' ? 'File' : 'Folder'}
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="delete-dialog-description">
            Are you sure you want to delete "{itemToDelete?.filename || itemToDelete?.name}"?
            {itemToDelete?.type === 'folder' && ' This will also delete all files and subfolders inside it.'}
            {' '}This action cannot be undone.
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
    </Paper>
  );
};

export default FileBrowserView;