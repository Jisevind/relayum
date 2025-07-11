import React, { useState } from 'react';
import { sharesAPI } from '../services/api';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Radio,
  RadioGroup,
  FormControlLabel,
  FormControl,
  FormLabel,
  Alert,
  IconButton,
  Typography,
  Stack,
  Box,
  Chip,
} from '@mui/material';
import {
  Close,
  Share,
  Public,
  Person,
  Schedule,
  ContentCopy,
  Lock,
} from '@mui/icons-material';

const ShareModal = ({ file, folder, onClose }) => {
  const [shareType, setShareType] = useState('public');
  const [usernameInput, setUsernameInput] = useState('');
  const [selectedUsernames, setSelectedUsernames] = useState([]);
  const [expiresAt, setExpiresAt] = useState('');
  const [sharePassword, setSharePassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [publicUrl, setPublicUrl] = useState('');
  const [privateUrls, setPrivateUrls] = useState([]);


  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      // Handle authenticated user sharing only
      const shareData = {
        isPublic: shareType === 'public',
        expiresAt: expiresAt && expiresAt.trim() !== '' ? expiresAt : null,
        sharePassword: sharePassword || null
      };

      // Set either fileId or folderId
      if (file) {
        shareData.fileId = file.id;
      } else if (folder) {
        shareData.folderId = folder.id;
      }

      if (shareType === 'user') {
        if (!selectedUsernames || selectedUsernames.length === 0) {
          setError('At least one username is required for user shares');
          setLoading(false);
          return;
        }
        shareData.sharedWith = selectedUsernames;
      }

      const response = await sharesAPI.createShare(shareData);
      
      if (shareType === 'public') {
        const url = `${window.location.origin}/public/${response.data.share.public_token}`;
        setPublicUrl(url);
        setSuccess('Public link created successfully!');
      } else {
        const itemType = file ? 'File' : 'Folder';
        const userCount = selectedUsernames.length;
        const userText = userCount === 1 ? selectedUsernames[0] : `${userCount} users`;
        
        // Generate private share URLs
        const privateShareUrls = response.data.shares.map((share, index) => ({
          username: selectedUsernames[index],
          url: `${window.location.origin}/private/${share.private_token}`,
          token: share.private_token
        }));
        
        setPrivateUrls(privateShareUrls);
        setSuccess(`${itemType} shared with ${userText} successfully`);
      }
    } catch (error) {
      setError(error.response?.data?.error || 'Failed to create share');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
      setSuccess('Link copied to clipboard!');
    } catch (error) {
      setError('Failed to copy link to clipboard');
    }
  };

  return (
    <Dialog 
      open={true} 
      onClose={onClose} 
      maxWidth="sm" 
      fullWidth
      PaperProps={{
        sx: { borderRadius: 2 }
      }}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Share color="primary" />
            <Typography variant="h6" component="span">
              Share "{file ? file.filename : folder ? folder.name : 'Item'}"
            </Typography>
          </Box>
          <IconButton onClick={onClose} size="small">
            <Close />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent>
        <Box component="form" onSubmit={handleSubmit} sx={{ pt: 1 }}>
          <Stack spacing={3}>
            <FormControl component="fieldset">
              <FormLabel component="legend" sx={{ mb: 1 }}>
                <Typography variant="subtitle2">Share Type</Typography>
              </FormLabel>
              <RadioGroup
                value={shareType}
                onChange={(e) => setShareType(e.target.value)}
              >
                <FormControlLabel
                  value="public"
                  control={<Radio />}
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Public fontSize="small" />
                      <Typography variant="body2">Public Link</Typography>
                    </Box>
                  }
                />
                <FormControlLabel
                  value="user"
                  control={<Radio />}
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Person fontSize="small" />
                      <Typography variant="body2">Share with User</Typography>
                    </Box>
                  }
                />
              </RadioGroup>
            </FormControl>

            {shareType === 'user' && (
              <Stack spacing={2}>
                <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1 }}>
                  <TextField
                    label="Username"
                    placeholder="Enter exact username"
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                    variant="outlined"
                    fullWidth
                    InputProps={{
                      startAdornment: <Person sx={{ color: 'text.secondary', mr: 1 }} />
                    }}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const username = usernameInput.trim();
                        if (username && !selectedUsernames.includes(username)) {
                          setSelectedUsernames([...selectedUsernames, username]);
                          setUsernameInput('');
                        }
                      }
                    }}
                  />
                  <Button
                    variant="outlined"
                    onClick={() => {
                      const username = usernameInput.trim();
                      if (username && !selectedUsernames.includes(username)) {
                        setSelectedUsernames([...selectedUsernames, username]);
                        setUsernameInput('');
                      }
                    }}
                    disabled={!usernameInput.trim() || selectedUsernames.includes(usernameInput.trim())}
                  >
                    Add
                  </Button>
                </Box>
                {selectedUsernames.length > 0 && (
                  <Box>
                    <Typography variant="subtitle2" gutterBottom>
                      Selected Users:
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {selectedUsernames.map((username, index) => (
                        <Chip
                          key={index}
                          variant="outlined"
                          label={username}
                          onDelete={() => {
                            setSelectedUsernames(selectedUsernames.filter((_, i) => i !== index));
                          }}
                        />
                      ))}
                    </Box>
                  </Box>
                )}
                <Typography variant="caption" color="text.secondary">
                  💡 Enter the exact username of users you want to share with. You must know their username.
                </Typography>
              </Stack>
            )}

            <TextField
              label="Expires At (Optional)"
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              fullWidth
              variant="outlined"
              InputLabelProps={{
                shrink: true,
              }}
              InputProps={{
                startAdornment: <Schedule sx={{ color: 'text.secondary', mr: 1 }} />
              }}
            />

            <TextField
              label="Share Password (Optional)"
              type="password"
              value={sharePassword}
              onChange={(e) => setSharePassword(e.target.value)}
              fullWidth
              variant="outlined"
              placeholder="Enter password for extra security"
              InputProps={{
                startAdornment: <Lock sx={{ color: 'text.secondary', mr: 1 }} />
              }}
              helperText="If set, users will need this password to download the shared content"
            />

            {error && (
              <Alert severity="error">
                {error}
              </Alert>
            )}

            {success && (
              <Alert severity="success">
                {success}
              </Alert>
            )}

            {publicUrl && (
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  Secure Public Link
                </Typography>
                <Box sx={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 1,
                  p: 2,
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  bgcolor: 'background.paper'
                }}>
                  <Typography 
                    variant="body2" 
                    sx={{ 
                      flexGrow: 1, 
                      wordBreak: 'break-all',
                      fontFamily: 'monospace'
                    }}
                  >
                    {publicUrl}
                  </Typography>
                  <IconButton 
                    onClick={() => copyToClipboard(publicUrl)}
                    size="small"
                    color="primary"
                  >
                    <ContentCopy />
                  </IconButton>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                  🔒 This link uses a secure token and is rate-limited to prevent abuse. 
                  {expiresAt && ` Link expires on ${new Date(expiresAt).toLocaleDateString()}.`}
                </Typography>
              </Box>
            )}


            {privateUrls.length > 0 && (
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  Secure Private Links
                </Typography>
                <Stack spacing={2}>
                  {privateUrls.map((privateUrl, index) => (
                    <Box key={index}>
                      <Typography variant="body2" sx={{ fontWeight: 'medium', mb: 1 }}>
                        For {privateUrl.username}:
                      </Typography>
                      <Box sx={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: 1,
                        p: 2,
                        border: '1px solid',
                        borderColor: 'divider',
                        borderRadius: 1,
                        bgcolor: 'background.paper'
                      }}>
                        <Typography 
                          variant="body2" 
                          sx={{ 
                            flexGrow: 1, 
                            wordBreak: 'break-all',
                            fontFamily: 'monospace',
                            fontSize: '0.8rem'
                          }}
                        >
                          {privateUrl.url}
                        </Typography>
                        <IconButton 
                          onClick={() => copyToClipboard(privateUrl.url)}
                          size="small"
                          color="primary"
                        >
                          <ContentCopy />
                        </IconButton>
                      </Box>
                    </Box>
                  ))}
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                  🔒 These links are secure and only accessible by the specific users they were shared with.
                  {expiresAt && ` Links expire on ${new Date(expiresAt).toLocaleDateString()}.`}
                </Typography>
              </Box>
            )}
          </Stack>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} variant="outlined">
          {(publicUrl || privateUrls.length > 0) ? 'Close' : 'Cancel'}
        </Button>
        {!(publicUrl || privateUrls.length > 0) && (
          <Button
            type="submit"
            onClick={handleSubmit}
            variant="contained"
            disabled={loading}
            startIcon={<Share />}
          >
            {loading ? 'Creating...' : 'Create Share'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default ShareModal;