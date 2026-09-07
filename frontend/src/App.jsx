import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField
} from '@mui/material';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import SetupWizard from './components/SetupWizard';
import Dashboard from './components/Dashboard';
import theme, { ink, sans } from './theme';
import api, {
  checkAuthRequired,
  getApiToken,
  setApiToken,
  setUnauthorizedHandler
} from './services/api';


function App() {
  const [isConfigured, setIsConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  // Shown when the server was started with AUTH_TOKEN and the browser has no
  // valid token for it. Without this the whole UI would just fail with 401s and
  // give the user nowhere to type the token in.
  const [tokenPromptOpen, setTokenPromptOpen] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [tokenRejected, setTokenRejected] = useState(false);

  useEffect(() => {
    // The response interceptor clears the stored token on a 401, so reopening
    // the prompt here is what lets the user correct a wrong or rotated token.
    setUnauthorizedHandler(() => {
      setTokenRejected(true);
      setTokenPromptOpen(true);
      setLoading(false);
    });

    start();

    return () => setUnauthorizedHandler(null);
  }, []);

  const start = async () => {
    try {
      const authRequired = await checkAuthRequired();

      if (authRequired && !getApiToken()) {
        setTokenPromptOpen(true);
        setLoading(false);
        return;
      }
    } catch (error) {
      // /health is unreachable: fall through and let the API call below produce
      // the error the user actually needs to see.
      console.error('Error checking whether the API requires a token:', error);
    }

    await checkConfiguration();
  };

  const checkConfiguration = async () => {
    try {
      const response = await api.get('/config/status');
      setIsConfigured(response.data.configured);
    } catch (error) {
      // A 401 is handled by the unauthorized handler above, which reopens the
      // prompt rather than dropping the user on the setup wizard.
      if (error.response?.status !== 401) {
        console.error('Error checking configuration:', error);
        setIsConfigured(false);
      }
    } finally {
      setLoading(false);
    }
  };

  const submitToken = async (event) => {
    event.preventDefault();

    if (!tokenInput.trim()) {
      return;
    }

    setApiToken(tokenInput.trim());
    setTokenInput('');
    setTokenRejected(false);
    setTokenPromptOpen(false);
    setLoading(true);
    await checkConfiguration();
  };

  const tokenDialog = (
    <Dialog open={tokenPromptOpen} maxWidth="xs" fullWidth disableEscapeKeyDown>
      <form onSubmit={submitToken}>
        <DialogTitle>API token required</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            {tokenRejected
              ? 'That token was rejected. Enter the AUTH_TOKEN this PiHoleVault was started with.'
              : 'This PiHoleVault requires an API token. Enter the AUTH_TOKEN it was started with.'}
          </DialogContentText>
          <TextField
            autoFocus
            fullWidth
            type="password"
            label="API token"
            value={tokenInput}
            onChange={(event) => setTokenInput(event.target.value)}
            error={tokenRejected}
          />
        </DialogContent>
        <DialogActions>
          <Button type="submit" variant="contained" disabled={!tokenInput.trim()}>
            Continue
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );

  if (tokenPromptOpen) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {tokenDialog}
      </ThemeProvider>
    );
  }

  if (loading) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100vh',
            backgroundColor: ink.ground
          }}
        >
          <Box sx={{ textAlign: 'center' }}>
            <Box sx={{ mb: 2.5, fontSize: '1.5rem', fontWeight: 600, letterSpacing: '-0.02em' }}>
              PiHoleVault
            </Box>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1.5,
                fontSize: '0.9375rem',
                color: 'text.secondary'
              }}
            >
              <CircularProgress size={16} thickness={5} sx={{ color: 'primary.main' }} />
              Loading
            </Box>
          </Box>
        </Box>
      </ThemeProvider>
    );
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
                  <Dashboard onReconfigure={() => setIsConfigured(false)} />
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
            newestOnTop={true}
            closeOnClick
            rtl={false}
            pauseOnFocusLoss
            draggable
            pauseOnHover
            theme="dark"
            style={{
              top: '80px', // Offset to avoid AppBar
              zIndex: 9999, // Ensure it's above other elements but not blocking AppBar
            }}
            toastStyle={{
              borderRadius: '10px',
              fontFamily: sans,
              fontSize: '0.875rem',
              backgroundColor: ink.raised,
              border: `1px solid ${ink.lineStrong}`,
              color: ink.text,
              boxShadow: 'none',
              margin: '8px'
            }}
          />
        </div>
      </Router>
    </ThemeProvider>
  );
}

export default App;
