import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { authAPI } from '../services/api';
import ThemeToggle from './ThemeToggle';
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
  CircularProgress,
  InputAdornment,
} from '@mui/material';
import { CheckCircle, Cancel } from '@mui/icons-material';

const Register = () => {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState({
    checking: false,
    available: null,
    message: ''
  });
  
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  // Debounced username availability check
  useEffect(() => {
    const checkUsernameAvailability = async () => {
      const username = formData.username.trim();
      
      if (username.length < 2) {
        setUsernameStatus({ checking: false, available: null, message: '' });
        return;
      }

      setUsernameStatus({ checking: true, available: null, message: '' });
      
      try {
        const response = await authAPI.checkUsernameAvailability(username);
        const isAvailable = response.data.available;
        
        setUsernameStatus({
          checking: false,
          available: isAvailable,
          message: isAvailable ? 'Username is available' : 'Username is already taken'
        });
      } catch (error) {
        setUsernameStatus({
          checking: false,
          available: null,
          message: 'Error checking username availability'
        });
      }
    };

    const timeoutId = setTimeout(checkUsernameAvailability, 500);
    return () => clearTimeout(timeoutId);
  }, [formData.username]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    if (usernameStatus.available === false) {
      setError('Please choose an available username');
      setLoading(false);
      return;
    }

    const result = await register({
      username: formData.username,
      email: formData.email,
      password: formData.password
    });
    
    if (result.success) {
      navigate('/dashboard');
    } else {
      // Handle registration disabled and other errors
      if (result.status === 403) {
        setError('User registration is currently disabled. Please contact an administrator.');
      } else if (result.error) {
        setError(result.error);
      } else {
        setError('Registration failed. Please try again.');
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
        <Box sx={{ position: 'absolute', top: 16, right: 16 }}>
          <ThemeToggle />
        </Box>
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
            Create an account
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
                error={usernameStatus.available === false}
                helperText={usernameStatus.message}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      {usernameStatus.checking && <CircularProgress size={20} />}
                      {usernameStatus.available === true && <CheckCircle color="success" />}
                      {usernameStatus.available === false && <Cancel color="error" />}
                    </InputAdornment>
                  ),
                }}
              />

              <TextField
                required
                fullWidth
                id="email"
                label="Email Address"
                name="email"
                autoComplete="email"
                type="email"
                value={formData.email}
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
                autoComplete="new-password"
                value={formData.password}
                onChange={handleChange}
                variant="outlined"
              />

              <TextField
                required
                fullWidth
                name="confirmPassword"
                label="Confirm Password"
                type="password"
                id="confirmPassword"
                autoComplete="new-password"
                value={formData.confirmPassword}
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
                {loading ? 'Creating account...' : 'Sign up'}
              </Button>

              <Box sx={{ textAlign: 'center' }}>
                <MuiLink
                  component={Link}
                  to="/login"
                  variant="body2"
                  sx={{
                    textDecoration: 'none',
                    '&:hover': {
                      textDecoration: 'underline',
                    },
                  }}
                >
                  Already have an account? Sign in
                </MuiLink>
              </Box>
            </Stack>
          </Box>
        </Paper>
      </Box>
    </Container>
  );
};

export default Register;