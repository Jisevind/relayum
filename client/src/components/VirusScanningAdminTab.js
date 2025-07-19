import React, { useState, useEffect } from 'react';
import {
  Box,
  Tabs,
  Tab,
  Alert,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Switch,
  Typography,
  Grid,
  Paper,
  Chip,
  LinearProgress,
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  Security,
  Settings,
  BarChart,
  Refresh,
} from '@mui/icons-material';
import ScannerDashboard from './ScannerDashboard';
import ThreatsQuarantineTab from './ThreatsQuarantineTab';
import { useVirusScannerStatus } from '../hooks/useVirusScannerStatus';
import { formatDateTime } from '../utils/dateUtils';

/**
 * Virus Scanning Admin Tab - Main container for all virus scanning management
 */
const VirusScanningAdminTab = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [configValues, setConfigValues] = useState({});
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });

  const {
    status,
    statistics,
    loading,
    error,
    lastUpdated,
    isEnabled,
    isAvailable,
    isHealthy,
    isEnvironmentDisabled,
    statusColor,
    statusText,
    enableScanner,
    disableScanner,
    testScanner,
    updateConfig,
    refresh,
    clearError,
  } = useVirusScannerStatus();

  // Refresh data when component mounts
  useEffect(() => {
    refresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh data when switching tabs (any tab change triggers refresh)
  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
    // Trigger refresh when tab changes
    refresh();
  };

  const handleToggleScanner = async () => {
    if (isEnvironmentDisabled) {
      showSnackbar('Cannot toggle scanner - disabled via environment configuration', 'warning');
      return;
    }
    
    try {
      if (isEnabled) {
        await disableScanner();
        showSnackbar('Virus scanning disabled successfully', 'success');
      } else {
        await enableScanner();
        showSnackbar('Virus scanning enabled successfully', 'success');
      }
    } catch (err) {
      showSnackbar(err.message, 'error');
    }
  };

  const handleTestScanner = async () => {
    if (isEnvironmentDisabled) {
      showSnackbar('Cannot test scanner - disabled via environment configuration', 'warning');
      return;
    }
    
    try {
      const result = await testScanner();
      if (result.success) {
        showSnackbar('Scanner test completed successfully', 'success');
      } else {
        showSnackbar(`Scanner test failed: ${result.message}`, 'error');
      }
    } catch (err) {
      showSnackbar(err.message, 'error');
    }
  };

  const handleConfigOpen = () => {
    if (isEnvironmentDisabled) {
      showSnackbar('Cannot configure scanner - disabled via environment configuration', 'warning');
      return;
    }
    
    // Initialize config values from current status
    if (status?.config) {
      const initialConfig = {};
      Object.keys(status.config).forEach(key => {
        initialConfig[key] = status.config[key].value;
      });
      setConfigValues(initialConfig);
    }
    setConfigDialogOpen(true);
  };

  const handleConfigClose = () => {
    setConfigDialogOpen(false);
    setConfigValues({});
  };

  const handleConfigSave = async () => {
    try {
      await updateConfig(configValues);
      showSnackbar('Configuration updated successfully', 'success');
      handleConfigClose();
    } catch (err) {
      showSnackbar(err.message, 'error');
    }
  };

  const handleConfigValueChange = (key, value) => {
    setConfigValues(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const showSnackbar = (message, severity = 'info') => {
    setSnackbar({ open: true, message, severity });
  };

  const handleSnackbarClose = () => {
    setSnackbar(prev => ({ ...prev, open: false }));
  };

  const tabs = [
    { label: 'Dashboard', icon: <DashboardIcon />, id: 'dashboard' },
    { label: 'Threats & Quarantine', icon: <Security />, id: 'threats' },
    { label: 'Configuration', icon: <Settings />, id: 'config' },
    { label: 'Statistics', icon: <BarChart />, id: 'statistics' },
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 0: // Dashboard
        return (
          <ScannerDashboard
            status={status}
            statistics={statistics}
            loading={loading}
            error={error}
            lastUpdated={lastUpdated}
            isEnabled={isEnabled}
            isAvailable={isAvailable}
            isHealthy={isHealthy}
            isEnvironmentDisabled={isEnvironmentDisabled}
            statusColor={statusColor}
            statusText={statusText}
            onToggleScanner={handleToggleScanner}
            onTestScanner={handleTestScanner}
            onRefresh={refresh}
            onConfigOpen={handleConfigOpen}
          />
        );

      case 1: // Threats & Quarantine
        return <ThreatsQuarantineTab />;

      case 2: // Configuration
        return (
          <Box sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Scanner Configuration
            </Typography>
            <Alert severity="info">
              Advanced configuration interface coming soon. This will include scan mode settings, 
              timeout configuration, and quarantine policies.
            </Alert>
          </Box>
        );

      case 3: // Statistics
        return (
          <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
              <Typography variant="h6" sx={{ flexGrow: 1 }}>
                Scanning Statistics & Analytics
              </Typography>
              <Button
                variant="outlined"
                startIcon={<Refresh />}
                onClick={refresh}
                disabled={loading || isEnvironmentDisabled}
                size="small"
              >
                Refresh Statistics
              </Button>
            </Box>
            
            {loading && <LinearProgress sx={{ mb: 3 }} />}
            
            {statistics ? (
              <Grid container spacing={3}>
                {/* Summary Statistics */}
                <Grid item xs={12} md={3}>
                  <Paper sx={{ p: 3, textAlign: 'center' }}>
                    <Typography variant="h4" color="primary" fontWeight="bold">
                      {statistics.summary?.total_scans || 0}
                    </Typography>
                    <Typography variant="body1" color="text.secondary">
                      Total Scans (Last {statistics.period_days || 30} Days)
                    </Typography>
                  </Paper>
                </Grid>
                
                <Grid item xs={12} md={3}>
                  <Paper sx={{ p: 3, textAlign: 'center' }}>
                    <Typography variant="h4" color="success.main" fontWeight="bold">
                      {statistics.summary?.clean_files || 0}
                    </Typography>
                    <Typography variant="body1" color="text.secondary">
                      Clean Files
                    </Typography>
                  </Paper>
                </Grid>
                
                <Grid item xs={12} md={3}>
                  <Paper sx={{ p: 3, textAlign: 'center' }}>
                    <Typography variant="h4" color="error.main" fontWeight="bold">
                      {statistics.summary?.infected_files || 0}
                    </Typography>
                    <Typography variant="body1" color="text.secondary">
                      Threats Blocked
                    </Typography>
                  </Paper>
                </Grid>
                
                <Grid item xs={12} md={3}>
                  <Paper sx={{ p: 3, textAlign: 'center' }}>
                    <Typography variant="h4" color="orange" fontWeight="bold">
                      {statistics.summary?.quarantined_files || 0}
                    </Typography>
                    <Typography variant="body1" color="text.secondary">
                      Files Quarantined
                    </Typography>
                  </Paper>
                </Grid>
                
                {/* Performance Metrics */}
                <Grid item xs={12} md={6}>
                  <Paper sx={{ p: 3 }}>
                    <Typography variant="h6" gutterBottom>
                      Performance Metrics
                    </Typography>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="body2">Average Scan Time:</Typography>
                      <Typography variant="body2" fontWeight="bold">
                        {statistics.summary?.avg_scan_time ? `${parseFloat(statistics.summary.avg_scan_time).toFixed(1)}ms` : 'N/A'}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="body2">Scan Errors:</Typography>
                      <Typography variant="body2" fontWeight="bold" color="warning.main">
                        {statistics.summary?.scan_errors || 0}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="body2">Success Rate:</Typography>
                      <Typography variant="body2" fontWeight="bold" color="success.main">
                        {statistics.summary?.total_scans > 0 
                          ? `${(((statistics.summary?.clean_files || 0) + (statistics.summary?.infected_files || 0)) / statistics.summary?.total_scans * 100).toFixed(1)}%`
                          : 'N/A'}
                      </Typography>
                    </Box>
                  </Paper>
                </Grid>
                
                {/* Recent Activity */}
                <Grid item xs={12} md={6}>
                  <Paper sx={{ p: 3 }}>
                    <Typography variant="h6" gutterBottom>
                      Recent Activity
                    </Typography>
                    {statistics.daily_activity && statistics.daily_activity.length > 0 ? (
                      statistics.daily_activity.slice(0, 3).map((day, index) => (
                        <Box key={index} sx={{ mb: 1 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography variant="body2">
                              {new Date(day.date).toLocaleDateString()}:
                            </Typography>
                            <Typography variant="body2" fontWeight="bold">
                              {day.total_scans} scans
                            </Typography>
                          </Box>
                        </Box>
                      ))
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        No recent activity
                      </Typography>
                    )}
                  </Paper>
                </Grid>
                
                {/* Top Threats */}
                <Grid item xs={12}>
                  <Paper sx={{ p: 3 }}>
                    <Typography variant="h6" gutterBottom>
                      Top Threats Detected
                    </Typography>
                    {statistics.top_threats && statistics.top_threats.length > 0 ? (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                        {statistics.top_threats.map((threat, index) => (
                          <Chip
                            key={index}
                            label={`${threat.threat_name} (${threat.count})`}
                            color="error"
                            variant="outlined"
                            size="small"
                          />
                        ))}
                      </Box>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        No threats detected in the selected period
                      </Typography>
                    )}
                  </Paper>
                </Grid>
                
                {/* Additional Info */}
                <Grid item xs={12}>
                  <Paper sx={{ p: 3 }}>
                    <Typography variant="h6" gutterBottom>
                      Scanner Information
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                      <Chip 
                        label={`Engine: ${status?.version || 'Unknown'}`}
                        variant="outlined"
                        size="small"
                      />
                      <Chip 
                        label={`Mode: ${status?.mode || 'Unknown'}`}
                        variant="outlined" 
                        size="small"
                      />
                      <Chip 
                        label={`Status: ${isEnabled ? 'Enabled' : 'Disabled'}`}
                        color={isEnabled ? 'success' : 'default'}
                        size="small"
                      />
                      <Chip 
                        label={`Health: ${isHealthy ? 'Healthy' : 'Unhealthy'}`}
                        color={isHealthy ? 'success' : 'error'}
                        size="small"
                      />
                    </Box>
                    {lastUpdated && (
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
                        Last updated: {formatDateTime(lastUpdated)}
                      </Typography>
                    )}
                  </Paper>
                </Grid>
              </Grid>
            ) : (
              <Alert severity="info">
                No statistics available. Click "Refresh Statistics" to load data.
              </Alert>
            )}
          </Box>
        );

      default:
        return null;
    }
  };

  return (
    <Box>
      {/* Tab Navigation */}
      <Tabs
        value={activeTab}
        onChange={handleTabChange}
        indicatorColor="primary"
        textColor="primary"
        variant="scrollable"
        scrollButtons="auto"
        sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}
      >
        {tabs.map((tab, index) => (
          <Tab
            key={tab.id}
            icon={tab.icon}
            label={tab.label}
            iconPosition="start"
            sx={{ minHeight: 64 }}
          />
        ))}
      </Tabs>

      {/* Error Alert */}
      {error && (
        <Alert 
          severity="error" 
          sx={{ mb: 3 }}
          onClose={clearError}
          action={
            <Button onClick={refresh} size="small">
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {/* Tab Content */}
      {renderTabContent()}

      {/* Configuration Dialog */}
      <Dialog 
        open={configDialogOpen && !isEnvironmentDisabled} 
        onClose={handleConfigClose}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Scanner Configuration</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {status?.config && Object.entries(status.config).map(([key, config]) => {
              if (config.type === 'boolean') {
                return (
                  <FormControlLabel
                    key={key}
                    control={
                      <Switch
                        checked={configValues[key] || false}
                        onChange={(e) => handleConfigValueChange(key, e.target.checked)}
                      />
                    }
                    label={config.description || key}
                  />
                );
              } else if (config.type === 'integer') {
                return (
                  <TextField
                    key={key}
                    label={config.description || key}
                    type="number"
                    value={configValues[key] || ''}
                    onChange={(e) => handleConfigValueChange(key, parseInt(e.target.value) || 0)}
                    fullWidth
                    variant="outlined"
                  />
                );
              } else if (key === 'mode') {
                return (
                  <FormControl key={key} fullWidth>
                    <InputLabel>Scan Mode</InputLabel>
                    <Select
                      value={configValues[key] || 'async'}
                      onChange={(e) => handleConfigValueChange(key, e.target.value)}
                      label="Scan Mode"
                    >
                      <MenuItem value="sync">Synchronous</MenuItem>
                      <MenuItem value="async">Asynchronous</MenuItem>
                      <MenuItem value="disabled">Disabled</MenuItem>
                    </Select>
                  </FormControl>
                );
              } else {
                return (
                  <TextField
                    key={key}
                    label={config.description || key}
                    value={configValues[key] || ''}
                    onChange={(e) => handleConfigValueChange(key, e.target.value)}
                    fullWidth
                    variant="outlined"
                  />
                );
              }
            })}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleConfigClose}>Cancel</Button>
          <Button onClick={handleConfigSave} variant="contained" disabled={loading || isEnvironmentDisabled}>
            Save Configuration
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={handleSnackbarClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={handleSnackbarClose}
          severity={snackbar.severity}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default VirusScanningAdminTab;