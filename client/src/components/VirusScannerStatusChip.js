import React from 'react';
import {
  Chip,
  Tooltip,
  Box,
  Typography,
  CircularProgress,
} from '@mui/material';
import {
  Security,
  Warning,
  Error as ErrorIcon,
  CheckCircle,
  NoEncryption,
} from '@mui/icons-material';
import { useVirusScannerStatus } from '../hooks/useVirusScannerStatus';
import { formatDateTime } from '../utils/dateUtils';

/**
 * Global virus scanner status indicator component
 * Shows current scanner status with tooltip details
 */
const VirusScannerStatusChip = ({ showLabel = true, size = 'small', variant = 'outlined' }) => {
  const {
    status,
    statistics,
    loading,
    error,
    lastUpdated,
    isEnabled,
    isAvailable,
    isHealthy,
    statusColor,
    statusText,
  } = useVirusScannerStatus({
    pollingInterval: 600000, // 10 minutes (very conservative for status chip)
    statisticsInterval: 3600000, // 1 hour (very conservative for status chip)
    onError: (err) => console.warn('Scanner status error:', err)
  });

  const getStatusIcon = () => {
    if (loading && !status) {
      return <CircularProgress size={16} />;
    }
    
    if (!isEnabled) {
      return <NoEncryption fontSize="small" />;
    }
    
    if (error) {
      return <ErrorIcon fontSize="small" />;
    }
    
    if (!isAvailable) {
      return <Warning fontSize="small" />;
    }
    
    if (isHealthy) {
      return <CheckCircle fontSize="small" />;
    }
    
    return <Security fontSize="small" />;
  };

  const getTooltipContent = () => {
    if (loading && !status) {
      return (
        <Box>
          <Typography variant="body2" fontWeight="bold">
            Loading Scanner Status...
          </Typography>
        </Box>
      );
    }

    if (error) {
      return (
        <Box>
          <Typography variant="body2" fontWeight="bold" color="error.main">
            Scanner Error
          </Typography>
          <Typography variant="caption">
            {error}
          </Typography>
        </Box>
      );
    }

    if (!status) {
      return (
        <Box>
          <Typography variant="body2" fontWeight="bold">
            Scanner Status Unknown
          </Typography>
        </Box>
      );
    }

    return (
      <Box sx={{ minWidth: 250 }}>
        <Typography variant="body2" fontWeight="bold" gutterBottom>
          Virus Scanner Status
        </Typography>
        
        <Box sx={{ mb: 1 }}>
          <Typography variant="caption" color="text.secondary">
            Status: <span style={{ fontWeight: 'bold' }}>{statusText}</span>
          </Typography>
        </Box>
        
        <Box sx={{ mb: 1 }}>
          <Typography variant="caption" color="text.secondary">
            Mode: {status.status?.mode || 'Unknown'}
          </Typography>
        </Box>
        
        {status.version && (
          <Box sx={{ mb: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Engine: {status.version}
            </Typography>
          </Box>
        )}
        
        {status.status?.lastHealthCheck && (
          <Box sx={{ mb: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Last Check: {formatDateTime(status.status.lastHealthCheck)}
            </Typography>
          </Box>
        )}
        
        {statistics && (
          <Box sx={{ mt: 1, pt: 1, borderTop: '1px solid rgba(255,255,255,0.12)' }}>
            <Typography variant="caption" color="text.secondary">
              Recent Activity:
            </Typography>
            <br />
            <Typography variant="caption" color="text.secondary">
              • Total Scans: {statistics.summary?.total_scans || 0}
            </Typography>
            <br />
            <Typography variant="caption" color="text.secondary">
              • Clean Files: {statistics.summary?.clean_files || 0}
            </Typography>
            <br />
            <Typography variant="caption" color="text.secondary">
              • Threats: {statistics.summary?.infected_files || 0}
            </Typography>
          </Box>
        )}
        
        {lastUpdated && (
          <Box sx={{ mt: 1, pt: 1, borderTop: '1px solid rgba(255,255,255,0.12)' }}>
            <Typography variant="caption" color="text.secondary">
              Updated: {formatDateTime(lastUpdated)}
            </Typography>
          </Box>
        )}
      </Box>
    );
  };

  const getChipLabel = () => {
    if (!showLabel) return null;
    
    if (loading && !status) return 'Loading...';
    if (error) return 'Error';
    
    return `Scanner: ${statusText}`;
  };

  return (
    <Tooltip 
      title={getTooltipContent()} 
      arrow 
      placement="bottom-end"
      componentsProps={{
        tooltip: {
          sx: {
            bgcolor: 'background.paper',
            color: 'text.primary',
            border: '1px solid',
            borderColor: 'divider',
            boxShadow: 3,
          }
        }
      }}
    >
      <Chip
        icon={getStatusIcon()}
        label={getChipLabel()}
        color={statusColor}
        variant={variant}
        size={size}
        sx={{
          cursor: 'help',
          '& .MuiChip-icon': {
            color: 'inherit',
          },
        }}
      />
    </Tooltip>
  );
};

export default VirusScannerStatusChip;