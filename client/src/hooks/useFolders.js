import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { foldersAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

export const useFolders = (parentId) => {
  const { isAuthenticated } = useAuth();
  
  return useQuery({
    queryKey: ['folders', parentId],
    queryFn: () => foldersAPI.getFolders(parentId),
    select: (data) => data.data.folders || [],
    enabled: isAuthenticated
  });
};

export const useFolderTree = () => {
  const { isAuthenticated } = useAuth();
  
  return useQuery({
    queryKey: ['folderTree'],
    queryFn: () => foldersAPI.getFolderTree(),
    select: (data) => data.data.tree || [],
    enabled: isAuthenticated
  });
};

export const useBreadcrumb = (folderId) => {
  const { isAuthenticated } = useAuth();
  
  return useQuery({
    queryKey: ['breadcrumb', folderId],
    queryFn: () => foldersAPI.getBreadcrumb(folderId),
    select: (data) => data.data.breadcrumb || [],
    enabled: isAuthenticated && !!folderId
  });
};

export const useCreateFolder = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: foldersAPI.createFolder,
    onSuccess: () => {
      // Invalidate all folder-related queries
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      queryClient.invalidateQueries({ queryKey: ['folderTree'] });
    }
  });
};

export const useDeleteFolder = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: foldersAPI.deleteFolder,
    onSuccess: () => {
      // Invalidate all folder-related queries
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      queryClient.invalidateQueries({ queryKey: ['folderTree'] });
      // Invalidate files and quota since deleting folder deletes contained files
      queryClient.invalidateQueries({ queryKey: ['files'] });
      queryClient.invalidateQueries({ queryKey: ['quota'] });
    }
  });
};

export const useMoveFolder = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ folderId, targetParentId }) => foldersAPI.moveFolder(folderId, targetParentId),
    onSuccess: () => {
      // Invalidate all folder-related queries
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      queryClient.invalidateQueries({ queryKey: ['folderTree'] });
    }
  });
};