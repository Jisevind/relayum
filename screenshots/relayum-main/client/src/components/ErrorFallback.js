import React from 'react';
import {
  Box,
  Alert,
  AlertTitle,
  Button,
  Typography,
} from '@mui/material';
import {
  Refresh,
  Warning,
} from '@mui/icons-material';

// Lightweight error fallback for smaller UI sections
export const InlineErrorFallback = ({ 
  error, 
  onRetry, 
  message = 'Failed to load this section' 
}) => (
  <Alert 
    severity="error" 
    sx={{ m: 1 }}
    action={
      onRetry && (
        <Button
          color="inherit"
          size="small"
          onClick={onRetry}
          startIcon={<Refresh />}
        >
          Retry
        </Button>
      )
    }
  >
    <AlertTitle>Error</AlertTitle>
    {message}
    {process.env.NODE_ENV === 'development' && error && (
      <Typography variant="caption" display="block" sx={{ mt: 1, fontFamily: 'monospace' }}>
        {error.message}
      </Typography>
    )}
  </Alert>
);

// Compact error fallback for components
export const CompactErrorFallback = ({ 
  error, 
  onRetry, 
  title = 'Error',
  message = 'Something went wrong' 
}) => (
  <Box
    sx={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      p: 3,
      textAlign: 'center',
      minHeight: 200,
    }}
  >
    <Warning sx={{ fontSize: 48, color: 'warning.main', mb: 2 }} />
    
    <Typography variant="h6" gutterBottom>
      {title}
    </Typography>
    
    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
      {message}
    </Typography>

    {process.env.NODE_ENV === 'development' && error && (
      <Typography 
        variant="caption" 
        sx={{ 
          fontFamily: 'monospace', 
          bgcolor: 'grey.100', 
          p: 1, 
          borderRadius: 1, 
          mb: 2,
          maxWidth: '100%',
          overflow: 'auto'
        }}
      >
        {error.message}
      </Typography>
    )}

    {onRetry && (
      <Button
        variant="outlined"
        size="small"
        onClick={onRetry}
        startIcon={<Refresh />}
      >
        Try Again
      </Button>
    )}
  </Box>
);

// File upload specific error fallback
export const FileUploadErrorFallback = ({ error, onRetry }) => (
  <InlineErrorFallback
    error={error}
    onRetry={onRetry}
    message="Failed to upload files. Please check your connection and try again."
  />
);

// Folder tree specific error fallback
export const FolderTreeErrorFallback = ({ error, onRetry }) => (
  <CompactErrorFallback
    error={error}
    onRetry={onRetry}
    title="Folder Tree Error"
    message="Unable to load folder structure"
  />
);

// File browser specific error fallback
export const FileBrowserErrorFallback = ({ error, onRetry }) => (
  <CompactErrorFallback
    error={error}
    onRetry={onRetry}
    title="Browse Error"
    message="Unable to load files and folders"
  />
);