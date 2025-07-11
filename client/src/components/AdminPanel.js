import React, { useState, useEffect, useCallback } from 'react';
import { adminAPI } from '../services/api';
import { formatDateTime } from '../utils/dateUtils';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TextField,
  InputAdornment,
  IconButton,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stack,
  Chip,
  Alert,
  Tooltip,
  Menu,
  MenuItem,
  Grid,
  Paper,
  LinearProgress,
  Skeleton,
  Tabs,
  Tab,
} from '@mui/material';
import {
  Search,
  AdminPanelSettings,
  Person,
  Storage,
  MoreVert,
  Edit,
  History,
  Refresh,
  SupervisorAccount,
  PersonOff,
  Security,
} from '@mui/icons-material';
import VirusScanningAdminTab from './VirusScanningAdminTab';
import LoginLogsAdminTab from './LoginLogsAdminTab';

const AdminPanel = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalUsers, setTotalUsers] = useState(0);
  const [selectedUser, setSelectedUser] = useState(null);
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [auditDialogOpen, setAuditDialogOpen] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [dashboardData, setDashboardData] = useState(null);
  const [quotaOverride, setQuotaOverride] = useState('');
  const [expirationOverride, setExpirationOverride] = useState('');
  const [anchorEl, setAnchorEl] = useState(null);
  const [menuUser, setMenuUser] = useState(null);

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getActionDescription = (actionType) => {
    const descriptions = {
      'quota_override': 'Disk Quota Override',
      'expiration_override': 'File Expiration Override', 
      'override_removal': 'Override Removal',
      'user_search': 'User Search',
      'users_list': 'Users List Access'
    };
    return descriptions[actionType] || actionType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const formatActionDetails = (actionDetails) => {
    if (!actionDetails) return null;
    
    if (typeof actionDetails === 'string') {
      return actionDetails;
    }
    
    try {
      const details = typeof actionDetails === 'object' ? actionDetails : JSON.parse(actionDetails);
      
      // Format specific action details in a user-friendly way
      if (details.new_quota_bytes) {
        return `Set quota to ${formatBytes(details.new_quota_bytes)}`;
      }
      if (details.new_expiration_days !== undefined) {
        return `Set file expiration to ${details.new_expiration_days} days`;
      }
      if (details.override_type) {
        return `Removed ${details.override_type.replace('_', ' ')} override`;
      }
      if (details.overrides_removed) {
        return `Removed ${details.overrides_removed} override(s)`;
      }
      
      // Default to JSON display for other details
      return JSON.stringify(details, null, 2);
    } catch (e) {
      return String(actionDetails);
    }
  };


  const loadDashboard = useCallback(async () => {
    try {
      const response = await adminAPI.getDashboard();
      setDashboardData(response.data);
    } catch (err) {
      console.error('Failed to load dashboard:', err);
      console.error('Dashboard error response:', err.response?.data);
    }
  }, []);

  const searchUsers = useCallback(async () => {
    try {
      setLoading(true);
      
      // Use the search term as-is, backend will handle empty searches
      const searchQuery = searchTerm || '';
      
      
      const response = await adminAPI.searchUsers({
        search: searchQuery,
        page: page + 1,
        limit: rowsPerPage
      });
      
      setUsers(response.data.users || []);
      setTotalUsers(response.data.total || 0);
      setError('');
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to search users';
      setError(errorMessage);
      console.error('Search users error:', err);
      console.error('Error response:', err.response?.data);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, page, rowsPerPage]);

  const handleOverrideSubmit = async () => {
    if (!selectedUser) return;

    try {
      const overrideData = {};
      if (quotaOverride) overrideData.quota_override = quotaOverride;
      if (expirationOverride) overrideData.expiration_override = expirationOverride;

      await adminAPI.setUserOverride(selectedUser.id, overrideData);
      setSuccess('User overrides updated successfully');
      setOverrideDialogOpen(false);
      setSelectedUser(null);
      setQuotaOverride('');
      setExpirationOverride('');
      await searchUsers();
    } catch (err) {
      setError('Failed to update user overrides');
      console.error('Override error:', err);
    }
  };

  const handleRemoveOverrides = async (userId) => {
    try {
      await adminAPI.removeUserOverride(userId);
      setSuccess('User overrides removed successfully');
      await searchUsers();
      handleMenuClose();
    } catch (err) {
      setError('Failed to remove user overrides');
      console.error('Remove override error:', err);
    }
  };

  const handleViewAudit = async (user) => {
    try {
      const response = await adminAPI.getUserAuditLog(user.id);
      setAuditLogs(response.data.logs || []);
      setSelectedUser(user); // Store user info for dialog title
      setAuditDialogOpen(true);
      handleMenuClose();
    } catch (err) {
      setError('Failed to load audit logs');
      console.error('Audit log error:', err);
    }
  };

  const handleMenuOpen = (event, user) => {
    setAnchorEl(event.currentTarget);
    setMenuUser(user);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setMenuUser(null);
  };

  const handleEditOverrides = (user) => {
    setSelectedUser(user);
    setQuotaOverride(user.quota_override || '');
    setExpirationOverride(user.expiration_override || '');
    setOverrideDialogOpen(true);
    handleMenuClose();
  };

  const handleRefresh = () => {
    searchUsers();
    loadDashboard();
  };

  useEffect(() => {
    searchUsers();
    loadDashboard();
  }, [page, rowsPerPage, searchUsers, loadDashboard]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setPage(0);
      searchUsers();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [searchTerm, searchUsers]);

  const getUsagePercentage = (used, quota) => {
    if (!quota || quota === 0) return 0;
    return Math.min((used / quota) * 100, 100);
  };

  const getUserStatusColor = (user) => {
    const usagePercent = getUsagePercentage(user.disk_used_bytes, user.effective_disk_quota);
    if (usagePercent >= 100) return 'error';
    if (usagePercent >= 80) return 'warning';
    return 'success';
  };

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  const tabs = [
    { label: 'User Management', icon: <Person />, id: 'users' },
    { label: 'Virus Scanning', icon: <Security />, id: 'virus-scanning' },
    { label: 'Login Logs', icon: <History />, id: 'login-logs' },
  ];

  return (
    <Box>
      <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <AdminPanelSettings color="primary" />
        Admin Panel
        <Tooltip title="Refresh data">
          <IconButton onClick={handleRefresh} size="small">
            <Refresh />
          </IconButton>
        </Tooltip>
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>
          {success}
        </Alert>
      )}

      {/* Tab Navigation */}
      <Tabs
        value={activeTab}
        onChange={handleTabChange}
        indicatorColor="primary"
        textColor="primary"
        sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}
      >
        {tabs.map((tab, index) => (
          <Tab
            key={tab.id}
            icon={tab.icon}
            label={tab.label}
            iconPosition="start"
            sx={{ minHeight: 56 }}
          />
        ))}
      </Tabs>

      {/* Tab Content */}
      {activeTab === 0 && (
        <Box>
          {/* Dashboard Overview */}
          <Grid container spacing={3} sx={{ mb: 3 }}>
            <Grid item xs={12} sm={6} md={3}>
              <Paper sx={{ p: 2, textAlign: 'center' }}>
                <Typography variant="h4" color="primary.main">
                  {dashboardData?.users?.total || 0}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Total Users
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Paper sx={{ p: 2, textAlign: 'center' }}>
                <Typography variant="h4" color="success.main">
                  {dashboardData?.files?.total || 0}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Total Files
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Paper sx={{ p: 2, textAlign: 'center' }}>
                <Typography variant="h4" color="info.main">
                  {(dashboardData?.shares?.traditional || 0) + (dashboardData?.shares?.anonymous || 0)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Total Shares
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Paper sx={{ p: 2, textAlign: 'center' }}>
                <Typography variant="h4" color="warning.main">
                  {dashboardData ? formatBytes(dashboardData.files?.storage_used_bytes || 0) : '0 Bytes'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Storage Used
                </Typography>
              </Paper>
            </Grid>
          </Grid>

          {/* User Management */}
          <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography variant="h6">User Management</Typography>
            <TextField
              placeholder="Search users..."
              variant="outlined"
              size="small"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search />
                  </InputAdornment>
                ),
              }}
              sx={{ minWidth: 300 }}
            />
          </Box>

          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>User</TableCell>
                  <TableCell>Role</TableCell>
                  <TableCell>Storage Usage</TableCell>
                  <TableCell>Files</TableCell>
                  <TableCell>Shares</TableCell>
                  <TableCell>Overrides</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  Array.from({ length: rowsPerPage }).map((_, index) => (
                    <TableRow key={index}>
                      <TableCell><Skeleton /></TableCell>
                      <TableCell><Skeleton /></TableCell>
                      <TableCell><Skeleton /></TableCell>
                      <TableCell><Skeleton /></TableCell>
                      <TableCell><Skeleton /></TableCell>
                      <TableCell><Skeleton /></TableCell>
                      <TableCell><Skeleton /></TableCell>
                    </TableRow>
                  ))
                ) : (
                  users.map((user) => {
                    const usagePercent = getUsagePercentage(user.disk_used_bytes, user.effective_disk_quota);
                    const statusColor = getUserStatusColor(user);
                    
                    return (
                      <TableRow key={user.id} hover>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Person color="primary" />
                            <Box>
                              <Typography variant="body2" fontWeight="medium">
                                {user.username}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {user.email}
                              </Typography>
                            </Box>
                          </Box>
                        </TableCell>
                        
                        <TableCell>
                          <Chip
                            label={user.role}
                            size="small"
                            color={user.role === 'admin' ? 'primary' : 'default'}
                            icon={user.role === 'admin' ? <SupervisorAccount /> : <Person />}
                          />
                        </TableCell>
                        
                        <TableCell>
                          <Box sx={{ minWidth: 120 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                              <Typography variant="body2">
                                {formatBytes(user.disk_used_bytes)}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                / {formatBytes(user.effective_disk_quota)}
                              </Typography>
                            </Box>
                            <LinearProgress
                              variant="determinate"
                              value={usagePercent}
                              color={statusColor}
                              sx={{ height: 4, borderRadius: 2 }}
                            />
                            <Typography variant="caption" color={`${statusColor}.main`}>
                              {usagePercent.toFixed(1)}%
                            </Typography>
                          </Box>
                        </TableCell>
                        
                        <TableCell>
                          <Typography variant="body2">
                            {user.file_count || 0}
                          </Typography>
                        </TableCell>
                        
                        <TableCell>
                          <Typography variant="body2">
                            {user.share_count || 0}
                          </Typography>
                        </TableCell>
                        
                        <TableCell>
                          <Stack direction="row" spacing={0.5}>
                            {user.quota_override && (
                              <Chip
                                label="Quota"
                                size="small"
                                color="info"
                                variant="outlined"
                              />
                            )}
                            {user.expiration_override && (
                              <Chip
                                label="Expiry"
                                size="small"
                                color="info"
                                variant="outlined"
                              />
                            )}
                          </Stack>
                        </TableCell>
                        
                        <TableCell>
                          <IconButton
                            size="small"
                            onClick={(e) => handleMenuOpen(e, user)}
                          >
                            <MoreVert />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <TablePagination
            component="div"
            count={totalUsers}
            page={page}
            onPageChange={(e, newPage) => setPage(newPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(parseInt(e.target.value, 10));
              setPage(0);
            }}
          />
        </CardContent>
      </Card>
        </Box>
      )}

      {activeTab === 1 && (
        <VirusScanningAdminTab />
      )}

      {activeTab === 2 && (
        <LoginLogsAdminTab />
      )}

      {/* User Actions Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={() => handleEditOverrides(menuUser)}>
          <Edit sx={{ mr: 1 }} fontSize="small" />
          Edit Overrides
        </MenuItem>
        <MenuItem onClick={() => handleViewAudit(menuUser)}>
          <History sx={{ mr: 1 }} fontSize="small" />
          View Audit Log
        </MenuItem>
        {(menuUser?.quota_override || menuUser?.expiration_override) && (
          <MenuItem onClick={() => handleRemoveOverrides(menuUser?.id)}>
            <PersonOff sx={{ mr: 1 }} fontSize="small" />
            Remove Overrides
          </MenuItem>
        )}
      </Menu>

      {/* Override Dialog */}
      <Dialog open={overrideDialogOpen} onClose={() => setOverrideDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          Edit User Overrides - {selectedUser?.username}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ mt: 1 }}>
            <TextField
              label="Quota Override (bytes)"
              type="number"
              value={quotaOverride}
              onChange={(e) => setQuotaOverride(e.target.value)}
              fullWidth
              variant="outlined"
              placeholder="Leave empty to use default quota"
              helperText="Override the user's disk quota. Leave empty to use system default."
              InputProps={{
                startAdornment: <Storage sx={{ color: 'text.secondary', mr: 1 }} />
              }}
            />
            
            <TextField
              label="Expiration Override (days)"
              type="number"
              value={expirationOverride}
              onChange={(e) => setExpirationOverride(e.target.value)}
              fullWidth
              variant="outlined"
              placeholder="Leave empty to use default expiration"
              helperText="Override the file expiration period for this user. Leave empty to use system default."
              inputProps={{ min: 1 }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOverrideDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleOverrideSubmit} variant="contained">
            Update Overrides
          </Button>
        </DialogActions>
      </Dialog>

      {/* Audit Log Dialog */}
      <Dialog 
        open={auditDialogOpen} 
        onClose={() => {
          setAuditDialogOpen(false);
          setAuditLogs([]);
        }} 
        maxWidth="md" 
        fullWidth
      >
        <DialogTitle>
          User Audit Log - {selectedUser?.username || 'Unknown User'}
        </DialogTitle>
        <DialogContent>
          {auditLogs.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
              No administrative actions have been performed on this user yet.
              <br />
              Actions like quota overrides, expiration changes, and other admin modifications will appear here.
            </Typography>
          ) : (
            <Stack spacing={2}>
              {auditLogs.map((log, index) => (
                <Paper key={index} sx={{ p: 2, bgcolor: 'background.default' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                    <Typography variant="subtitle2" color="primary.main">
                      {getActionDescription(log.action_type)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {formatDateTime(log.timestamp)}
                    </Typography>
                  </Box>
                  {log.action_details && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                      {formatActionDetails(log.action_details)}
                    </Typography>
                  )}
                  {log.admin_username && (
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                      Performed by: {log.admin_username}
                    </Typography>
                  )}
                </Paper>
              ))}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAuditDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AdminPanel;