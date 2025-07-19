import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { authAPI } from '../services/api';

export const useLogout = () => {
  const navigate = useNavigate();
  const { logout: authLogout } = useAuth();

  const logout = async () => {
    try {
      // Get config to determine redirect behavior
      const config = await authAPI.getConfig();
      
      // Perform logout
      await authLogout();
      
      // Redirect based on landing page setting
      if (config.data.enableLandingPage) {
        navigate('/');
      } else {
        navigate('/login');
      }
    } catch (error) {
      console.error('Logout failed:', error);
      // Fallback: always go to login if config fetch fails
      await authLogout();
      navigate('/login');
    }
  };

  return logout;
};