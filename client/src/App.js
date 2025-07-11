import React from 'react';
import { BrowserRouter as Router } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CustomThemeProvider } from './contexts/ThemeContext';
import { AuthProvider } from './contexts/AuthContext';
import { useAuth } from './contexts/AuthContext';
import AppRouter from './components/AppRouter';
import ErrorBoundary from './components/ErrorBoundary';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

// Component to clear React Query cache on login/logout
const QueryCacheClearer = ({ children }) => {
  const { user, loading } = useAuth();
  const [prevUser, setPrevUser] = React.useState(user);
  const [initialized, setInitialized] = React.useState(false);

  React.useEffect(() => {
    // Wait for auth to initialize before tracking user changes
    if (!loading && !initialized) {
      setPrevUser(user);
      setInitialized(true);
      return;
    }

    // Only clear cache if user actually changed after initialization
    if (initialized && prevUser !== user) {
      queryClient.clear();
      setPrevUser(user);
    }
  }, [user, prevUser, loading, initialized]);

  return children;
};

function App() {
  return (
    <ErrorBoundary 
      fullScreen 
      title="Application Error"
      message="The application encountered an unexpected error. Please refresh the page to continue."
    >
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <CustomThemeProvider>
            <QueryCacheClearer>
            <Router
              future={{
                v7_startTransition: true,
                v7_relativeSplatPath: true
              }}
            >
              <AppRouter />
            </Router>
            </QueryCacheClearer>
          </CustomThemeProvider>
        </QueryClientProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
