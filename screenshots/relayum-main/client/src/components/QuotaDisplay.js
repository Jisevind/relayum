import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usersAPI } from '../services/api';
import {
  Box,
  Card,
  CardContent,
  Typography,
  LinearProgress,
  Chip,
  IconButton,
  Tooltip,
  Alert,
  Skeleton,
} from '@mui/material';
import {
  Storage,
  Refresh,
  Warning,
  CheckCircle,
} from '@mui/icons-material';

const QuotaDisplay = ({ compact = false }) => {
  const [refreshing, setRefreshing] = useState(false);

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const { data: quotaInfo, isLoading: loading, error, refetch } = useQuery({
    queryKey: ['quota'],
    queryFn: async () => {
      const response = await usersAPI.getQuota();
      return response.data;
    },
    staleTime: 30000, // Consider data stale after 30 seconds
    refetchInterval: 60000, // Refetch every minute
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const recalculateUsage = async () => {
    setRefreshing(true);
    try {
      await usersAPI.recalculateUsage();
      await refetch();
    } catch (err) {
      console.error('Failed to recalculate usage:', err);
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <Card sx={{ mb: compact ? 0 : 2 }}>
        <CardContent sx={{ p: compact ? 2 : 3 }}>
          <Skeleton variant="text" width="60%" height={24} />
          <Skeleton variant="rectangular" width="100%" height={8} sx={{ my: 1 }} />
          <Skeleton variant="text" width="40%" height={20} />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert 
        severity="error" 
        sx={{ mb: compact ? 0 : 2 }}
        action={
          <IconButton size="small" onClick={handleRefresh}>
            <Refresh />
          </IconButton>
        }
      >
        {error?.message || 'Failed to load quota information'}
      </Alert>
    );
  }

  if (!quotaInfo) return null;

  const usagePercentage = quotaInfo.usage_percentage || 0;
  const isNearLimit = usagePercentage >= 80;
  const isOverLimit = usagePercentage >= 100;

  const getProgressColor = () => {
    if (isOverLimit) return 'error';
    if (isNearLimit) return 'warning';
    return 'primary';
  };

  const getStatusIcon = () => {
    if (isOverLimit) return <Warning color="error" />;
    if (isNearLimit) return <Warning color="warning" />;
    return <CheckCircle color="success" />;
  };

  if (compact) {
    return (
      <Box sx={{ p: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Storage sx={{ fontSize: 16 }} color="primary" />
            <Typography variant="caption" fontWeight="medium">
              Storage
            </Typography>
            {getStatusIcon()}
          </Box>
          <Tooltip title="Refresh">
            <IconButton size="small" onClick={handleRefresh} disabled={refreshing}>
              <Refresh sx={{ fontSize: 14, transform: refreshing ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s' }} />
            </IconButton>
          </Tooltip>
        </Box>

        <Box sx={{ mb: 1 }}>
          <LinearProgress
            variant="determinate"
            value={Math.min(usagePercentage, 100)}
            color={getProgressColor()}
            sx={{ 
              height: 4, 
              borderRadius: 1,
              backgroundColor: 'rgba(0,0,0,0.1)'
            }}
          />
        </Box>

        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
          {formatBytes(quotaInfo.disk_used_bytes)} of {formatBytes(quotaInfo.effective_disk_quota)}
        </Typography>
      </Box>
    );
  }

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Storage color="primary" />
            <Typography variant="h6" fontWeight="medium">
              Storage Usage
            </Typography>
            {getStatusIcon()}
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Tooltip title="Refresh usage data">
              <IconButton 
                size="small" 
                onClick={handleRefresh}
                disabled={refreshing}
              >
                <Refresh sx={{ transform: refreshing ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s' }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Recalculate usage from files">
              <IconButton 
                size="small" 
                onClick={recalculateUsage}
                disabled={refreshing}
              >
                <Storage />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        <Box sx={{ mb: 2 }}>
          <LinearProgress
            variant="determinate"
            value={Math.min(usagePercentage, 100)}
            color={getProgressColor()}
            sx={{ 
              height: 8, 
              borderRadius: 1,
              backgroundColor: 'rgba(0,0,0,0.1)'
            }}
          />
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {formatBytes(quotaInfo.disk_used_bytes)} of {formatBytes(quotaInfo.effective_disk_quota)} used
          </Typography>
          <Chip
            label={`${usagePercentage}%`}
            size="medium"
            color={getProgressColor()}
            variant="outlined"
          />
        </Box>

        <Typography variant="body2" color="text.secondary">
          Available: {formatBytes(quotaInfo.disk_available_bytes)}
        </Typography>

        {isOverLimit && (
          <Alert severity="error" sx={{ mt: 2 }}>
            Storage quota exceeded. Delete some files to free up space.
          </Alert>
        )}
        {isNearLimit && !isOverLimit && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            Storage quota nearly full. Consider deleting unused files.
          </Alert>
        )}
        
        <Box sx={{ mt: 2, p: 2, bgcolor: 'background.paper', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            File Expiration: {quotaInfo.effective_file_expiration} days
          </Typography>
          <Typography variant="caption" color="text.secondary">
            New files will automatically expire after this period
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
};

export default QuotaDisplay;