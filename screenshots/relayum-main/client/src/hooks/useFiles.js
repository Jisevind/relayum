import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { filesAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

export const useFiles = (folderId) => {
  const { isAuthenticated } = useAuth();
  
  return useQuery({
    queryKey: ['files', folderId],
    queryFn: () => filesAPI.getFiles(folderId),
    select: (data) => data.data.files || [],
    enabled: isAuthenticated
  });
};

export const useDeleteFile = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: filesAPI.deleteFile,
    onSuccess: (_, fileId) => {
      // Invalidate all file queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['files'] });
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      // Invalidate quota to update storage indicator
      queryClient.invalidateQueries({ queryKey: ['quota'] });
    }
  });
};

export const useMoveFile = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ fileId, targetFolderId }) => filesAPI.moveFile(fileId, targetFolderId),
    onSuccess: () => {
      // Invalidate all file and folder queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['files'] });
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      queryClient.invalidateQueries({ queryKey: ['folderTree'] });
      // Invalidate quota in case this affects storage calculations
      queryClient.invalidateQueries({ queryKey: ['quota'] });
    }
  });
};