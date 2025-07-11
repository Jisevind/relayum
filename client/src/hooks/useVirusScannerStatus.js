import { useState, useEffect, useCallback, useRef } from 'react';
import { adminAPI } from '../services/api';

// Global state to prevent duplicate polling across multiple hook instances
let globalPolling = {
  status: null,
  statistics: null,
  lastStatusFetch: 0,
  lastStatsFetch: 0,
  isPolling: false,
  subscribers: new Set(),
  timers: { status: null, stats: null }
};

/**
 * Hook for managing virus scanner status with real-time updates
 * Provides scanner status, statistics, and control functions
 */
export const useVirusScannerStatus = (options = {}) => {
  const {
    pollingInterval = parseInt(process.env.REACT_APP_VIRUS_SCANNER_POLL_INTERVAL) || 300000, // 5 minutes default
    statisticsInterval = parseInt(process.env.REACT_APP_VIRUS_SCANNER_STATS_INTERVAL) || 1800000, // 30 minutes default
    autoStart = true,
    onError = null
  } = options;

  const [status, setStatus] = useState(globalPolling.status);
  const [statistics, setStatistics] = useState(globalPolling.statistics);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const retryTimeoutRef = useRef(null);

  // Update global state and notify all subscribers
  const updateGlobalState = useCallback((newStatus, newStats) => {
    if (newStatus) {
      globalPolling.status = newStatus;
      globalPolling.lastStatusFetch = Date.now();
    }
    if (newStats) {
      globalPolling.statistics = newStats;
      globalPolling.lastStatsFetch = Date.now();
    }
    
    // Notify all subscribers
    globalPolling.subscribers.forEach(callback => {
      if (typeof callback === 'function') {
        callback({ status: globalPolling.status, statistics: globalPolling.statistics });
      }
    });
  }, []);

  // Fetch scanner status with optional rate limiting protection
  const fetchStatus = useCallback(async (showLoading = false, force = false) => {
    const now = Date.now();
    
    // Skip API calls if we know the scanner is environment-disabled (unless forced)
    if (!force && globalPolling.status?.status?.environmentDisabled) {
      return globalPolling.status;
    }
    
    // Only apply rate limiting for automatic polling, not manual refreshes
    if (!force && now - globalPolling.lastStatusFetch < 60000 && globalPolling.status) {
      return globalPolling.status;
    }

    try {
      if (showLoading) setLoading(true);
      setError(null);
      
      const response = await adminAPI.virusScanning.getStatus();
      updateGlobalState(response.data, null);
      setLastUpdated(new Date());
      
      // If environment disabled, stop future polling
      if (response.data?.status?.environmentDisabled) {
        console.log('Virus scanner environment-disabled detected, stopping polling');
        if (globalPolling.timers.status) {
          clearInterval(globalPolling.timers.status);
          globalPolling.timers.status = null;
        }
        if (globalPolling.timers.stats) {
          clearInterval(globalPolling.timers.stats);
          globalPolling.timers.stats = null;
        }
      }
      
      if (showLoading) setLoading(false);
      return response.data;
    } catch (err) {
      let errorMessage = err.response?.data?.error || err.message || 'Failed to fetch scanner status';
      
      // Handle authentication errors - stop polling
      if (err.response?.status === 401 || err.response?.status === 403) {
        errorMessage = 'Authentication required. Please refresh the page or log in again.';
        setError(errorMessage);
        if (onError) onError(errorMessage);
        if (showLoading) setLoading(false);
        
        // Stop global polling on authentication errors
        console.warn('Authentication error in virus scanner status. Stopping global polling.');
        if (globalPolling.timers.status) {
          clearInterval(globalPolling.timers.status);
          globalPolling.timers.status = null;
        }
        if (globalPolling.timers.stats) {
          clearInterval(globalPolling.timers.stats);
          globalPolling.timers.stats = null;
        }
        globalPolling.isPolling = false;
        
        return null;
      }
      
      // Handle rate limiting with exponential backoff
      if (err.response?.status === 429) {
        const retryAfter = err.response?.headers?.['retry-after'] || 60;
        errorMessage = `Rate limited. Retrying in ${retryAfter} seconds.`;
        
        // Clear any existing retry timeout
        if (retryTimeoutRef.current) {
          clearTimeout(retryTimeoutRef.current);
        }
        
        // Set retry timeout with exponential backoff
        retryTimeoutRef.current = setTimeout(() => {
          fetchStatus(false);
        }, Math.min(retryAfter * 1000, 300000)); // Max 5 minutes
      }
      
      setError(errorMessage);
      if (onError) onError(errorMessage);
      if (showLoading) setLoading(false);
      return null;
    }
  }, [onError, updateGlobalState]);

  // Fetch scanner statistics with optional rate limiting protection
  const fetchStatistics = useCallback(async (days = 30, force = false) => {
    const now = Date.now();
    
    // Skip API calls if we know the scanner is environment-disabled (unless forced)
    if (!force && globalPolling.status?.status?.environmentDisabled) {
      return globalPolling.statistics;
    }
    
    // Only apply rate limiting for automatic polling, not manual refreshes
    if (!force && now - globalPolling.lastStatsFetch < 600000 && globalPolling.statistics) {
      return globalPolling.statistics;
    }

    try {
      const response = await adminAPI.virusScanning.getStatistics(days);
      updateGlobalState(null, response.data);
      return response.data;
    } catch (err) {
      // Handle rate limiting - stop polling temporarily
      if (err.response?.status === 429) {
        const retryAfter = err.response?.headers?.['retry-after'] || 300; // Default 5 minutes
        console.warn(`Statistics rate limited. Stopping polling for ${retryAfter} seconds.`);
        
        // Stop statistics polling temporarily
        if (globalPolling.timers.stats) {
          clearInterval(globalPolling.timers.stats);
          globalPolling.timers.stats = null;
        }
        
        // Restart statistics polling after rate limit expires
        setTimeout(() => {
          if (globalPolling.isPolling && !globalPolling.timers.stats) {
            globalPolling.timers.stats = setInterval(() => {
              fetchStatistics();
            }, statisticsInterval);
          }
        }, retryAfter * 1000);
        
        return null;
      }
      
      // Silently handle other errors to avoid spam (they're less critical)
      console.warn('Failed to fetch scanner statistics:', err.message);
      return null;
    }
  }, [updateGlobalState]);

  // Control functions
  const enableScanner = useCallback(async () => {
    if (globalPolling.status?.status?.environmentDisabled) {
      throw new Error('Cannot enable scanner - disabled via environment configuration');
    }
    
    try {
      setLoading(true);
      const response = await adminAPI.virusScanning.enable();
      await fetchStatus(false, true); // Force refresh status after enabling
      return response.data;
    } catch (err) {
      const errorMessage = err.response?.data?.error || 'Failed to enable scanner';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [fetchStatus]);

  const disableScanner = useCallback(async () => {
    if (globalPolling.status?.status?.environmentDisabled) {
      throw new Error('Cannot disable scanner - disabled via environment configuration');
    }
    
    try {
      setLoading(true);
      const response = await adminAPI.virusScanning.disable();
      await fetchStatus(false, true); // Force refresh status after disabling
      return response.data;
    } catch (err) {
      const errorMessage = err.response?.data?.error || 'Failed to disable scanner';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [fetchStatus]);

  const testScanner = useCallback(async () => {
    if (globalPolling.status?.status?.environmentDisabled) {
      throw new Error('Cannot test scanner - disabled via environment configuration');
    }
    
    try {
      setLoading(true);
      const response = await adminAPI.virusScanning.test();
      await fetchStatus(false, true); // Force refresh status after test
      return response.data;
    } catch (err) {
      const errorMessage = err.response?.data?.error || 'Scanner test failed';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [fetchStatus]);

  const updateConfig = useCallback(async (config) => {
    if (globalPolling.status?.status?.environmentDisabled) {
      throw new Error('Cannot update configuration - disabled via environment configuration');
    }
    
    try {
      setLoading(true);
      const response = await adminAPI.virusScanning.updateConfig(config);
      await fetchStatus(false, true); // Force refresh status after config update
      return response.data;
    } catch (err) {
      const errorMessage = err.response?.data?.error || 'Failed to update configuration';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [fetchStatus]);

  // Refresh both status and statistics (forced, bypasses rate limiting)
  const refresh = useCallback(async () => {
    // Allow manual refresh even when environment-disabled to get latest status
    setLoading(true);
    try {
      await Promise.all([
        fetchStatus(false, true), // force = true
        fetchStatistics(30, true)  // force = true
      ]);
    } catch (error) {
      console.error('Refresh failed:', error);
    } finally {
      setLoading(false);
    }
  }, [fetchStatus, fetchStatistics]);

  // Set up global polling and subscription
  useEffect(() => {
    
    // Subscribe to global state updates
    const handleGlobalUpdate = ({ status: newStatus, statistics: newStats }) => {
      // Always update state to avoid stale closure issues
      if (newStatus) setStatus(newStatus);
      if (newStats) setStatistics(newStats);
      if (newStatus || newStats) {
        setLastUpdated(new Date());
        setLoading(false);
      }
    };
    
    globalPolling.subscribers.add(handleGlobalUpdate);

    if (!autoStart) return;

    // Only start global polling if not already running
    if (!globalPolling.isPolling) {
      globalPolling.isPolling = true;
      
      // Initial fetch
      fetchStatus(true);
      fetchStatistics();

      // Set up global status polling (only one instance)
      globalPolling.timers.status = setInterval(() => {
        fetchStatus(false);
      }, pollingInterval);

      // Set up global statistics polling (only one instance)
      globalPolling.timers.stats = setInterval(() => {
        fetchStatistics();
      }, statisticsInterval);
    } else {
      // If already polling, just get current data
      if (globalPolling.status) {
        setStatus(globalPolling.status);
        setLoading(false);
      }
      if (globalPolling.statistics) {
        setStatistics(globalPolling.statistics);
      }
    }

    return () => {
      // Remove this subscriber
      globalPolling.subscribers.delete(handleGlobalUpdate);
      
      // Clear retry timeout if exists
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      
      // If no more subscribers, stop global polling
      if (globalPolling.subscribers.size === 0) {
        globalPolling.isPolling = false;
        if (globalPolling.timers.status) {
          clearInterval(globalPolling.timers.status);
          globalPolling.timers.status = null;
        }
        if (globalPolling.timers.stats) {
          clearInterval(globalPolling.timers.stats);
          globalPolling.timers.stats = null;
        }
      }
    };
  }, [autoStart, pollingInterval, statisticsInterval, fetchStatus, fetchStatistics]);

  // Derived state helpers
  const isEnabled = status?.status?.enabled || false;
  const isAvailable = status?.status?.available || false;
  const isHealthy = isEnabled && isAvailable;
  const isEnvironmentDisabled = status?.status?.environmentDisabled || false;
  
  const getStatusColor = () => {
    if (!isEnabled) return 'default';
    if (!isAvailable) return 'warning';
    if (isHealthy) return 'success';
    return 'error';
  };

  const getStatusText = () => {
    if (isEnvironmentDisabled) return 'Environment Disabled';
    if (!isEnabled) return 'Disabled';
    if (!isAvailable) return 'Unavailable';
    if (isHealthy) return 'Active';
    return 'Error';
  };

  const getStatusIcon = () => {
    if (!isEnabled) return 'SecurityOff';
    if (!isAvailable) return 'SecurityWarning';
    if (isHealthy) return 'Security';
    return 'SecurityError';
  };

  return {
    // State
    status,
    statistics,
    loading,
    error,
    lastUpdated,
    
    // Derived state
    isEnabled,
    isAvailable,
    isHealthy,
    isEnvironmentDisabled,
    statusColor: getStatusColor(),
    statusText: getStatusText(),
    statusIcon: getStatusIcon(),
    
    // Actions
    enableScanner,
    disableScanner,
    testScanner,
    updateConfig,
    refresh,
    fetchStatus,
    fetchStatistics,
    
    // Manual control
    clearError: () => setError(null),
  };
};

export default useVirusScannerStatus;