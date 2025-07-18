import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLogout } from '../hooks/useLogout';
import { DragProvider } from '../contexts/DragContext';
import { sharesAPI } from '../services/api';
import SharesList from './SharesList';
import AdminPanel from './AdminPanel';
import ShareModal from './ShareModal';
import FileUploadModal from './FileUploadModal';
import CreateFolderModal from './CreateFolderModal';
import FilesTabContent from './FilesTabContent';
import ErrorBoundary from './ErrorBoundary';
import ThemeToggle from './ThemeToggle';
import VirusScannerStatusChip from './VirusScannerStatusChip';
import Footer from './Footer';
import {
  Box,
  Container,
  AppBar,
  Toolbar,
  Typography,
  Tabs,
  Tab,
  Chip,
  IconButton,
  Avatar,
  Menu,
  MenuItem,
  Badge,
} from '@mui/material';
import {
  Folder,
  Send,
  Inbox,
  People,
  AdminPanelSettings,
  Logout,
  AccountCircle,
} from '@mui/icons-material';

const Dashboard = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareTarget, setShareTarget] = useState(null);
  const [anchorEl, setAnchorEl] = useState(null);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [createFolderModalOpen, setCreateFolderModalOpen] = useState(false);
  const [unviewedCount, setUnviewedCount] = useState(0);
  const { user, isAdmin } = useAuth();
  const logout = useLogout();

  useEffect(() => {
    // When user logs in, reset to root folder
    if (user) {
      setCurrentFolderId(null);
      loadUnviewedCount();
    }
  }, [user]);

  const loadUnviewedCount = async () => {
    try {
      const response = await sharesAPI.getReceivedSharesUnviewedCount();
      setUnviewedCount(response.data.unviewedCount || 0);
    } catch (error) {
      console.error('Failed to load unviewed count:', error);
    }
  };

  const handleFolderChange = (folderId) => {
    setCurrentFolderId(folderId);
  };


  const handleShare = (item) => {
    setShareTarget(item);
    setShareModalOpen(true);
  };

  const handleShareClose = () => {
    setShareModalOpen(false);
    setShareTarget(null);
  };

  const handleUpload = () => {
    setUploadModalOpen(true);
  };

  const handleUploadClose = () => {
    setUploadModalOpen(false);
  };

  const handleCreateFolder = () => {
    setCreateFolderModalOpen(true);
  };

  const handleCreateFolderClose = () => {
    setCreateFolderModalOpen(false);
  };

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
    // Reset unviewed count when switching to received shares tab (they'll be marked as viewed)
    if (newValue === 2) { // Received shares tab index
      setUnviewedCount(0);
    }
  };

  const handleMenuOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = () => {
    handleMenuClose();
    logout();
  };

  const tabs = [
    { label: 'My Files', icon: <Folder />, id: 'files' },
    { label: 'Sent Shares', icon: <Send />, id: 'sent' },
    { 
      label: 'Received Shares', 
      icon: unviewedCount > 0 ? (
        <Badge badgeContent={unviewedCount} color="error">
          <Inbox />
        </Badge>
      ) : <Inbox />, 
      id: 'received' 
    },
    ...(isAdmin ? [
      { label: 'Admin Panel', icon: <AdminPanelSettings />, id: 'admin' }
    ] : [])
  ];

  return (
    <DragProvider>
      <Box sx={{ minHeight: '100vh', backgroundColor: 'background.default' }}>
      <AppBar position="static" elevation={0}>
        <Toolbar>
          <Box sx={{ display: 'flex', alignItems: 'center', flexGrow: 1 }}>
            <img
              src="/images/logo.svg"
              alt="Relayum Logo"
              style={{
                width: 32,
                height: 32,
                marginRight: 8,
              }}
            />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography
                variant="h5"
                component="h1"
                sx={{
                  fontWeight: 500,
                  color: 'primary.main',
                }}
              >
                Relayum
              </Typography>
              <Chip
                label="BETA"
                size="small"
                color="warning"
                variant="outlined"
                sx={{ 
                  fontSize: '0.65rem', 
                  height: 20, 
                  fontWeight: 'bold',
                  borderRadius: 1
                }}
              />
            </Box>
          </Box>
          
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Welcome, {user?.username}
            </Typography>
            
            {isAdmin && (
              <Chip
                label="Admin"
                size="small"
                color="primary"
                variant="outlined"
              />
            )}
            
            {isAdmin && <VirusScannerStatusChip />}
            
            <ThemeToggle />
            
            <IconButton
              size="large"
              edge="end"
              aria-label="account menu"
              aria-controls="account-menu"
              aria-haspopup="true"
              onClick={handleMenuOpen}
              color="inherit"
            >
              <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main' }}>
                <AccountCircle />
              </Avatar>
            </IconButton>
            
            <Menu
              id="account-menu"
              anchorEl={anchorEl}
              open={Boolean(anchorEl)}
              onClose={handleMenuClose}
              onClick={handleMenuClose}
              PaperProps={{
                elevation: 0,
                sx: {
                  overflow: 'visible',
                  filter: 'drop-shadow(0px 2px 8px rgba(0,0,0,0.32))',
                  mt: 1.5,
                  '& .MuiAvatar-root': {
                    width: 32,
                    height: 32,
                    ml: -0.5,
                    mr: 1,
                  },
                },
              }}
              transformOrigin={{ horizontal: 'right', vertical: 'top' }}
              anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
            >
              <MenuItem onClick={handleLogout}>
                <Logout fontSize="small" sx={{ mr: 1 }} />
                Logout
              </MenuItem>
            </Menu>
          </Box>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ py: 3 }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
          <Tabs
            value={activeTab}
            onChange={handleTabChange}
            aria-label="navigation tabs"
            sx={{
              '& .MuiTab-root': {
                textTransform: 'none',
                fontSize: '0.875rem',
                fontWeight: 500,
                minHeight: 48,
              },
            }}
          >
            {tabs.map((tab, index) => (
              <Tab
                key={tab.id}
                label={tab.label}
                icon={tab.icon}
                iconPosition="start"
                sx={{
                  '& .MuiTab-iconWrapper': {
                    mb: 0,
                    mr: 1,
                  },
                }}
              />
            ))}
          </Tabs>
        </Box>

        <Box>
          {activeTab === 0 && (
            <FilesTabContent
              currentFolderId={currentFolderId}
              onFolderChange={handleFolderChange}
              onShare={handleShare}
              onUpload={handleUpload}
              onCreateFolder={handleCreateFolder}
            />
          )}
          {activeTab === 1 && (
            <ErrorBoundary title="Sent Shares Error" showHomeButton={false}>
              <SharesList type="sent" />
            </ErrorBoundary>
          )}
          {activeTab === 2 && (
            <ErrorBoundary title="Received Shares Error" showHomeButton={false}>
              <SharesList type="received" />
            </ErrorBoundary>
          )}
          {activeTab === 3 && isAdmin && (
            <ErrorBoundary title="Admin Panel Error" showHomeButton={false}>
              <AdminPanel />
            </ErrorBoundary>
          )}
        </Box>
      </Container>
      
      {/* Share Modal */}
      {shareModalOpen && shareTarget && (
        <ShareModal
          file={shareTarget.filename ? shareTarget : null}
          folder={shareTarget.name ? shareTarget : null}
          onClose={handleShareClose}
        />
      )}
      
      {/* Upload Modal */}
      <FileUploadModal
        open={uploadModalOpen}
        onClose={handleUploadClose}
        currentFolderId={currentFolderId}
      />
      
      {/* Create Folder Modal */}
      <CreateFolderModal
        open={createFolderModalOpen}
        onClose={handleCreateFolderClose}
        currentFolderId={currentFolderId}
      />
      </Box>
      
      {/* Footer - Outside the main Box so it's always visible */}
      <Footer />
    </DragProvider>
  );
};

export default Dashboard;