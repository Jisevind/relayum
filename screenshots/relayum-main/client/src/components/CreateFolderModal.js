import React, { useState } from 'react';
import { useCreateFolder } from '../hooks/useFolders';
import ErrorBoundary from './ErrorBoundary';
import { InlineErrorFallback } from './ErrorFallback';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
} from '@mui/material';

const CreateFolderModal = ({ 
  open, 
  onClose, 
  onFolderCreated, 
  currentFolderId 
}) => {
  const [folderName, setFolderName] = useState('');
  const createFolderMutation = useCreateFolder();

  const handleClose = () => {
    setFolderName('');
    onClose();
  };

  const handleSubmit = async () => {
    if (!folderName.trim()) return;
    
    try {
      await createFolderMutation.mutateAsync({
        name: folderName.trim(),
        parent_id: currentFolderId
      });
      
      if (onFolderCreated) {
        onFolderCreated();
      }
      
      handleClose();
    } catch (error) {
      console.error('Failed to create folder:', error);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  return (
    <Dialog open={open} onClose={handleClose}>
      <DialogTitle>Create New Folder</DialogTitle>
      <ErrorBoundary 
        fallback={<InlineErrorFallback message="Error in folder creation form" />}
        title="Folder Creation Error"
        showHomeButton={false}
      >
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Folder Name"
            fullWidth
            variant="outlined"
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            onKeyPress={handleKeyPress}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSubmit} variant="contained">
            Create
          </Button>
        </DialogActions>
      </ErrorBoundary>
    </Dialog>
  );
};

export default CreateFolderModal;