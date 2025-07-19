import React, { useState, useEffect, useCallback } from 'react';
import { sharesAPI, downloadAPI } from '../services/api';
import { formatDateTime } from '../utils/dateUtils';
import {
  Box,
  Paper,
  Typography,
  IconButton,
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
  Tooltip,
} from '@mui/material';
import {
  ArrowBack,
  InsertDriveFile,
  Download,
  FolderOpen,
  Image,
  VideoFile,
  AudioFile,
  Archive,
  Description,
} from '@mui/icons-material';

const SharedFolderBrowser = ({ 
  shareId, 
  shareName,
  onBack 
}) => {
  const [files, setFiles] = useState([]);
  const [shareInfo, setShareInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [contextMenu, setContextMenu] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);

  useEffect(() => {
    loadSharedFolderContents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareId]);

  const loadSharedFolderContents = useCallback(async () => {
    setLoading(true);
    setError('');
    
    try {
      const response = await sharesAPI.getSharedFolderContents(shareId);
      setFiles(response.data.files || []);
      setShareInfo(response.data.share);
    } catch (error) {
      setError('Failed to load shared folder contents');
      console.error('Error loading shared folder contents:', error);
    } finally {
      setLoading(false);
    }
  }, [shareId]);

  const handleContextMenu = (event, file) => {
    event.preventDefault();
    setContextMenu({
      mouseX: event.clientX + 2,
      mouseY: event.clientY - 6,
    });
    setSelectedFile(file);
  };

  const handleContextMenuClose = () => {
    setContextMenu(null);
    setSelectedFile(null);
  };

  const handleDownload = async (file) => {
    try {
      await downloadAPI.downloadFile(file.id);
    } catch (error) {
      setError('Failed to download file');
    }
    handleContextMenuClose();
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


  // Group files by folder path
  const groupedFiles = files.reduce((acc, file) => {
    const folderPath = file.folder_path || 'Root';
    if (!acc[folderPath]) {
      acc[folderPath] = [];
    }
    acc[folderPath].push(file);
    return acc;
  }, {});

  const renderFilesSection = (folderPath, filesInFolder) => (
    <Box key={folderPath} sx={{ mb: 4 }}>
      {folderPath !== 'Root' && (
        <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
          <FolderOpen color="primary" />
          <Typography variant="h6" color="primary">
            {folderPath}
          </Typography>
          <Chip label={`${filesInFolder.length} files`} size="small" variant="outlined" />
        </Box>
      )}
      
      <Grid container spacing={2}>
        {filesInFolder.map((file) => (
          <Grid item xs={12} sm={6} md={4} lg={3} key={file.id}>
            <Card 
              sx={{ 
                height: 180,
                cursor: 'pointer',
                '&:hover': { 
                  boxShadow: 4,
                  transform: 'translateY(-2px)',
                  transition: 'all 0.2s ease-in-out'
                }
              }}
            >
              <CardActionArea
                sx={{ height: '100%', p: 2 }}
                onContextMenu={(e) => handleContextMenu(e, file)}
              >
                <Box sx={{ textAlign: 'center', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', py: 1 }}>
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
                  <Typography 
                    variant="body2" 
                    title={file.filename}
                    sx={{ 
                      wordBreak: 'break-word',
                      lineHeight: 1.2,
                      maxHeight: '2.4em',
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical'
                    }}
                  >
                    {file.filename}
                  </Typography>
                  <Box sx={{ mt: 'auto' }}>
                    <Typography variant="caption" color="text.secondary" display="block">
                      {formatFileSize(file.size)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block">
                      {formatDateTime(file.created_at)}
                    </Typography>
                  </Box>
                </Box>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
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
      {/* Header */}
      <Box sx={{ 
        p: 2, 
        borderBottom: '1px solid',
        borderColor: 'divider',
        display: 'flex',
        alignItems: 'center',
        gap: 2
      }}>
        <Tooltip title="Back to Shares">
          <IconButton onClick={onBack} color="primary">
            <ArrowBack />
          </IconButton>
        </Tooltip>
        
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6" component="h2">
            {shareInfo?.folder_name || shareName || 'Shared Folder'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {files.length} files total
          </Typography>
        </Box>
      </Box>

      {/* Content area */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50%' }}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Alert severity="error">{error}</Alert>
        ) : files.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <FolderOpen sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" color="text.secondary">
              This shared folder is empty
            </Typography>
          </Box>
        ) : (
          Object.entries(groupedFiles).map(([folderPath, filesInFolder]) =>
            renderFilesSection(folderPath, filesInFolder)
          )
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
        <MenuItem onClick={() => handleDownload(selectedFile)}>
          <ListItemIcon>
            <Download fontSize="small" />
          </ListItemIcon>
          <ListItemText>Download</ListItemText>
        </MenuItem>
      </Menu>
    </Paper>
  );
};

export default SharedFolderBrowser;