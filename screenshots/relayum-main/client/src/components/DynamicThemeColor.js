import { useEffect } from 'react';
import { useTheme } from '../contexts/ThemeContext';

const DynamicThemeColor = () => {
  const { isDarkMode } = useTheme();

  useEffect(() => {
    // Update the theme-color meta tag based on current theme
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', isDarkMode ? '#1e1e1e' : '#1976d2');
    }
  }, [isDarkMode]);

  return null; // This component doesn't render anything
};

export default DynamicThemeColor;