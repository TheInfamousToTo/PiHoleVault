import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import SetupWizard from './components/SetupWizard';
import Dashboard from './components/Dashboard';
import api from './services/api';

const theme = createTheme({
  palette: {
    primary: {
      main: '#96060c', // Pi-hole red
      light: '#c9302c',
      dark: '#5d0004',
    },
    secondary: {
      main: '#007cba', // Pi-hole blue
      light: '#42a5f5',
      dark: '#0056b3',
    },
    success: {
      main: '#5cb85c', // Pi-hole green
      light: '#7dc17d',
      dark: '#449d44',
    },
    background: {
      default: '#f8f9fa',
      paper: '#ffffff',
    },
    text: {
      primary: '#333333',
      secondary: '#666666',
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h4: {
      fontWeight: 600,
      color: '#333333',
    },
    h6: {
      fontWeight: 600,
      color: '#333333',
    },
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          borderRadius: '8px',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: '6px',
          textTransform: 'none',
          fontWeight: 500,
        },
      },
    },
  },
});

function App() {
  const [isConfigured, setIsConfigured] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkConfiguration();
  }, []);

  const checkConfiguration = async () => {
    try {
      const response = await api.get('/config/status');
      setIsConfigured(response.data.configured);
    } catch (error) {
      console.error('Error checking configuration:', error);
      setIsConfigured(false);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <div className="App">
          <Routes>
            <Route 
              path="/setup" 
              element={
                !isConfigured ? (
                  <SetupWizard onComplete={() => setIsConfigured(true)} />
                ) : (
                  <Navigate to="/dashboard" replace />
                )
              } 
            />
            <Route 
              path="/dashboard" 
              element={
                isConfigured ? (
                  <Dashboard />
                ) : (
                  <Navigate to="/setup" replace />
                )
              } 
            />
            <Route 
              path="/" 
              element={
                <Navigate to={isConfigured ? "/dashboard" : "/setup"} replace />
              } 
            />
          </Routes>
          <ToastContainer
            position="top-right"
            autoClose={5000}
            hideProgressBar={false}
            newestOnTop={false}
            closeOnClick
            rtl={false}
            pauseOnFocusLoss
            draggable
            pauseOnHover
          />
        </div>
      </Router>
    </ThemeProvider>
  );
}

export default App;
