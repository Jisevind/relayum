import React, { useState, useEffect } from 'react';
import { Box, Typography, Link, Divider } from '@mui/material';
import api from '../services/api';

/**
 * Footer component that displays version information and basic app info
 */
const Footer = () => {
  const [versionInfo, setVersionInfo] = useState(null);

  useEffect(() => {
    const fetchVersionInfo = async () => {
      try {
        const response = await api.get('/version');
        setVersionInfo(response.data);
      } catch (error) {
        console.debug('Could not fetch version info:', error);
        // Fallback to package.json version if available
        setVersionInfo({
          version: process.env.REACT_APP_VERSION || '1.0.0',
          name: 'Relayum'
        });
      }
    };

    fetchVersionInfo();
  }, []);

  return (
    <Box
      component="footer"
      sx={{
        position: 'sticky',
        bottom: 0,
        mt: 'auto',
        py: 2,
        px: 2,
        backgroundColor: 'background.paper',
        borderTop: '1px solid',
        borderColor: 'divider',
        zIndex: 1
      }}
    >
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        maxWidth: '1200px',
        mx: 'auto'
      }}>
        <Box>
          <Typography variant="body2" color="text.secondary">
            Relayum - Secure File Sharing
          </Typography>
        </Box>
        
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {versionInfo && (
            <>
              <Typography variant="caption" color="text.secondary">
                {versionInfo.name} v{versionInfo.version}
              </Typography>
              <Divider orientation="vertical" flexItem sx={{ height: 16 }} />
            </>
          )}
          <Link
            href="https://github.com/jisevind/relayum"
            target="_blank"
            rel="noopener noreferrer"
            color="text.secondary"
            variant="caption"
            sx={{ textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
          >
            GitHub
          </Link>
        </Box>
      </Box>
    </Box>
  );
};

export default Footer;