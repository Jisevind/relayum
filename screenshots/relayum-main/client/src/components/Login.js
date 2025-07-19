import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import {
  Box,
  Container,
  Paper,
  TextField,
  Button,
  Typography,
  Alert,
  Stack,
  Link as MuiLink,
  Chip,
} from '@mui/material';
import Footer from './Footer';

const Login = ({ onSuccess }) => {
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { login, config } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const result = await login(formData);
    
    if (result.success) {
      if (onSuccess) {
        onSuccess();
      } else {
        navigate('/dashboard');
      }
    } else {
      // Handle rate limiting and other errors with specific messages
      if (result.status === 429) {
        setError('Too many failed login attempts. Please try again later.');
      } else if (result.error) {
        setError(result.error);
      } else {
        setError('Login failed. Please try again.');
      }
    }
    
    setLoading(false);
  };

  return (
    <Container component="main" maxWidth="sm">
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          position: 'relative',
        }}
      >
        <Paper
          elevation={0}
          sx={{
            padding: 4,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            width: '100%',
            maxWidth: 400,
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              mb: 3,
            }}
          >
            <img
              src="/images/logo.svg"
              alt="Relayum Logo"
              style={{
                width: 48,
                height: 48,
                marginRight: 8,
              }}
            />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography
                component="h1"
                variant="h4"
                sx={{
                  fontWeight: 500,
                  color: 'primary.main',
                }}
              >
                Relayum
              </Typography>
              <Chip
                label="BETA"
                size="small"
                color="warning"
                variant="outlined"
                sx={{ 
                  fontSize: '0.65rem', 
                  height: 22, 
                  fontWeight: 'bold',
                  borderRadius: 1
                }}
              />
            </Box>
          </Box>

          <Typography
            component="h2"
            variant="h5"
            sx={{
              mb: 3,
              textAlign: 'center',
              fontWeight: 400,
            }}
          >
            Sign in to your account
          </Typography>

          <Box component="form" onSubmit={handleSubmit} sx={{ width: '100%' }}>
            <Stack spacing={3}>
              {error && (
                <Alert severity="error" sx={{ borderRadius: 2 }}>
                  {error}
                </Alert>
              )}

              <TextField
                required
                fullWidth
                id="username"
                label="Username"
                name="username"
                autoComplete="username"
                autoFocus
                value={formData.username}
                onChange={handleChange}
                variant="outlined"
              />

              <TextField
                required
                fullWidth
                name="password"
                label="Password"
                type="password"
                id="password"
                autoComplete="current-password"
                value={formData.password}
                onChange={handleChange}
                variant="outlined"
              />

              <Button
                type="submit"
                fullWidth
                variant="contained"
                disabled={loading}
                sx={{
                  mt: 3,
                  mb: 2,
                  height: 48,
                }}
              >
                {loading ? 'Signing in...' : 'Sign in'}
              </Button>

              {config?.allowRegistration && (
                <Box sx={{ textAlign: 'center' }}>
                  <MuiLink
                    component={Link}
                    to="/register"
                    variant="body2"
                    sx={{
                      textDecoration: 'none',
                      '&:hover': {
                        textDecoration: 'underline',
                      },
                    }}
                  >
                    Don't have an account? Sign up
                  </MuiLink>
                </Box>
              )}
            </Stack>
          </Box>
        </Paper>
      </Box>
      <Footer />
    </Container>
  );
};

export default Login;