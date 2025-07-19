import React, { useState } from 'react';
import { useDrag } from '../contexts/DragContext';
import { useFolderTree } from '../hooks/useFolders';
import { useMoveFile } from '../hooks/useFiles';
import { useMoveFolder } from '../hooks/useFolders';
import QuotaDisplay from './QuotaDisplay';
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Alert,
  CircularProgress,
  Tooltip,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Collapse,
} from '@mui/material';
import {
  Folder,
  Home,
  Refresh,
  ExpandMore,
  ChevronRight,
  Add,
} from '@mui/icons-material';

const FolderTreeView = ({ 
  currentFolderId, 
  onFolderSelect, 
  onCreateFolder,
  onRefresh 
}) => {
  const { data: treeData = [], isLoading: loading, error, refetch } = useFolderTree();
  const moveFileMutation = useMoveFile();
  const moveFolderMutation = useMoveFolder();
  
  const [expandedItems, setExpandedItems] = useState(['root']);
  const { draggedItem, dragOverTarget, startDrag, endDrag, setDragOver, clearDragOver } = useDrag();


  const renderTreeItems = (folders, level = 0) => {
    return folders.map((folder) => (
      <React.Fragment key={folder.id}>
        <ListItem disablePadding>
          <ListItemButton
            draggable
            selected={currentFolderId === folder.id}
            onClick={() => onFolderSelect(folder.id)}
            onDragStart={(e) => handleDragStart(e, folder)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => handleDragOver(e, folder.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, folder.id)}
            sx={{
              borderRadius: 1,
              mx: 1,
              pl: 2 + level * 2,
              opacity: draggedItem?.id === folder.id && draggedItem?.type === 'folder' ? 0.5 : 1,
              backgroundColor: dragOverTarget?.id === folder.id ? 'action.hover' : 'transparent',
              border: dragOverTarget?.id === folder.id ? '2px dashed' : '2px solid transparent',
              borderColor: dragOverTarget?.id === folder.id ? 'primary.main' : 'transparent',
            }}
          >
            <ListItemIcon sx={{ minWidth: 32 }}>
              {folder.children && folder.children.length > 0 && (
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleExpand(folder.id);
                  }}
                  sx={{ mr: 0.5, p: 0.25 }}
                >
                  {expandedItems.includes(folder.id.toString()) ? (
                    <ExpandMore sx={{ fontSize: 16 }} />
                  ) : (
                    <ChevronRight sx={{ fontSize: 16 }} />
                  )}
                </IconButton>
              )}
              <Folder 
                sx={{ 
                  fontSize: 18,
                  color: currentFolderId === folder.id ? 'primary.main' : 'text.secondary'
                }} 
              />
            </ListItemIcon>
            <ListItemText 
              primary={folder.name}
              secondary={`${folder.file_count || 0} files`}
              primaryTypographyProps={{
                variant: 'body2',
                fontWeight: currentFolderId === folder.id ? 500 : 400,
                color: currentFolderId === folder.id ? 'primary.main' : 'inherit'
              }}
              secondaryTypographyProps={{
                variant: 'caption'
              }}
            />
          </ListItemButton>
        </ListItem>
        {folder.children && folder.children.length > 0 && (
          <Collapse in={expandedItems.includes(folder.id.toString())}>
            {renderTreeItems(folder.children, level + 1)}
          </Collapse>
        )}
      </React.Fragment>
    ));
  };

  const handleToggleExpand = (folderId) => {
    setExpandedItems(prev => 
      prev.includes(folderId.toString())
        ? prev.filter(id => id !== folderId.toString())
        : [...prev, folderId.toString()]
    );
  };

  const handleRefresh = () => {
    refetch();
    if (onRefresh) onRefresh();
  };

  const handleCreateFolder = () => {
    if (onCreateFolder) onCreateFolder();
  };

  // Drag and Drop handlers
  const handleDragStart = (e, folder) => {
    startDrag({
      ...folder,
      type: 'folder',
      source: 'tree'
    });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', '');
  };

  const handleDragEnd = () => {
    endDrag();
  };

  const handleDragOver = (e, targetFolderId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver({ type: 'folder', id: targetFolderId });
  };

  const handleDragLeave = (e) => {
    const currentTarget = e.currentTarget;
    const relatedTarget = e.relatedTarget;
    
    if (!relatedTarget || !currentTarget.contains(relatedTarget)) {
      clearDragOver();
    }
  };

  const handleDrop = async (e, targetFolderId) => {
    e.preventDefault();
    clearDragOver();

    if (!draggedItem) return;

    // Don't drop on self
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
      
      // Refresh parent component
      if (onRefresh) {
        onRefresh();
      }
    } catch (error) {
      console.error('Tree drop error:', error);
    }
  };

  const handleRootDrop = async (e) => {
    e.preventDefault();
    clearDragOver();

    if (!draggedItem) return;

    // Don't move if already in root location
    if ((draggedItem.type === 'file' && !draggedItem.folder_id) ||
        (draggedItem.type === 'folder' && !draggedItem.parent_id)) {
      return;
    }

    try {
      if (draggedItem.type === 'file') {
        await moveFileMutation.mutateAsync({ fileId: draggedItem.id, targetFolderId: null });
      } else if (draggedItem.type === 'folder') {
        await moveFolderMutation.mutateAsync({ folderId: draggedItem.id, targetParentId: null });
      }
      
      // Refresh parent component
      if (onRefresh) {
        onRefresh();
      }
    } catch (error) {
      console.error('Tree root drop error:', error);
    }
  };

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
      {/* Header */}
      <Box sx={{ 
        p: 2, 
        borderBottom: '1px solid',
        borderColor: 'divider',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <Typography variant="h6" component="h2">
          Folders
        </Typography>
        <Box>
          <Tooltip title="Create Folder">
            <IconButton 
              onClick={handleCreateFolder}
              size="small"
              color="primary"
            >
              <Add />
            </IconButton>
          </Tooltip>
          <Tooltip title="Refresh">
            <IconButton 
              onClick={handleRefresh}
              size="small"
            >
              <Refresh />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Tree Content */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 1 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress size={24} />
          </Box>
        ) : error ? (
          <Alert severity="error" sx={{ m: 1 }}>
            {error?.message || 'Failed to load folder tree'}
          </Alert>
        ) : (
          <List dense disablePadding>
            {/* Root folder */}
            <ListItem disablePadding>
              <ListItemButton
                selected={!currentFolderId}
                onClick={() => onFolderSelect(null)}
                onDragOver={(e) => handleDragOver(e, null)}
                onDragLeave={handleDragLeave}
                onDrop={handleRootDrop}
                sx={{
                  borderRadius: 1,
                  mx: 1,
                  backgroundColor: dragOverTarget?.id === null ? 'action.hover' : 'transparent',
                  border: dragOverTarget?.id === null ? '2px dashed' : '2px solid transparent',
                  borderColor: dragOverTarget?.id === null ? 'primary.main' : 'transparent',
                }}
              >
                <ListItemIcon sx={{ minWidth: 32 }}>
                  <Home 
                    sx={{ 
                      fontSize: 18,
                      color: !currentFolderId ? 'primary.main' : 'text.secondary'
                    }} 
                  />
                </ListItemIcon>
                <ListItemText 
                  primary="Home"
                  primaryTypographyProps={{
                    variant: 'body2',
                    fontWeight: !currentFolderId ? 500 : 400,
                    color: !currentFolderId ? 'primary.main' : 'inherit'
                  }}
                />
              </ListItemButton>
            </ListItem>
            {renderTreeItems(treeData)}
          </List>
        )}
      </Box>

      {/* Quota Display at Bottom */}
      <Box sx={{ 
        borderTop: '1px solid',
        borderColor: 'divider',
        p: 1
      }}>
        <QuotaDisplay compact />
      </Box>
    </Paper>
  );
};

export default FolderTreeView;