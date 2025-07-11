import React from 'react';
import FileUpload from './FileUpload';
import ErrorBoundary from './ErrorBoundary';
import { FileUploadErrorFallback } from './ErrorFallback';
import {
  Dialog,
  DialogTitle,
  DialogContent,
} from '@mui/material';

const FileUploadModal = ({ 
  open, 
  onClose, 
  currentFolderId 
}) => {
  const handleUploadSuccess = () => {
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Upload Files</DialogTitle>
      <DialogContent>
        <ErrorBoundary 
          fallback={<FileUploadErrorFallback />}
          title="Upload Error"
          showHomeButton={false}
        >
          <FileUpload 
            onUploadSuccess={handleUploadSuccess}
            currentFolderId={currentFolderId}
          />
        </ErrorBoundary>
      </DialogContent>
    </Dialog>
  );
};

export default FileUploadModal;