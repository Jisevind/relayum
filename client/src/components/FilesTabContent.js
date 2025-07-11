import React from 'react';
import FolderTreeView from './FolderTreeView';
import FileBrowserView from './FileBrowserView';
import ErrorBoundary from './ErrorBoundary';
import { FolderTreeErrorFallback, FileBrowserErrorFallback } from './ErrorFallback';
import { Box } from '@mui/material';

const FilesTabContent = ({
  currentFolderId,
  onFolderChange,
  onShare,
  onUpload,
  onCreateFolder
}) => {
  return (
    <Box sx={{ 
      display: 'flex', 
      gap: 2, 
      height: 'calc(100vh - 200px)', // Adjust based on header height
    }}>
      {/* Left sidebar - Folder tree */}
      <Box sx={{ width: 300, flexShrink: 0 }}>
        <ErrorBoundary 
          fallback={<FolderTreeErrorFallback />}
          title="Folder Tree Error"
          showHomeButton={false}
        >
          <FolderTreeView
            currentFolderId={currentFolderId}
            onFolderSelect={onFolderChange}
            onCreateFolder={onCreateFolder}
          />
        </ErrorBoundary>
      </Box>
      
      {/* Right side - File browser */}
      <Box sx={{ flex: 1 }}>
        <ErrorBoundary 
          fallback={<FileBrowserErrorFallback />}
          title="File Browser Error"
          showHomeButton={false}
        >
          <FileBrowserView
            currentFolderId={currentFolderId}
            onFolderChange={onFolderChange}
            onShare={onShare}
            onUpload={onUpload}
            onCreateFolder={onCreateFolder}
          />
        </ErrorBoundary>
      </Box>
    </Box>
  );
};

export default FilesTabContent;