import React, { createContext, useContext, useState, useEffect } from 'react';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';
import DynamicThemeColor from '../components/DynamicThemeColor';

const ThemeContext = createContext();

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

// Material Design 3 Theme
const createAppTheme = (mode) => createTheme({
  palette: {
    mode,
    primary: {
      main: mode === 'light' ? '#6750A4' : '#D0BCFF',
      light: mode === 'light' ? '#7F69B7' : '#EADDFF',
      dark: mode === 'light' ? '#4F3A85' : '#B5A7E6',
      contrastText: mode === 'light' ? '#FFFFFF' : '#371E73',
    },
    secondary: {
      main: mode === 'light' ? '#625B71' : '#CCC2DC',
      light: mode === 'light' ? '#7F7589' : '#E8DEF8',
      dark: mode === 'light' ? '#4A4458' : '#B0A5C7',
      contrastText: mode === 'light' ? '#FFFFFF' : '#332D41',
    },
    error: {
      main: mode === 'light' ? '#BA1A1A' : '#FFB4AB',
      light: mode === 'light' ? '#DE3730' : '#FFDAD6',
      dark: mode === 'light' ? '#93000A' : '#F297A0',
      contrastText: mode === 'light' ? '#FFFFFF' : '#690005',
    },
    warning: {
      main: mode === 'light' ? '#936831' : '#FFB868',
      light: mode === 'light' ? '#B08450' : '#FFDDB3',
      dark: mode === 'light' ? '#774F26' : '#E49E4C',
      contrastText: mode === 'light' ? '#FFFFFF' : '#4A2800',
    },
    success: {
      main: mode === 'light' ? '#4F6B3D' : '#B7D18B',
      light: mode === 'light' ? '#6D8756' : '#D3EDB3',
      dark: mode === 'light' ? '#375028' : '#9CBB70',
      contrastText: mode === 'light' ? '#FFFFFF' : '#253518',
    },
    background: {
      default: mode === 'light' ? '#FFFBFE' : '#1C1B1F',
      paper: mode === 'light' ? '#FEF7FF' : '#2B2930',
    },
    text: {
      primary: mode === 'light' ? '#1C1B1F' : '#E6E1E5',
      secondary: mode === 'light' ? '#49454F' : '#CAC4D0',
    },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 20,
          textTransform: 'none',
          fontWeight: 500,
          boxShadow: 'none',
          '&:hover': {
            boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.3)',
          },
        },
        outlined: {
          borderColor: mode === 'light' ? '#79747E' : '#938F99',
          '&:hover': {
            backgroundColor: mode === 'light' ? 'rgba(103, 80, 164, 0.08)' : 'rgba(208, 188, 255, 0.08)',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow: mode === 'light' 
            ? '0px 1px 2px rgba(0, 0, 0, 0.3), 0px 1px 3px 1px rgba(0, 0, 0, 0.15)'
            : '0px 1px 2px rgba(0, 0, 0, 0.5), 0px 1px 3px 1px rgba(0, 0, 0, 0.3)',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 12,
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 12,
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          marginBottom: 4,
          '&:hover': {
            backgroundColor: mode === 'light' ? 'rgba(103, 80, 164, 0.08)' : 'rgba(208, 188, 255, 0.08)',
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 12,
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
        },
      },
    },
  },
});

export const CustomThemeProvider = ({ children }) => {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    // Check localStorage for saved theme preference
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
      return savedTheme === 'dark';
    }
    // Default to dark theme
    return true;
  });

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
  };

  useEffect(() => {
    // Save theme preference to localStorage
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  const currentTheme = createAppTheme(isDarkMode ? 'dark' : 'light');

  const value = {
    isDarkMode,
    toggleTheme,
    theme: currentTheme,
  };

  return (
    <ThemeContext.Provider value={value}>
      <ThemeProvider theme={currentTheme}>
        <CssBaseline />
        <DynamicThemeColor />
        {children}
      </ThemeProvider>
    </ThemeContext.Provider>
  );
};