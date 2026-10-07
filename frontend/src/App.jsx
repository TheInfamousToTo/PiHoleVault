import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField
} from '@mui/material';
import { ToastContainer, Slide as ToastSlide } from 'react-toastify';
import { MotionConfig, motion } from 'framer-motion';
import 'react-toastify/dist/ReactToastify.css';

import SetupWizard from './components/SetupWizard';
import Dashboard from './components/Dashboard';
import { AmbientBackground } from './components/ui';
import theme, { ink, sans, gradient, ease } from './theme';
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
          <DialogContentText sx={{ mb: 2.5 }}>
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

  // Every screen sits on the same ambient background, and framer-motion is
  // told to follow the OS reduced-motion setting everywhere.
  const shell = (children) => (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <MotionConfig reducedMotion="user">
        <AmbientBackground />
        <Box sx={{ position: 'relative', zIndex: 1 }}>{children}</Box>
      </MotionConfig>
    </ThemeProvider>
  );

  if (tokenPromptOpen) {
    return shell(tokenDialog);
  }

  if (loading) {
    return shell(
      <Box sx={{ display: 'grid', placeItems: 'center', height: '100vh' }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease }}
          style={{ textAlign: 'center' }}
        >
          <Box sx={{ position: 'relative', width: 96, height: 96, mx: 'auto', mb: 3 }}>
            {/* Two counter-rotating arcs around the logo. */}
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                border: '2px solid transparent',
                borderTopColor: ink.accent,
                borderRightColor: ink.accent2,
                animation: 'pv-spin 1.1s linear infinite'
              }}
            />
            <Box
              sx={{
                position: 'absolute',
                inset: 10,
                borderRadius: '50%',
                border: '2px solid transparent',
                borderBottomColor: 'rgba(91,140,255,0.45)',
                animation: 'pv-spin 1.6s linear infinite reverse'
              }}
            />
            <Box
              component="img"
              src="/logo.svg"
              alt=""
              sx={{ position: 'absolute', inset: 24, width: 48, height: 48, borderRadius: '12px' }}
            />
          </Box>
          <Box
            sx={{
              fontSize: '1.5rem',
              fontWeight: 650,
              letterSpacing: '-0.03em',
              background: gradient.text,
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}
          >
            PiHoleVault
          </Box>
          <Box sx={{ mt: 0.75, fontSize: '0.875rem', color: 'text.secondary' }}>Opening the vault…</Box>
        </motion.div>
      </Box>
    );
  }

  return shell(
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
          position="bottom-right"
          autoClose={5000}
          hideProgressBar={false}
          newestOnTop={true}
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
          theme="dark"
          transition={ToastSlide}
          style={{ zIndex: 9999 }}
          toastStyle={{
            borderRadius: '14px',
            fontFamily: sans,
            fontSize: '0.875rem',
            backgroundColor: 'rgba(22, 28, 40, 0.92)',
            backdropFilter: 'blur(14px)',
            border: `1px solid ${ink.lineStrong}`,
            color: ink.text,
            boxShadow: '0 20px 40px -20px rgba(0,0,0,0.7)',
            margin: '8px'
          }}
        />
      </div>
    </Router>
  );
}

export default App;
