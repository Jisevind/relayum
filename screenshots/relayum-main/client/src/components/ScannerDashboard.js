import React from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Switch,
  FormControlLabel,
  Button,
  Chip,
  Alert,
  IconButton,
  Tooltip,
  LinearProgress,
  Divider,
  Stack,
} from '@mui/material';
import {
  Security,
  Warning,
  CheckCircle,
  Error as ErrorIcon,
  Refresh,
  BugReport,
  Update,
  NoEncryption,
} from '@mui/icons-material';
import { formatDateTime } from '../utils/dateUtils';

/**
 * Scanner Dashboard component showing status overview and quick controls
 */
const ScannerDashboard = ({
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
  onToggleScanner,
  onTestScanner,
  onRefresh,
  onConfigOpen,
}) => {
  const getStatusIcon = () => {
    if (!isEnabled) return <NoEncryption fontSize="large" color="disabled" />;
    if (error) return <ErrorIcon fontSize="large" color="error" />;
    if (!isAvailable) return <Warning fontSize="large" color="warning" />;
    if (isHealthy) return <CheckCircle fontSize="large" color="success" />;
    return <Security fontSize="large" color="primary" />;
  };

  const getStatusDescription = () => {
    if (isEnvironmentDisabled) return 'Virus scanning is disabled via environment configuration. Controls are not available.';
    if (!isEnabled) return 'Virus scanning is currently disabled. Files are uploaded without scanning.';
    if (error) return `Scanner error: ${error}`;
    if (!isAvailable) return 'Scanner is enabled but ClamAV service is unavailable. Files upload with "unavailable" status.';
    if (isHealthy) return 'Scanner is active and protecting your files.';
    return 'Scanner status unknown.';
  };


  const formatDuration = (ms) => {
    if (!ms) return '0ms';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Status Overview Card */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6" sx={{ flexGrow: 1 }}>
                Scanner Status
              </Typography>
              <Tooltip title={isEnvironmentDisabled ? "Disabled via environment configuration" : "Refresh status"}>
                <span>
                  <IconButton onClick={onRefresh} size="small" disabled={loading || isEnvironmentDisabled}>
                    <Refresh />
                  </IconButton>
                </span>
              </Tooltip>
            </Box>
            
            {loading && <LinearProgress sx={{ mb: 2 }} />}
            
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              {getStatusIcon()}
              <Box sx={{ ml: 2 }}>
                <Typography variant="h5" fontWeight="bold">
                  {statusText}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {getStatusDescription()}
                </Typography>
              </Box>
            </Box>

            <Divider sx={{ my: 2 }} />

            <Stack spacing={2}>
              <FormControlLabel
                control={
                  <Switch
                    checked={isEnabled}
                    onChange={onToggleScanner}
                    disabled={loading || isEnvironmentDisabled}
                    color="primary"
                  />
                }
                label={isEnvironmentDisabled ? "Enable Virus Scanning (Environment Disabled)" : "Enable Virus Scanning"}
              />

              {isEnvironmentDisabled && (
                <Alert severity="info" size="small">
                  Virus scanning is disabled via environment configuration (ENABLE_VIRUS_SCANNING=false). 
                  Update your environment settings to enable controls.
                </Alert>
              )}

              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<BugReport />}
                  onClick={onTestScanner}
                  disabled={loading || !isEnabled || isEnvironmentDisabled}
                >
                  Test Scanner
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<Update />}
                  onClick={onConfigOpen}
                  disabled={loading || isEnvironmentDisabled}
                >
                  Configuration
                </Button>
              </Box>
            </Stack>

            {status?.version && (
              <Box sx={{ mt: 2, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  Engine Version: {status.version}
                </Typography>
                {status.status?.lastHealthCheck && (
                  <>
                    <br />
                    <Typography variant="caption" color="text.secondary">
                      Last Health Check: {formatDateTime(status.status.lastHealthCheck)}
                    </Typography>
                  </>
                )}
              </Box>
            )}
          </Paper>
        </Grid>

        {/* Quick Statistics Card */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" gutterBottom>
              Scanning Statistics
            </Typography>
            
            {statistics?.summary ? (
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="h4" color="primary.main">
                      {statistics.summary.total_scans || 0}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Total Scans
                    </Typography>
                  </Box>
                </Grid>
                
                <Grid item xs={6}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="h4" color="success.main">
                      {statistics.summary.clean_files || 0}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Clean Files
                    </Typography>
                  </Box>
                </Grid>
                
                <Grid item xs={6}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="h4" color="error.main">
                      {statistics.summary.infected_files || 0}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Threats Detected
                    </Typography>
                  </Box>
                </Grid>
                
                <Grid item xs={6}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="h4" color="warning.main">
                      {statistics.summary.scan_errors || 0}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Scan Errors
                    </Typography>
                  </Box>
                </Grid>

                {statistics.summary.avg_scan_time && (
                  <Grid item xs={12}>
                    <Divider sx={{ my: 1 }} />
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="body2" color="text.secondary">
                        Average Scan Time:
                      </Typography>
                      <Chip 
                        label={formatDuration(statistics.summary.avg_scan_time)}
                        size="small"
                        variant="outlined"
                      />
                    </Box>
                  </Grid>
                )}
              </Grid>
            ) : (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography variant="body2" color="text.secondary">
                  {loading ? 'Loading statistics...' : 'No scanning statistics available'}
                </Typography>
              </Box>
            )}

            {lastUpdated && (
              <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                <Typography variant="caption" color="text.secondary">
                  Last updated: {formatDateTime(lastUpdated)}
                </Typography>
              </Box>
            )}
          </Paper>
        </Grid>

        {/* System Information Card */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              System Information
            </Typography>
            
            <Grid container spacing={3}>
              {status?.status && (
                <Grid item xs={12} sm={6} md={3}>
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">
                      Scan Mode
                    </Typography>
                    <Typography variant="body1">
                      {status.status.mode || 'Unknown'}
                    </Typography>
                  </Box>
                </Grid>
              )}
              
              {status?.status && (
                <Grid item xs={12} sm={6} md={3}>
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">
                      Required
                    </Typography>
                    <Chip 
                      label={status.status.required ? 'Yes' : 'No'} 
                      size="small"
                      color={status.status.required ? 'error' : 'default'}
                      variant="outlined"
                    />
                  </Box>
                </Grid>
              )}
              
              {status?.status?.host && (
                <Grid item xs={12} sm={6} md={3}>
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">
                      ClamAV Host
                    </Typography>
                    <Typography variant="body1">
                      {status.status.host}:{status.status.port}
                    </Typography>
                  </Box>
                </Grid>
              )}
              
              {statistics?.summary?.quarantined_files !== undefined && (
                <Grid item xs={12} sm={6} md={3}>
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">
                      Quarantined Files
                    </Typography>
                    <Typography variant="body1">
                      {statistics.summary.quarantined_files}
                    </Typography>
                  </Box>
                </Grid>
              )}
            </Grid>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default ScannerDashboard;