import React, { useState, useEffect, useCallback } from 'react';
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
  Button,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Snackbar,
  IconButton,
  Grid,
  Paper,
  Tabs,
  Tab,
  LinearProgress,
  Stack,
  Tooltip,
  Checkbox,
  Menu,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import {
  Security,
  BugReport,
  History,
  Delete,
  CheckCircle,
  Cancel,
  MoreVert,
  Refresh,
  Download,
  FilterList,
  Warning,
  Analytics,
  TrendingUp,
  Block,
  Visibility,
} from '@mui/icons-material';

const ThreatsQuarantineTab = () => {
  const [activeTab, setActiveTab] = useState(0);

  // Helper function to format file sizes
  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };
  const [loading, setLoading] = useState(false);
  const [threats, setThreats] = useState([]);
  const [quarantineFiles, setQuarantineFiles] = useState([]);
  const [scanHistory, setScanHistory] = useState([]);
  const [threatAnalysis, setThreatAnalysis] = useState(null);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [bulkActionMenu, setBulkActionMenu] = useState(null);
  const [detailsDialog, setDetailsDialog] = useState({ open: false, item: null });
  const [actionDialog, setActionDialog] = useState({ open: false, item: null, action: '' });
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [filters, setFilters] = useState({
    status: '',
    timeRange: 30,
    threatType: ''
  });
  const [pagination, setPagination] = useState({ total: 0, pages: 0 });

  const API_BASE_URL = process.env.REACT_APP_API_URL || '';

  // Load data based on active tab
  useEffect(() => {
    loadData();
  }, [activeTab, page, rowsPerPage, filters]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      switch (activeTab) {
        case 0: // Threat Analysis
          await loadThreatAnalysis();
          break;
        case 1: // Quarantine Files
          await loadQuarantineFiles();
          break;
        case 2: // Scan History
          await loadScanHistory();
          break;
        default:
          break;
      }
    } catch (error) {
      showSnackbar('Failed to load data', 'error');
    } finally {
      setLoading(false);
    }
  }, [activeTab, page, rowsPerPage, filters]);

  const loadThreatAnalysis = async () => {
    const params = new URLSearchParams({
      days: filters.timeRange
    });
    
    const response = await fetch(`${API_BASE_URL}/api/admin/virus-scanning/threats?${params}`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    
    if (!response.ok) throw new Error('Failed to load threat analysis');
    
    const data = await response.json();
    setThreatAnalysis(data);
  };

  const loadQuarantineFiles = async () => {
    const params = new URLSearchParams({
      page: page + 1,
      limit: rowsPerPage,
      ...(filters.status && { status: filters.status })
    });
    
    const response = await fetch(`${API_BASE_URL}/api/admin/virus-scanning/quarantine?${params}`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    
    if (!response.ok) throw new Error('Failed to load quarantine files');
    
    const data = await response.json();
    setQuarantineFiles(data.files);
    setPagination(data.pagination);
  };

  const loadScanHistory = async () => {
    const params = new URLSearchParams({
      page: page + 1,
      limit: rowsPerPage,
      days: filters.timeRange,
      ...(filters.status && { status: filters.status })
    });
    
    const response = await fetch(`${API_BASE_URL}/api/admin/virus-scanning/scan-history?${params}`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    
    if (!response.ok) throw new Error('Failed to load scan history');
    
    const data = await response.json();
    setScanHistory(data.scans);
    setPagination(data.pagination);
  };

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
    setPage(0);
    setSelectedItems(new Set());
  };

  const handleItemSelect = (id) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedItems(newSelected);
  };

  const handleSelectAll = (event) => {
    if (event.target.checked) {
      const allIds = new Set(quarantineFiles.map(file => file.id));
      setSelectedItems(allIds);
    } else {
      setSelectedItems(new Set());
    }
  };

  const handleQuarantineAction = async (id, action, notes = '') => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/virus-scanning/quarantine/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ status: action, notes })
      });
      
      if (!response.ok) throw new Error('Failed to update quarantine file');
      
      showSnackbar('Quarantine file updated successfully', 'success');
      loadData();
    } catch (error) {
      showSnackbar('Failed to update quarantine file', 'error');
    }
  };

  const handleBulkAction = async (action) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/virus-scanning/quarantine/bulk-update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ 
          ids: Array.from(selectedItems), 
          status: action 
        })
      });
      
      if (!response.ok) throw new Error('Failed to bulk update quarantine files');
      
      showSnackbar('Quarantine files updated successfully', 'success');
      setSelectedItems(new Set());
      loadData();
    } catch (error) {
      showSnackbar('Failed to bulk update quarantine files', 'error');
    }
  };

  const handleDeleteQuarantine = async (id) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/virus-scanning/quarantine/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (!response.ok) throw new Error('Failed to delete quarantine file');
      
      showSnackbar('Quarantine file deleted successfully', 'success');
      loadData();
    } catch (error) {
      showSnackbar('Failed to delete quarantine file', 'error');
    }
  };

  const showSnackbar = (message, severity = 'success') => {
    setSnackbar({ open: true, message, severity });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'infected': return 'error';
      case 'quarantined': return 'warning';
      case 'clean': return 'success';
      case 'confirmed_threat': return 'error';
      case 'false_positive': return 'success';
      case 'deleted': return 'default';
      default: return 'default';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'infected': return <BugReport />;
      case 'quarantined': return <Warning />;
      case 'clean': return <CheckCircle />;
      case 'confirmed_threat': return <Block />;
      case 'false_positive': return <CheckCircle />;
      case 'deleted': return <Delete />;
      default: return <Visibility />;
    }
  };

  const renderThreatAnalysis = () => (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h6">Threat Analysis</Typography>
        <Stack direction="row" spacing={2}>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Time Range</InputLabel>
            <Select
              value={filters.timeRange}
              label="Time Range"
              onChange={(e) => setFilters(prev => ({ ...prev, timeRange: e.target.value }))}
            >
              <MenuItem value={7}>Last 7 Days</MenuItem>
              <MenuItem value={30}>Last 30 Days</MenuItem>
              <MenuItem value={90}>Last 90 Days</MenuItem>
            </Select>
          </FormControl>
          <Button
            startIcon={<Refresh />}
            onClick={() => loadData()}
            variant="outlined"
            size="small"
          >
            Refresh
          </Button>
        </Stack>
      </Box>

      {loading && <LinearProgress sx={{ mb: 3 }} />}

      {threatAnalysis && (
        <Grid container spacing={3}>
          {/* Threat Statistics */}
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Analytics />
                  Threat Statistics
                </Typography>
                
                {threatAnalysis.threatStats.length > 0 ? (
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Threat Name</TableCell>
                          <TableCell align="right">Count</TableCell>
                          <TableCell>Last Detected</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {threatAnalysis.threatStats.map((threat, index) => (
                          <TableRow key={index}>
                            <TableCell>
                              <Chip
                                label={threat.threat_name}
                                size="small"
                                color="error"
                                icon={<BugReport />}
                              />
                            </TableCell>
                            <TableCell align="right">
                              <Typography variant="body2" fontWeight="bold">
                                {threat.count}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" color="text.secondary">
                                {formatDateTime(threat.last_detected)}
                              </Typography>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                ) : (
                  <Alert severity="success">No threats detected in the selected time period</Alert>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Threat Trends */}
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <TrendingUp />
                  Threat Trends
                </Typography>
                
                {threatAnalysis.threatTrends.length > 0 ? (
                  <Box>
                    {threatAnalysis.threatTrends.slice(0, 7).map((trend, index) => (
                      <Box key={index} sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                        <Typography variant="body2">
                          {new Date(trend.date).toLocaleDateString()}
                        </Typography>
                        <Typography variant="body2" color="error.main">
                          {trend.threat_count} threats ({trend.unique_threats} unique)
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                ) : (
                  <Alert severity="success">No threat trends in the selected time period</Alert>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Recent Threats */}
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Security />
                  Recent Threats
                </Typography>
                
                {threatAnalysis.recentThreats.length > 0 ? (
                  <TableContainer>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell>File Name</TableCell>
                          <TableCell>Threat Name</TableCell>
                          <TableCell>Uploader</TableCell>
                          <TableCell>Detected</TableCell>
                          <TableCell>Actions</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {threatAnalysis.recentThreats.map((threat) => (
                          <TableRow key={threat.id}>
                            <TableCell>{threat.file_name}</TableCell>
                            <TableCell>
                              <Chip
                                label={threat.threat_name}
                                size="small"
                                color="error"
                                icon={<BugReport />}
                              />
                            </TableCell>
                            <TableCell>{threat.uploader_username || 'Unknown'}</TableCell>
                            <TableCell>{formatDateTime(threat.scanned_at)}</TableCell>
                            <TableCell>
                              <Button
                                size="small"
                                onClick={() => setDetailsDialog({ open: true, item: threat })}
                              >
                                Details
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                ) : (
                  <Alert severity="success">No recent threats detected</Alert>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}
    </Box>
  );

  const renderQuarantineFiles = () => (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h6">Quarantine Files</Typography>
        <Stack direction="row" spacing={2}>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Status</InputLabel>
            <Select
              value={filters.status}
              label="Status"
              onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="quarantined">Quarantined</MenuItem>
              <MenuItem value="confirmed_threat">Confirmed Threat</MenuItem>
              <MenuItem value="false_positive">False Positive</MenuItem>
            </Select>
          </FormControl>
          {selectedItems.size > 0 && (
            <Button
              startIcon={<MoreVert />}
              onClick={(e) => setBulkActionMenu(e.currentTarget)}
              variant="outlined"
            >
              Bulk Actions ({selectedItems.size})
            </Button>
          )}
          <Button
            startIcon={<Refresh />}
            onClick={() => loadData()}
            variant="outlined"
            size="small"
          >
            Refresh
          </Button>
        </Stack>
      </Box>

      {loading && <LinearProgress sx={{ mb: 3 }} />}

      <Card>
        <CardContent>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      indeterminate={selectedItems.size > 0 && selectedItems.size < quarantineFiles.length}
                      checked={quarantineFiles.length > 0 && selectedItems.size === quarantineFiles.length}
                      onChange={handleSelectAll}
                    />
                  </TableCell>
                  <TableCell>File Name</TableCell>
                  <TableCell>Threat</TableCell>
                  <TableCell>Uploader</TableCell>
                  <TableCell>Quarantined</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {quarantineFiles.map((file) => (
                  <TableRow key={file.id}>
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={selectedItems.has(file.id)}
                        onChange={() => handleItemSelect(file.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{file.original_filename}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {file.file_size && formatFileSize(file.file_size)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={file.threat_name}
                        size="small"
                        color="error"
                        icon={<BugReport />}
                      />
                    </TableCell>
                    <TableCell>{file.uploader_username || 'Unknown'}</TableCell>
                    <TableCell>{formatDateTime(file.quarantined_at)}</TableCell>
                    <TableCell>
                      <Chip
                        label={file.status}
                        size="small"
                        color={getStatusColor(file.status)}
                        icon={getStatusIcon(file.status)}
                      />
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={1}>
                        <Button
                          size="small"
                          onClick={() => setDetailsDialog({ open: true, item: file })}
                        >
                          Details
                        </Button>
                        {file.status === 'quarantined' && (
                          <>
                            <Button
                              size="small"
                              color="success"
                              onClick={() => handleQuarantineAction(file.id, 'false_positive')}
                            >
                              False Positive
                            </Button>
                            <Button
                              size="small"
                              color="error"
                              onClick={() => handleQuarantineAction(file.id, 'confirmed_threat')}
                            >
                              Confirm Threat
                            </Button>
                          </>
                        )}
                        <Button
                          size="small"
                          color="error"
                          onClick={() => handleDeleteQuarantine(file.id)}
                        >
                          Delete
                        </Button>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          
          <TablePagination
            component="div"
            count={pagination.total}
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
  );

  const renderScanHistory = () => (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h6">Scan History</Typography>
        <Stack direction="row" spacing={2}>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Status</InputLabel>
            <Select
              value={filters.status}
              label="Status"
              onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="clean">Clean</MenuItem>
              <MenuItem value="infected">Infected</MenuItem>
              <MenuItem value="error">Error</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Time Range</InputLabel>
            <Select
              value={filters.timeRange}
              label="Time Range"
              onChange={(e) => setFilters(prev => ({ ...prev, timeRange: e.target.value }))}
            >
              <MenuItem value={7}>Last 7 Days</MenuItem>
              <MenuItem value={30}>Last 30 Days</MenuItem>
              <MenuItem value={90}>Last 90 Days</MenuItem>
            </Select>
          </FormControl>
          <Button
            startIcon={<Refresh />}
            onClick={() => loadData()}
            variant="outlined"
            size="small"
          >
            Refresh
          </Button>
        </Stack>
      </Box>

      {loading && <LinearProgress sx={{ mb: 3 }} />}

      <Card>
        <CardContent>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>File Name</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Threat</TableCell>
                  <TableCell>Uploader</TableCell>
                  <TableCell>Scan Time</TableCell>
                  <TableCell>Duration</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {scanHistory.map((scan) => (
                  <TableRow key={scan.id}>
                    <TableCell>{scan.file_name}</TableCell>
                    <TableCell>
                      <Chip
                        label={scan.scan_status}
                        size="small"
                        color={getStatusColor(scan.scan_status)}
                        icon={getStatusIcon(scan.scan_status)}
                      />
                    </TableCell>
                    <TableCell>
                      {scan.threat_name ? (
                        <Chip
                          label={scan.threat_name}
                          size="small"
                          color="error"
                          icon={<BugReport />}
                        />
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>{scan.uploader_username || 'Unknown'}</TableCell>
                    <TableCell>{formatDateTime(scan.scanned_at)}</TableCell>
                    <TableCell>
                      {scan.scan_duration_ms ? `${scan.scan_duration_ms}ms` : '-'}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="small"
                        onClick={() => setDetailsDialog({ open: true, item: scan })}
                      >
                        Details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          
          <TablePagination
            component="div"
            count={pagination.total}
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
  );

  const tabs = [
    { label: 'Threat Analysis', icon: <Analytics />, content: renderThreatAnalysis },
    { label: 'Quarantine Files', icon: <Security />, content: renderQuarantineFiles },
    { label: 'Scan History', icon: <History />, content: renderScanHistory },
  ];

  return (
    <Box>
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
            key={index}
            icon={tab.icon}
            label={tab.label}
            iconPosition="start"
            sx={{ minHeight: 64 }}
          />
        ))}
      </Tabs>

      {tabs[activeTab].content()}

      {/* Bulk Actions Menu */}
      <Menu
        anchorEl={bulkActionMenu}
        open={Boolean(bulkActionMenu)}
        onClose={() => setBulkActionMenu(null)}
      >
        <MenuItem onClick={() => { handleBulkAction('false_positive'); setBulkActionMenu(null); }}>
          <ListItemIcon><CheckCircle color="success" /></ListItemIcon>
          <ListItemText>Mark as False Positive</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { handleBulkAction('confirmed_threat'); setBulkActionMenu(null); }}>
          <ListItemIcon><Block color="error" /></ListItemIcon>
          <ListItemText>Confirm as Threat</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { handleBulkAction('deleted'); setBulkActionMenu(null); }}>
          <ListItemIcon><Delete color="error" /></ListItemIcon>
          <ListItemText>Delete</ListItemText>
        </MenuItem>
      </Menu>

      {/* Details Dialog */}
      <Dialog
        open={detailsDialog.open}
        onClose={() => setDetailsDialog({ open: false, item: null })}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          {detailsDialog.item?.threat_name ? 'Threat Details' : 'Scan Details'}
        </DialogTitle>
        <DialogContent>
          {detailsDialog.item && (
            <Box sx={{ mt: 2 }}>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <Typography variant="body2" color="text.secondary">File Name</Typography>
                  <Typography variant="body1">{detailsDialog.item.file_name || detailsDialog.item.original_filename}</Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="body2" color="text.secondary">Status</Typography>
                  <Chip
                    label={detailsDialog.item.scan_status || detailsDialog.item.status}
                    size="small"
                    color={getStatusColor(detailsDialog.item.scan_status || detailsDialog.item.status)}
                  />
                </Grid>
                {detailsDialog.item.threat_name && (
                  <Grid item xs={12} sm={6}>
                    <Typography variant="body2" color="text.secondary">Threat Name</Typography>
                    <Typography variant="body1">{detailsDialog.item.threat_name}</Typography>
                  </Grid>
                )}
                <Grid item xs={12} sm={6}>
                  <Typography variant="body2" color="text.secondary">Uploader</Typography>
                  <Typography variant="body1">{detailsDialog.item.uploader_username || 'Unknown'}</Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="body2" color="text.secondary">Scan Time</Typography>
                  <Typography variant="body1">
                    {formatDateTime(detailsDialog.item.scanned_at || detailsDialog.item.quarantined_at)}
                  </Typography>
                </Grid>
                {detailsDialog.item.scan_duration_ms && (
                  <Grid item xs={12} sm={6}>
                    <Typography variant="body2" color="text.secondary">Duration</Typography>
                    <Typography variant="body1">{detailsDialog.item.scan_duration_ms}ms</Typography>
                  </Grid>
                )}
                {detailsDialog.item.details && (
                  <Grid item xs={12}>
                    <Typography variant="body2" color="text.secondary">Details</Typography>
                    <Box sx={{ mt: 1, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
                      <pre style={{ fontSize: '0.75rem', margin: 0, color: '#333' }}>
                        {JSON.stringify(detailsDialog.item.details, null, 2)}
                      </pre>
                    </Box>
                  </Grid>
                )}
              </Grid>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailsDialog({ open: false, item: null })}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
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

export default ThreatsQuarantineTab;