import axios from 'axios';

const API_BASE_URL = '/api';

// Enhanced axios configuration
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: parseInt(process.env.REACT_APP_API_TIMEOUT_MS) || 30000, // 30 second timeout default
  withCredentials: true, // Include cookies for httpOnly tokens
  headers: {
    'Content-Type': 'application/json',
  }
});

// Token refresh function
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  
  failedQueue = [];
};

const refreshAuthToken = async () => {
  try {
    const response = await axios.post('/api/auth/refresh', {}, {
      withCredentials: true
    });
    return response.data.token;
  } catch (error) {
    throw error;
  }
};

// Enhanced request interceptor
api.interceptors.request.use(
  (config) => {
    // Add request ID for tracking
    config.metadata = { startTime: new Date() };
    
    // Get token from localStorage (fallback) or rely on httpOnly cookies
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    // For FormData uploads, remove Content-Type to let browser set multipart/form-data
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }
    
    return config;
  },
  (error) => {
    console.error('Request interceptor error:', error);
    return Promise.reject(error);
  }
);

// Enhanced response interceptor with retry logic
api.interceptors.response.use(
  (response) => {
    // Log successful requests in development
    if (process.env.NODE_ENV === 'development') {
      const duration = new Date() - response.config.metadata.startTime;
      console.log(`API Request: ${response.config.method?.toUpperCase()} ${response.config.url} - ${duration}ms`);
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    
    // Log errors in development
    if (process.env.NODE_ENV === 'development') {
      const duration = originalRequest.metadata ? new Date() - originalRequest.metadata.startTime : 0;
      console.error(`❌ ${originalRequest.method?.toUpperCase()} ${originalRequest.url} - ${error.response?.status || 'Network Error'} (${duration}ms)`);
    }

    // Handle network errors with retry
    if (!error.response && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;
      originalRequest._retryCount = originalRequest._retryCount || 0;
      
      if (originalRequest._retryCount < 3) {
        originalRequest._retryCount++;
        
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, originalRequest._retryCount - 1) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        
        return api(originalRequest);
      }
    }

    // Handle 401 (Unauthorized) and 403 (Forbidden - could be expired token) with token refresh
    if ((error.response?.status === 401 || error.response?.status === 403) && originalRequest && !originalRequest._retry) {
      if (isRefreshing) {
        // If already refreshing, queue this request
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(token => {
          if (token) {
            originalRequest.headers.Authorization = `Bearer ${token}`;
          }
          return api(originalRequest);
        }).catch(err => {
          return Promise.reject(err);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const newToken = await refreshAuthToken();
        
        // Update localStorage with new token
        if (newToken) {
          localStorage.setItem('token', newToken);
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
        }
        
        processQueue(null, newToken);
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        
        // Clear auth data and redirect to login
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        
        // Only redirect if not already on login/register page
        if (!window.location.pathname.includes('/login') && 
            !window.location.pathname.includes('/register') &&
            !window.location.pathname.includes('/public/') &&
            !window.location.pathname.includes('/anonymous/')) {
          window.location.href = '/login';
        }
        
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // Handle rate limiting with user-friendly message
    if (error.response?.status === 429) {
      const retryAfter = error.response.headers['retry-after'];
      const message = retryAfter 
        ? `Too many requests. Please try again in ${retryAfter} seconds.`
        : 'Too many requests. Please try again later.';
      
      // Create a more user-friendly error
      const rateLimitError = new Error(message);
      rateLimitError.isRateLimit = true;
      rateLimitError.retryAfter = retryAfter;
      
      return Promise.reject(rateLimitError);
    }

    // Handle other 4xx errors
    if (error.response?.status >= 400 && error.response?.status < 500) {
      // Don't retry client errors
      return Promise.reject(error);
    }

    // Handle 5xx errors with retry (but exclude file uploads to prevent duplicates)
    const isFileUpload = originalRequest?.url?.includes('/files/upload') || 
                        (originalRequest?.method?.toLowerCase() === 'post' && 
                         originalRequest?.data instanceof FormData);
    
    if (error.response?.status >= 500 && originalRequest && !originalRequest._serverRetry && !isFileUpload) {
      originalRequest._serverRetry = true;
      originalRequest._serverRetryCount = originalRequest._serverRetryCount || 0;
      
      if (originalRequest._serverRetryCount < 2) {
        originalRequest._serverRetryCount++;
        
        // Shorter delay for server errors: 2s, 4s
        const delay = Math.pow(2, originalRequest._serverRetryCount) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        
        return api(originalRequest);
      }
    }

    return Promise.reject(error);
  }
);

export const authAPI = {
  login: (credentials) => api.post('/auth/login', credentials),
  register: (userData) => api.post('/auth/register', userData),
  getMe: () => api.get('/auth/me'),
  logout: () => api.post('/auth/logout'),
  checkUsernameAvailability: (username) => api.get(`/auth/check-username/${encodeURIComponent(username)}`),
  getConfig: () => api.get('/auth/config'),
};

export const filesAPI = {
  upload: (formData, config = {}) => api.post('/files/upload', formData, {
    headers: {}, // Let browser set Content-Type automatically for FormData
    timeout: 300000, // 5 minutes timeout for uploads (virus scanning can take time)
    ...config
  }),
  getFiles: (folderId) => api.get(`/files${folderId ? `?folder_id=${folderId}` : ''}`),
  deleteFile: (fileId) => api.delete(`/files/${fileId}`),
  moveFile: (fileId, folderId) => api.put(`/files/${fileId}/move`, { folderId }),
};

export const foldersAPI = {
  getFolders: (parentId) => api.get(`/folders${parentId ? `?parent_id=${parentId}` : ''}`),
  createFolder: (folderData) => api.post('/folders', folderData),
  getFolder: (folderId) => api.get(`/folders/${folderId}`),
  deleteFolder: (folderId) => api.delete(`/folders/${folderId}`),
  getBreadcrumb: (folderId) => api.get(`/folders/${folderId}/breadcrumb`),
  getFolderTree: () => api.get('/folders/tree'),
  moveFolder: (folderId, parentId) => api.put(`/folders/${folderId}/move`, { parentId }),
};

export const sharesAPI = {
  createShare: (shareData) => api.post('/shares', shareData),
  getSentShares: () => api.get('/shares/sent'),
  getReceivedShares: () => api.get('/shares/received'),
  getReceivedSharesUnviewedCount: () => api.get('/shares/received/unviewed-count'),
  getAllShares: () => api.get('/shares/all'),
  getPublicShare: (token, password = null) => {
    const url = password 
      ? `/shares/public/${token}?password=${encodeURIComponent(password)}`
      : `/shares/public/${token}`;
    return api.get(url);
  },
  getPrivateShare: (token) => api.get(`/shares/private/${token}`),
  getPublicFolderContents: (token, password = null) => {
    const url = password 
      ? `/shares/public/${token}/contents?password=${encodeURIComponent(password)}`
      : `/shares/public/${token}/contents`;
    return api.get(url);
  },
  getSharedFolderContents: (shareId) => api.get(`/shares/${shareId}/contents`),
  deleteShare: (shareId) => api.delete(`/shares/${shareId}`),
  deleteReceivedShare: (shareId) => api.delete(`/shares/received/${shareId}`),
};

// Helper function to trigger file download from blob
const triggerDownload = (blob, filename, fallbackName) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || fallbackName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

// Helper function to extract filename from Content-Disposition header
const getFilenameFromHeaders = (headers, fallbackName) => {
  const contentDisposition = headers['content-disposition'];
  if (contentDisposition) {
    const filenameMatch = contentDisposition.match(/filename="(.+)"/);
    if (filenameMatch) {
      return filenameMatch[1];
    }
  }
  return fallbackName;
};

export const downloadAPI = {
  downloadFile: async (fileId) => {
    const response = await api.get(`/download/file/${fileId}`, {
      responseType: 'blob'
    });
    
    const filename = getFilenameFromHeaders(response.headers, `file-${fileId}`);
    triggerDownload(response.data, filename, `file-${fileId}`);
  },
  
  downloadFolder: async (folderId) => {
    const response = await api.get(`/download/folder/${folderId}`, {
      responseType: 'blob'
    });
    
    const filename = getFilenameFromHeaders(response.headers, `folder-${folderId}.zip`);
    triggerDownload(response.data, filename, `folder-${folderId}.zip`);
  },
  
  // Public downloads don't need auth - these return URLs for direct navigation
  downloadPublic: (token) => `/api/download/public/${token}`,
  downloadPublicFile: (token, fileId) => `/api/download/public/${token}/file/${fileId}`,
  downloadBulk: (shareId) => `/api/download/bulk/${shareId}`,
};

export const usersAPI = {
  // User quota and usage endpoints
  getQuota: () => api.get('/users/quota'),
  getUsage: () => api.get('/users/usage'),
  recalculateUsage: () => api.post('/users/recalculate-usage'),
};

// Anonymous sharing API endpoints
export const anonymousAPI = {
  // Create anonymous shares
  createFileShare: (fileId, data) => api.post(`/anonymous/share/file/${fileId}`, data),
  createFolderShare: (folderId, data) => api.post(`/anonymous/share/folder/${folderId}`, data),
  
  // Note: Authenticated anonymous share operations removed - these endpoints
  // were confusing as they mixed authentication with "anonymous" concepts
  
  // Public access endpoints (no auth required)
  accessShare: (token) => axios.get(`/api/anonymous/access/${token}`),
  downloadShare: (token) => `/api/anonymous/download/${token}`,
  browseShare: (token) => axios.get(`/api/anonymous/browse/${token}`),
  downloadFileFromShare: (token, fileId) => `/api/anonymous/download-file/${token}/${fileId}`,
};

// Admin API endpoints (admin only)
export const adminAPI = {
  // Dashboard
  getDashboard: () => api.get('/admin/dashboard'),
  
  // User search and management
  searchUsers: (params) => {
    const queryParams = new URLSearchParams();
    if (params.search) queryParams.append('q', params.search);
    if (params.page) {
      const offset = (params.page - 1) * (params.limit || 10);
      queryParams.append('offset', offset);
    }
    if (params.limit) queryParams.append('limit', params.limit);
    return api.get(`/admin/users/search?${queryParams.toString()}`);
  },
  
  // User overrides
  setUserOverride: (userId, data) => api.post(`/admin/users/${userId}/override`, data),
  removeUserOverride: (userId) => api.delete(`/admin/users/${userId}/override`),
  
  // Audit logs
  getUserAuditLog: (userId) => api.get(`/admin/users/${userId}/audit`),
  
  // Login logs
  getLoginLogs: (params = {}) => {
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append('page', params.page);
    if (params.limit) queryParams.append('limit', params.limit);
    if (params.success !== undefined) queryParams.append('success', params.success);
    if (params.username) queryParams.append('username', params.username);
    if (params.ip) queryParams.append('ip', params.ip);
    if (params.start_date) queryParams.append('start_date', params.start_date);
    if (params.end_date) queryParams.append('end_date', params.end_date);
    return api.get(`/admin/login-logs?${queryParams.toString()}`);
  },

  // IP Ban Management
  getIpBans: (params = {}) => {
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append('page', params.page);
    if (params.limit) queryParams.append('limit', params.limit);
    if (params.include_expired) queryParams.append('include_expired', params.include_expired);
    return api.get(`/admin/ip-bans?${queryParams.toString()}`);
  },

  banIp: (ipAddress, reason, expiresAt) => {
    return api.post('/admin/ip-ban', {
      ip_address: ipAddress,
      reason: reason,
      expires_at: expiresAt
    });
  },

  unbanIp: (ipAddress) => {
    return api.delete(`/admin/ip-ban/${encodeURIComponent(ipAddress)}`);
  },

  getIpBanStatus: (ipAddress) => {
    return api.get(`/admin/ip-ban-status/${encodeURIComponent(ipAddress)}`);
  },
  
  // Virus scanning management
  virusScanning: {
    getStatus: () => api.get('/admin/virus-scanning/status'),
    getStatistics: (days = 30) => api.get(`/admin/virus-scanning/statistics?days=${days}`),
    test: () => api.post('/admin/virus-scanning/test'),
    enable: () => api.post('/admin/virus-scanning/enable'),
    disable: () => api.post('/admin/virus-scanning/disable'),
    updateConfig: (config) => api.put('/admin/virus-scanning/config', { config }),
    getQuarantine: (params = {}) => {
      const queryParams = new URLSearchParams();
      if (params.page) queryParams.append('page', params.page);
      if (params.limit) queryParams.append('limit', params.limit);
      if (params.status) queryParams.append('status', params.status);
      return api.get(`/admin/virus-scanning/quarantine?${queryParams.toString()}`);
    },
    updateQuarantineFile: (id, data) => api.put(`/admin/virus-scanning/quarantine/${id}`, data),
    deleteQuarantineFile: (id) => api.delete(`/admin/virus-scanning/quarantine/${id}`),
    cleanup: () => api.post('/admin/virus-scanning/cleanup')
  }
};

export default api;