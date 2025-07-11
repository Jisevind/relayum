import React, { useState, useEffect } from 'react';
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TablePagination,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Typography,
  Grid,
  Card,
  CardContent,
  IconButton,
  Tooltip,
  Stack,
  Alert,
  CircularProgress,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
  Snackbar,
} from '@mui/material';
import {
  Security,
  CheckCircle,
  Cancel,
  Search,
  Refresh,
  Computer,
  Person,
  Schedule,
  Block,
  VpnLock,
  Warning,
  Gavel,
  Timer,
} from '@mui/icons-material';
import { adminAPI } from '../services/api';
import { formatDateTime } from '../utils/dateUtils';

/**
 * Login Logs Admin Tab - Shows authentication attempts with filtering and pagination
 */
const LoginLogsAdminTab = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pagination, setPagination] = useState({
    page: 0,
    limit: 25,
    total: 0,
    pages: 0
  });
  
  // Filters
  const [filters, setFilters] = useState({
    success: '', // '', 'true', 'false'
    username: '',
    ip: '',
    start_date: '',
    end_date: ''
  });
  
  // Statistics
  const [stats, setStats] = useState({
    total: 0,
    successful: 0,
    failed: 0,
    todayCount: 0,
    bannedIPs: 0
  });

  // Ban management state
  const [banDialog, setBanDialog] = useState({
    open: false,
    ip: '',
    reason: '',
    expiresAt: ''
  });
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    action: '',
    ip: '',
    message: ''
  });
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success'
  });
  const [banSettings, setBanSettings] = useState({
    attempt_limit: 5,
    block_duration_minutes: 15
  });

  const fetchLoginLogs = async (page = 0, limit = 25) => {
    try {
      setLoading(true);
      const params = {
        page: page + 1, // API expects 1-based page
        limit,
        ...filters
      };
      
      // Remove empty filters
      Object.keys(params).forEach(key => {
        if (params[key] === '') {
          delete params[key];
        }
      });
      
      const response = await adminAPI.getLoginLogs(params);
      setLogs(response.data.logs);
      setPagination({
        page,
        limit,
        total: response.data.pagination.total,
        pages: response.data.pagination.pages
      });
      
      // Calculate statistics
      const totalSuccessful = response.data.logs.filter(log => log.successful).length;
      const totalFailed = response.data.logs.filter(log => !log.successful).length;
      const today = new Date().toISOString().split('T')[0];
      const todayCount = response.data.logs.filter(log => 
        log.attempt_time.startsWith(today)
      ).length;
      const bannedIPs = new Set(response.data.logs.filter(log => log.is_currently_banned).map(log => log.ip_address)).size;
      
      setStats({
        total: response.data.pagination.total,
        successful: totalSuccessful,
        failed: totalFailed,
        todayCount,
        bannedIPs
      });

      // Update ban settings if provided
      if (response.data.ban_settings) {
        setBanSettings(response.data.ban_settings);
      }
      
    } catch (err) {
      console.error('Failed to fetch login logs:', err);
      setError('Failed to load login logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLoginLogs();
  }, []);

  const handlePageChange = (event, newPage) => {
    fetchLoginLogs(newPage, pagination.limit);
  };

  const handleRowsPerPageChange = (event) => {
    const newLimit = parseInt(event.target.value, 10);
    fetchLoginLogs(0, newLimit);
  };

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSearch = () => {
    fetchLoginLogs(0, pagination.limit);
  };

  const handleRefresh = () => {
    fetchLoginLogs(pagination.page, pagination.limit);
  };

  const getStatusIcon = (successful) => {
    return successful ? (
      <CheckCircle color="success" />
    ) : (
      <Cancel color="error" />
    );
  };

  const getStatusChip = (successful) => {
    return (
      <Chip
        icon={getStatusIcon(successful)}
        label={successful ? 'Success' : 'Failed'}
        color={successful ? 'success' : 'error'}
        size="small"
      />
    );
  };

  const getUserRole = (role) => {
    if (!role) return 'N/A';
    return role === 'admin' ? (
      <Chip label="Admin" color="secondary" size="small" />
    ) : (
      <Chip label="User" color="default" size="small" />
    );
  };

  const truncateUserAgent = (userAgent) => {
    if (!userAgent) return 'N/A';
    const maxLength = 50;
    return userAgent.length > maxLength 
      ? userAgent.substring(0, maxLength) + '...'
      : userAgent;
  };

  // Ban management functions
  const handleBanIp = (ipAddress) => {
    setBanDialog({
      open: true,
      ip: ipAddress,
      reason: '',
      expiresAt: ''
    });
  };

  const handleUnbanIp = (ipAddress) => {
    setConfirmDialog({
      open: true,
      action: 'unban',
      ip: ipAddress,
      message: `Are you sure you want to unban IP address ${ipAddress}?`
    });
  };

  const handleBanDialogClose = () => {
    setBanDialog({
      open: false,
      ip: '',
      reason: '',
      expiresAt: ''
    });
  };

  const handleConfirmDialogClose = () => {
    setConfirmDialog({
      open: false,
      action: '',
      ip: '',
      message: ''
    });
  };

  const handleSnackbarClose = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  const executeBan = async () => {
    try {
      await adminAPI.banIp(banDialog.ip, banDialog.reason, banDialog.expiresAt);
      setSnackbar({
        open: true,
        message: `IP address ${banDialog.ip} has been banned successfully`,
        severity: 'success'
      });
      handleBanDialogClose();
      handleRefresh(); // Refresh the logs to show updated ban status
    } catch (error) {
      setSnackbar({
        open: true,
        message: `Failed to ban IP address: ${error.response?.data?.error || error.message}`,
        severity: 'error'
      });
    }
  };

  const executeUnban = async () => {
    try {
      await adminAPI.unbanIp(confirmDialog.ip);
      setSnackbar({
        open: true,
        message: `IP address ${confirmDialog.ip} has been unbanned successfully`,
        severity: 'success'
      });
      handleConfirmDialogClose();
      handleRefresh(); // Refresh the logs to show updated ban status
    } catch (error) {
      setSnackbar({
        open: true,
        message: `Failed to unban IP address: ${error.response?.data?.error || error.message}`,
        severity: 'error'
      });
    }
  };

  const getBanStatusChip = (log) => {
    if (log.is_manually_banned && log.is_auto_banned) {
      return (
        <Chip
          icon={<Block />}
          label="Banned (Both)"
          color="error"
          size="small"
          variant="filled"
        />
      );
    } else if (log.is_manually_banned) {
      return (
        <Chip
          icon={<Gavel />}
          label="Manually Banned"
          color="error"
          size="small"
          variant="filled"
        />
      );
    } else if (log.is_auto_banned) {
      return (
        <Chip
          icon={<Timer />}
          label="Auto-Banned"
          color="warning"
          size="small"
          variant="filled"
        />
      );
    } else {
      return (
        <Chip
          label="Active"
          color="success"
          size="small"
          variant="outlined"
        />
      );
    }
  };

  if (loading && logs.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Stack spacing={3}>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h5" component="h2">
            Login Logs
          </Typography>
          <Tooltip title="Refresh">
            <IconButton onClick={handleRefresh} disabled={loading}>
              <Refresh />
            </IconButton>
          </Tooltip>
        </Box>

        {/* Statistics Cards */}
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={2.4}>
            <Card>
              <CardContent sx={{ textAlign: 'center' }}>
                <Security sx={{ fontSize: 40, color: 'primary.main', mb: 1 }} />
                <Typography variant="h6">{stats.total}</Typography>
                <Typography variant="body2" color="text.secondary">
                  Total Attempts
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={2.4}>
            <Card>
              <CardContent sx={{ textAlign: 'center' }}>
                <CheckCircle sx={{ fontSize: 40, color: 'success.main', mb: 1 }} />
                <Typography variant="h6">{stats.successful}</Typography>
                <Typography variant="body2" color="text.secondary">
                  Successful
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={2.4}>
            <Card>
              <CardContent sx={{ textAlign: 'center' }}>
                <Cancel sx={{ fontSize: 40, color: 'error.main', mb: 1 }} />
                <Typography variant="h6">{stats.failed}</Typography>
                <Typography variant="body2" color="text.secondary">
                  Failed
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={2.4}>
            <Card>
              <CardContent sx={{ textAlign: 'center' }}>
                <Schedule sx={{ fontSize: 40, color: 'info.main', mb: 1 }} />
                <Typography variant="h6">{stats.todayCount}</Typography>
                <Typography variant="body2" color="text.secondary">
                  Today
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={2.4}>
            <Card>
              <CardContent sx={{ textAlign: 'center' }}>
                <VpnLock sx={{ fontSize: 40, color: 'warning.main', mb: 1 }} />
                <Typography variant="h6">{stats.bannedIPs}</Typography>
                <Typography variant="body2" color="text.secondary">
                  Banned IPs
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Filters */}
        <Paper sx={{ p: 2 }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={6} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Status</InputLabel>
                <Select
                  value={filters.success}
                  onChange={(e) => handleFilterChange('success', e.target.value)}
                  label="Status"
                >
                  <MenuItem value="">All</MenuItem>
                  <MenuItem value="true">Success</MenuItem>
                  <MenuItem value="false">Failed</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <TextField
                fullWidth
                size="small"
                label="Username"
                value={filters.username}
                onChange={(e) => handleFilterChange('username', e.target.value)}
                placeholder="Search username..."
              />
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <TextField
                fullWidth
                size="small"
                label="IP Address"
                value={filters.ip}
                onChange={(e) => handleFilterChange('ip', e.target.value)}
                placeholder="Search IP..."
              />
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <TextField
                fullWidth
                size="small"
                label="Start Date"
                type="date"
                value={filters.start_date}
                onChange={(e) => handleFilterChange('start_date', e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <TextField
                fullWidth
                size="small"
                label="End Date"
                type="date"
                value={filters.end_date}
                onChange={(e) => handleFilterChange('end_date', e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <IconButton 
                onClick={handleSearch} 
                disabled={loading}
                sx={{ 
                  bgcolor: 'primary.main', 
                  color: 'white',
                  '&:hover': { bgcolor: 'primary.dark' }
                }}
              >
                <Search />
              </IconButton>
            </Grid>
          </Grid>
        </Paper>

        {error && (
          <Alert severity="error" onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        {/* Logs Table */}
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Timestamp</TableCell>
                <TableCell>Username</TableCell>
                <TableCell>IP Address</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Ban Status</TableCell>
                <TableCell>User Role</TableCell>
                <TableCell>User Agent</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Schedule fontSize="small" color="action" />
                      {formatDateTime(log.attempt_time)}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Person fontSize="small" color="action" />
                      {log.username || 'N/A'}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Computer fontSize="small" color="action" />
                      {log.ip_address}
                    </Box>
                  </TableCell>
                  <TableCell>
                    {getStatusChip(log.successful)}
                  </TableCell>
                  <TableCell>
                    {getBanStatusChip(log)}
                  </TableCell>
                  <TableCell>
                    {getUserRole(log.user_role)}
                  </TableCell>
                  <TableCell>
                    <Tooltip title={log.user_agent || 'N/A'}>
                      <span>{truncateUserAgent(log.user_agent)}</span>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      {log.is_currently_banned ? (
                        <Tooltip title="Unban IP">
                          <Button
                            size="small"
                            variant="outlined"
                            color="success"
                            onClick={() => handleUnbanIp(log.ip_address)}
                            startIcon={<CheckCircle />}
                          >
                            Unban
                          </Button>
                        </Tooltip>
                      ) : (
                        <Tooltip title="Ban IP">
                          <Button
                            size="small"
                            variant="outlined"
                            color="error"
                            onClick={() => handleBanIp(log.ip_address)}
                            startIcon={<Block />}
                          >
                            Ban
                          </Button>
                        </Tooltip>
                      )}
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {logs.length === 0 && !loading && (
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <Typography variant="body1" color="text.secondary">
                No login logs found
              </Typography>
            </Box>
          )}
        </TableContainer>

        {/* Pagination */}
        <TablePagination
          rowsPerPageOptions={[10, 25, 50, 100]}
          component="div"
          count={pagination.total}
          rowsPerPage={pagination.limit}
          page={pagination.page}
          onPageChange={handlePageChange}
          onRowsPerPageChange={handleRowsPerPageChange}
        />
      </Stack>

      {/* Ban IP Dialog */}
      <Dialog open={banDialog.open} onClose={handleBanDialogClose} maxWidth="sm" fullWidth>
        <DialogTitle>Ban IP Address</DialogTitle>
        <DialogContent>
          <DialogContentText>
            You are about to ban IP address <strong>{banDialog.ip}</strong>. This will prevent any login attempts from this IP address.
          </DialogContentText>
          <Stack spacing={2} sx={{ mt: 2 }}>
            <TextField
              label="Reason"
              multiline
              rows={3}
              fullWidth
              value={banDialog.reason}
              onChange={(e) => setBanDialog({ ...banDialog, reason: e.target.value })}
              placeholder="Enter reason for banning this IP address..."
            />
            <TextField
              label="Expires At (Optional)"
              type="datetime-local"
              fullWidth
              value={banDialog.expiresAt}
              onChange={(e) => setBanDialog({ ...banDialog, expiresAt: e.target.value })}
              InputLabelProps={{
                shrink: true,
              }}
              helperText="Leave empty for permanent ban"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleBanDialogClose}>Cancel</Button>
          <Button onClick={executeBan} variant="contained" color="error">
            Ban IP
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirm Dialog */}
      <Dialog open={confirmDialog.open} onClose={handleConfirmDialogClose}>
        <DialogTitle>Confirm Action</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {confirmDialog.message}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleConfirmDialogClose}>Cancel</Button>
          <Button 
            onClick={confirmDialog.action === 'unban' ? executeUnban : () => {}} 
            variant="contained" 
            color="primary"
          >
            Confirm
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
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default LoginLogsAdminTab;