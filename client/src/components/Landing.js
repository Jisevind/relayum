import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Container,
  Paper,
  Typography,
  Grid,
  Card,
  CardContent,
  Tab,
  Tabs,
  AppBar,
  Toolbar,
  Chip,
} from '@mui/material';
import {
  CloudUpload,
  Login as LoginIcon,
  PersonAdd,
  Public,
  Security,
  Schedule,
  Lock,
} from '@mui/icons-material';
import AnonymousUpload from './AnonymousUpload';
import Login from './Login';
import Register from './Register';
import { authAPI } from '../services/api';

const Landing = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [config, setConfig] = useState({ 
    allowRegistration: true, 
    allowAnonymousSharing: true, 
    anonymousMaxFileSize: 104857600,
    defaultDiskQuotaFormatted: '10GB',
    anonymousShareExpirationDays: 7
  });
  const navigate = useNavigate();

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await authAPI.getConfig();
        setConfig(response.data);
      } catch (error) {
        console.error('Failed to fetch config:', error);
        // Default to allowing registration and anonymous sharing if config fetch fails
        setConfig({ 
          allowRegistration: true, 
          allowAnonymousSharing: true, 
          anonymousMaxFileSize: 104857600,
          defaultDiskQuotaFormatted: '10GB',
          anonymousShareExpirationDays: 7
        });
      }
    };
    fetchConfig();
  }, []);

  // Helper function to format file size
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  // Determine available tabs based on config
  const availableTabs = [
    ...(config.allowAnonymousSharing ? [{ value: 0, label: 'Anonymous Upload', icon: <CloudUpload /> }] : []),
    { value: config.allowAnonymousSharing ? 1 : 0, label: 'Login', icon: <LoginIcon /> },
    ...(config.allowRegistration ? [{ value: (config.allowAnonymousSharing ? 2 : 1), label: 'Register', icon: <PersonAdd /> }] : [])
  ];

  return (
    <Box sx={{ minHeight: '100vh', backgroundColor: 'background.default' }}>
      {/* Header */}
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
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 4 }}>
        {/* Hero Section */}
        <Box sx={{ textAlign: 'center', mb: 6 }}>
          <Typography variant="h2" component="h1" gutterBottom sx={{ fontWeight: 'bold' }}>
            Secure File Sharing
          </Typography>
          <Typography variant="h5" color="text.secondary" sx={{ mb: 4, maxWidth: 600, mx: 'auto' }}>
            Share files securely with encrypted storage.
          </Typography>

          {/* Feature Cards */}
          <Grid container spacing={3} sx={{ mb: 6 }}>
            <Grid item xs={12} md={config.allowAnonymousSharing ? 4 : 6}>
              <Card sx={{ height: '100%' }}>
                <CardContent sx={{ textAlign: 'center', p: 3 }}>
                  <Security sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
                  <Typography variant="h6" gutterBottom>
                    Encrypted Storage
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    All files are encrypted at rest with AES-256 encryption
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            {config.allowAnonymousSharing && (
              <Grid item xs={12} md={4}>
                <Card sx={{ height: '100%' }}>
                  <CardContent sx={{ textAlign: 'center', p: 3 }}>
                    <Public sx={{ fontSize: 48, color: 'success.main', mb: 2 }} />
                    <Typography variant="h6" gutterBottom>
                      Anonymous Sharing
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Share files instantly without creating an account
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            )}
            <Grid item xs={12} md={config.allowAnonymousSharing ? 4 : 6}>
              <Card sx={{ height: '100%' }}>
                <CardContent sx={{ textAlign: 'center', p: 3 }}>
                  <Schedule sx={{ fontSize: 48, color: 'warning.main', mb: 2 }} />
                  <Typography variant="h6" gutterBottom>
                    Auto-Expiration
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Files automatically expire to protect your privacy
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Box>

        {/* Main Content */}
        <Paper sx={{ borderRadius: 2, overflow: 'hidden' }}>
          <Tabs 
            value={activeTab} 
            onChange={handleTabChange} 
            variant="fullWidth"
            sx={{
              '& .MuiTab-root': {
                textTransform: 'none',
                fontSize: '1rem',
                fontWeight: 500,
                minHeight: 64,
              },
            }}
          >
            {availableTabs.map((tab) => (
              <Tab 
                key={tab.value}
                icon={tab.icon} 
                label={tab.label} 
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

          <Box sx={{ p: 0 }}>
            {activeTab === 0 && config.allowAnonymousSharing && (
              <Box>
                <AnonymousUpload maxFileSize={config.anonymousMaxFileSize} />
              </Box>
            )}
            {activeTab === (config.allowAnonymousSharing ? 1 : 0) && (
              <Box sx={{ p: 3 }}>
                <Login 
                  onSuccess={() => navigate('/dashboard')} 
                />
              </Box>
            )}
            {activeTab === (config.allowAnonymousSharing ? 2 : 1) && config.allowRegistration && (
              <Box sx={{ p: 3 }}>
                <Register onSuccess={() => navigate('/dashboard')} />
              </Box>
            )}
          </Box>
        </Paper>

        {/* Anonymous Upload Info */}
        {activeTab === 0 && config.allowAnonymousSharing && (
          <Box sx={{ mt: 4, textAlign: 'center' }}>
            <Typography variant="h6" gutterBottom>
              Why use anonymous upload?
            </Typography>
            <Grid container spacing={2} sx={{ mt: 2 }}>
              <Grid item xs={12} md={3}>
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <Public color="success" sx={{ mb: 1 }} />
                  <Typography variant="body2" color="text.secondary">
                    No account required
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={12} md={3}>
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <Lock color="primary" sx={{ mb: 1 }} />
                  <Typography variant="body2" color="text.secondary">
                    Optional password protection
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={12} md={3}>
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <Schedule color="warning" sx={{ mb: 1 }} />
                  <Typography variant="body2" color="text.secondary">
                    Expires after {config.anonymousShareExpirationDays} {config.anonymousShareExpirationDays === 1 ? 'day' : 'days'}
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={12} md={3}>
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <CloudUpload color="info" sx={{ mb: 1 }} />
                  <Typography variant="body2" color="text.secondary">
                    Up to {formatFileSize(config.anonymousMaxFileSize)} per file
                  </Typography>
                </Box>
              </Grid>
            </Grid>
          </Box>
        )}

        {/* Account Benefits */}
        {(activeTab === (config.allowAnonymousSharing ? 1 : 0) || (activeTab === (config.allowAnonymousSharing ? 2 : 1) && config.allowRegistration)) && (
          <Box sx={{ mt: 4, textAlign: 'center' }}>
            <Typography variant="h6" gutterBottom>
              Benefits of having an account
            </Typography>
            <Grid container spacing={2} sx={{ mt: 2 }}>
              <Grid item xs={12} md={3}>
                <Typography variant="body2" color="text.secondary">
                  • Manage your shares
                </Typography>
              </Grid>
              <Grid item xs={12} md={3}>
                <Typography variant="body2" color="text.secondary">
                  • {config.defaultDiskQuotaFormatted} storage quota
                </Typography>
              </Grid>
              <Grid item xs={12} md={3}>
                <Typography variant="body2" color="text.secondary">
                  • Share with specific users
                </Typography>
              </Grid>
              <Grid item xs={12} md={3}>
                <Typography variant="body2" color="text.secondary">
                  • Custom expiration dates
                </Typography>
              </Grid>
            </Grid>
          </Box>
        )}
      </Container>
    </Box>
  );
};

export default Landing;