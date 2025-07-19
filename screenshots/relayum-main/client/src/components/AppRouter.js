import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { authAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import ProtectedRoute from './ProtectedRoute';
import Landing from './Landing';
import Login from './Login';
import Register from './Register';
import Dashboard from './Dashboard';
import PublicShare from './PublicShare';
import PrivateShare from './PrivateShare';
import AnonymousShare from './AnonymousShare';
import ErrorBoundary from './ErrorBoundary';

const AppRouter = () => {
  const { user, loading } = useAuth();
  const [config, setConfig] = useState({ 
    enableLandingPage: true,
    allowRegistration: true
  });
  const [configLoaded, setConfigLoaded] = useState(false);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await authAPI.getConfig();
        setConfig(response.data);
      } catch (error) {
        // Default to enabling landing page if config fetch fails
        const defaultConfig = { 
          enableLandingPage: true,
          allowRegistration: true
        };

        setConfig(defaultConfig);
      } finally {
        setConfigLoaded(true);
      }
    };
    fetchConfig();
  }, []);

  // Don't render routes until config is loaded and auth is not loading
  if (!configLoaded || loading) {
    return null; // Or a loading spinner
  }

  return (
    <Routes>
      {/* Smart root route: redirect authenticated users to dashboard */}
      <Route path="/" element={
        user ? (
          <>
            <Navigate to="/dashboard" replace />
          </>
        ) : config.enableLandingPage ? (
          <>
            <ErrorBoundary title="Landing Page Error">
              <Landing />
            </ErrorBoundary>
          </>
        ) : (
          <>
            <Navigate to="/login" replace />
          </>
        )
      } />
      
      <Route path="/login" element={
        <ErrorBoundary title="Login Error">
          <Login />
        </ErrorBoundary>
      } />
      
      {/* Only show register route if registration is enabled */}
      {config.allowRegistration && (
        <Route path="/register" element={
          <ErrorBoundary title="Registration Error">
            <Register />
          </ErrorBoundary>
        } />
      )}
      
      <Route path="/public/:token" element={
        <ErrorBoundary title="Share Access Error">
          <PublicShare />
        </ErrorBoundary>
      } />
      
      <Route path="/anonymous/:token" element={
        <ErrorBoundary title="Anonymous Share Access Error">
          <AnonymousShare />
        </ErrorBoundary>
      } />
      
      <Route path="/private/:token" element={
        <ProtectedRoute>
          <ErrorBoundary title="Private Share Access Error">
            <PrivateShare />
          </ErrorBoundary>
        </ProtectedRoute>
      } />
      
      <Route 
        path="/dashboard" 
        element={
          <ProtectedRoute>
            <ErrorBoundary title="Dashboard Error">
              <Dashboard />
            </ErrorBoundary>
          </ProtectedRoute>
        } 
      />
    </Routes>
  );
};

export default AppRouter;