import React, { useEffect, useRef, useState } from 'react';
import {
  Container,
  Typography,
  Button,
  Box,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Alert,
  Grid,
  IconButton,
  InputAdornment,
  Stack,
  Chip,
  useTheme,
  useMediaQuery,
  Switch,
  FormControlLabel,
} from '@mui/material';
import {
  Visibility,
  VisibilityOff,
  Storage,
  Schedule,
  CheckCircle,
  Check,
  ArrowForward,
  ArrowBack,
  Computer,
  Key,
  Notifications,
  Language,
  Terminal,
  SyncAlt,
} from '@mui/icons-material';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'react-toastify';
import api from '../services/api';
import { GlowCard, GradientText, IconTile, LiveDot, Shimmer } from './ui';
import { ink, gradient, monoText, labelText, ease } from '../theme';
import { describeCron } from '../utils/cron';

const steps = [
  'Pi-hole Server Configuration',
  'Backup Settings',
  'Schedule Configuration',
  'Discord Notifications',
  'SSH Key Setup'
];

const STEP_META = [
  { short: 'Connect', icon: <Computer />, subtitle: 'Point PiHoleVault at your Pi-hole' },
  { short: 'Storage', icon: <Storage />, subtitle: 'Where backups live and how many to keep' },
  { short: 'Schedule', icon: <Schedule />, subtitle: 'When backups run on their own' },
  { short: 'Notify', icon: <Notifications />, subtitle: 'Optional Discord pings (skip if you like)' },
  { short: 'Finish', icon: <Key />, subtitle: 'Secure the connection and save' }
];

const METHODS = [
  { value: 'web', title: 'Web / API', icon: <Language />, blurb: 'Best for Docker Pi-hole. No SSH needed.' },
  { value: 'hybrid', title: 'Hybrid', icon: <SyncAlt />, blurb: 'Web for status, SSH for backups. Most reliable.' },
  { value: 'ssh', title: 'SSH only', icon: <Terminal />, blurb: 'Traditional. Requires SSH access.' }
];

const CRON_PRESETS = [
  { cron: '0 3 * * *', label: 'Daily 03:00' },
  { cron: '0 */6 * * *', label: 'Every 6 hours' },
  { cron: '0 2 * * 0', label: 'Weekly, Sunday' },
  { cron: '0 1 1 * *', label: 'Monthly, 1st' }
];

const TIMEZONES = Array.from({ length: 25 }, (_, i) => {
  const offset = i - 12;
  return `GMT${offset < 0 ? '' : '+'}${offset}`;
});

// Steps slide in from the side you are heading towards.
const slide = {
  enter: (dir) => ({ opacity: 0, x: dir * 48 }),
  center: { opacity: 1, x: 0, transition: { duration: 0.45, ease } },
  exit: (dir) => ({ opacity: 0, x: dir * -48, transition: { duration: 0.25, ease } })
};

// Children of a step fade up one after another.
const fieldGroup = { center: { transition: { staggerChildren: 0.05, delayChildren: 0.1 } } };
const field = {
  enter: { opacity: 0, y: 10 },
  center: { opacity: 1, y: 0, transition: { duration: 0.4, ease } }
};
const F = ({ children, ...rest }) => (
  <motion.div variants={field} {...rest}>{children}</motion.div>
);

const StepHeader = ({ step }) => (
  <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 3.5 }}>
    <motion.div
      initial={{ scale: 0.6, rotate: -12, opacity: 0 }}
      animate={{ scale: 1, rotate: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 18 }}
    >
      <IconTile size={48}>{STEP_META[step].icon}</IconTile>
    </motion.div>
    <Box>
      <Typography sx={{ ...labelText, fontSize: '0.75rem' }}>Step {step + 1} of {steps.length}</Typography>
      <Typography variant="h3">{steps[step]}</Typography>
      <Typography variant="body2">{STEP_META[step].subtitle}</Typography>
    </Box>
  </Stack>
);

// Horizontal progress rail. The fill and the active ring both animate, the
// ring sliding between nodes via a shared layoutId.
const ProgressRail = ({ active, compact }) => (
  <Box sx={{ position: 'relative', mb: { xs: 3, md: 4 } }}>
    <Box sx={{ position: 'absolute', left: 18, right: 18, top: 17, height: 2, borderRadius: 2, backgroundColor: ink.line }} />
    <motion.div
      initial={false}
      animate={{ width: `calc((100% - 36px) * ${active / (steps.length - 1)})` }}
      transition={{ duration: 0.6, ease }}
      style={{ position: 'absolute', left: 18, top: 17, height: 2, borderRadius: 2, background: gradient.accent, boxShadow: `0 0 12px ${ink.accent}` }}
    />
    <Stack direction="row" justifyContent="space-between" sx={{ position: 'relative' }}>
      {STEP_META.map((meta, i) => {
        const done = i < active;
        const current = i === active;
        return (
          <Stack key={meta.short} alignItems="center" spacing={1} sx={{ width: 36 }}>
            <Box sx={{ position: 'relative', width: 36, height: 36 }}>
              {current && (
                <motion.div
                  layoutId="wizard-active-ring"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  style={{ position: 'absolute', inset: -5, borderRadius: '50%', border: `2px solid ${ink.accent}`, boxShadow: `0 0 18px ${ink.accent}66` }}
                />
              )}
              <motion.div
                initial={false}
                animate={{ scale: current ? 1.05 : 1 }}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 13,
                  fontWeight: 650,
                  color: done || current ? '#06101F' : ink.faint,
                  background: done || current ? gradient.accent : ink.raisedSolid,
                  border: `1px solid ${done || current ? 'transparent' : ink.lineStrong}`,
                  transition: 'background 300ms, color 300ms'
                }}
              >
                <AnimatePresence mode="wait" initial={false}>
                  {done ? (
                    <motion.span key="check" initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }} style={{ display: 'inline-flex' }}>
                      <Check sx={{ fontSize: 18 }} />
                    </motion.span>
                  ) : (
                    <motion.span key="num" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                      {i + 1}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.div>
            </Box>
            {!compact && (
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 550, whiteSpace: 'nowrap', color: current ? ink.text : ink.faint, transition: 'color 300ms' }}>
                {meta.short}
              </Typography>
            )}
          </Stack>
        );
      })}
    </Stack>
  </Box>
);

const Panel = ({ children, sx }) => (
  <Box sx={{ p: 2, borderRadius: '12px', border: `1px solid ${ink.line}`, backgroundColor: 'rgba(0,0,0,0.2)', ...sx }}>
    {children}
  </Box>
);

const StatusLine = ({ label, ok, okText, badText, warn }) => (
  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ py: 1 }}>
    <Typography variant="body2">{label}</Typography>
    <Stack direction="row" alignItems="center" spacing={1}>
      <LiveDot color={ok ? ink.ok : warn ? ink.warn : ink.bad} pulse={!ok} size={8} />
      <Typography sx={{ fontSize: '0.8125rem', fontWeight: 550, color: ok ? ink.ok : warn ? ink.warn : ink.bad }}>
        {ok ? okText : badText}
      </Typography>
    </Stack>
  </Stack>
);

const SetupWizard = ({ onComplete }) => {
  const [activeStep, setActiveStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  
  // Form data
  const [formData, setFormData] = useState({
    pihole: {
      host: '',
      connectionMethod: 'web', // Default to web-only
      username: '',
      password: '',
      port: 22,
      webPort: 80,
      useHttps: false,
      webPassword: '',
    },
    backup: {
      destinationPath: '/app/backups',
      maxBackups: 10,
    },
    schedule: {
      enabled: true,
      cronExpression: '0 3 * * *', // Daily at 3 AM
      timezone: 'GMT+3', // Default to GMT+3
    },
    discord: {
      enabled: false,
      webhookUrl: '',
      notifyOnSuccess: true,
      notifyOnFailure: true,
    }
  });

  const [sshStatus, setSshStatus] = useState({
    connected: false,
    keyDeployed: false,
    testing: false,
  });

  const handleNext = async () => {
    if (activeStep === steps.length - 1) {
      // On the last step - handle based on connection method
      if (formData.pihole.connectionMethod === 'web') {
        // Skip SSH key setup for web-only connections
        await handleFinish();
      } else {
        // Setup SSH key for SSH/hybrid connections
        await setupSSHKey();
      }
    } else {
      if (activeStep === 0) {
        await testConnection();
      } else if (activeStep === 2) {
        await validateSchedule();
      } else if (activeStep === 3) {
        await validateDiscordConfig();
      } else {
        setActiveStep((prevActiveStep) => prevActiveStep + 1);
      }
    }
  };

  const handleBack = () => {
    setActiveStep((prevActiveStep) => prevActiveStep - 1);
  };

    const testConnection = async () => {
    setLoading(true);
    try {
      const response = await api.post('/pihole/test-connection', formData.pihole);
      if (response.data.success) {
        // Update connection status
        setSshStatus(prev => ({ 
          ...prev, 
          connected: true,
          // For web-only connections, mark SSH as not required
          keyDeployed: formData.pihole.connectionMethod === 'web' ? true : prev.keyDeployed
        }));
        toast.success(`${response.data.message} (${response.data.method})`);
        setActiveStep((prevActiveStep) => prevActiveStep + 1);
      } else {
        toast.error(`Connection failed: ${response.data.error}`);
      }
    } catch (error) {
      toast.error('Connection test failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const validateSchedule = async () => {
    if (!formData.schedule.cronExpression) {
      toast.error('Please enter a valid cron expression');
      return;
    }
    
    try {
      const response = await api.post('/schedule/validate', {
        cronExpression: formData.schedule.cronExpression,
        timezone: formData.schedule.timezone
      });
      
      if (response.data.valid) {
        toast.success('Schedule configuration is valid!');
        setActiveStep((prevActiveStep) => prevActiveStep + 1);
      } else {
        toast.error('Invalid cron expression: ' + response.data.error);
      }
    } catch (error) {
      toast.error('Schedule validation failed: ' + error.message);
    }
  };

  const validateDiscordConfig = async () => {
    if (!formData.discord.enabled) {
      // Discord is optional, proceed to next step
      setActiveStep((prevActiveStep) => prevActiveStep + 1);
      return;
    }

    if (!formData.discord.webhookUrl) {
      toast.error('Please enter a Discord webhook URL or disable Discord notifications');
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/discord/test', {
        webhookUrl: formData.discord.webhookUrl
      });
      
      if (response.data.success) {
        toast.success('Discord webhook test successful!');
        setActiveStep((prevActiveStep) => prevActiveStep + 1);
      } else {
        toast.error('Discord webhook test failed: ' + response.data.error);
      }
    } catch (error) {
      toast.error('Discord webhook test failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const setupSSHKey = async () => {
    setLoading(true);
    setSshStatus(prev => ({ ...prev, testing: true }));
    
    try {
      const response = await api.post('/ssh/setup-key', formData.pihole);
      
      if (response.data.success) {
        setSshStatus({
          connected: true,
          keyDeployed: true,
          testing: false,
        });
        toast.success('SSH key deployed successfully!');
        handleFinish();
      } else {
        toast.error('SSH key deployment failed: ' + response.data.error);
        setSshStatus(prev => ({ ...prev, testing: false }));
      }
    } catch (error) {
      console.error('SSH key deployment error:', error);
      toast.error('SSH key deployment failed: ' + error.message);
      setSshStatus(prev => ({ ...prev, testing: false }));
    } finally {
      setLoading(false);
    }
  };

  const handleFinish = async () => {
    setLoading(true);
    try {
      const response = await api.post('/config/save', formData);
      
      if (response.data.success) {
        toast.success('Configuration saved successfully!');
        onComplete();
      } else {
        toast.error('Failed to save configuration: ' + response.data.error);
      }
    } catch (error) {
      toast.error('Failed to save configuration: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (section, field, value) => {
    // Special handling for Pi-hole host URL parsing
    if (section === 'pihole' && field === 'host' && formData.pihole.connectionMethod === 'web') {
      try {
        // If user enters a full URL, parse it and update related settings
        if (value.startsWith('http://') || value.startsWith('https://')) {
          const url = new URL(value);
          const isHttps = url.protocol === 'https:';
          const port = url.port ? parseInt(url.port) : (isHttps ? 443 : 80);
          
          setFormData(prev => ({
            ...prev,
            pihole: {
              ...prev.pihole,
              host: value, // Keep the full URL for web-only method
              useHttps: isHttps,
              webPort: port
            }
          }));
          return;
        }
      } catch (error) {
        // If URL parsing fails, just use the value as-is
        console.debug('URL parsing failed, using value as hostname:', error.message);
      }
    }

    setFormData(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value
      }
    }));
  };

  // Which way the step content should slide.
  const previousStep = useRef(activeStep);
  const direction = activeStep >= previousStep.current ? 1 : -1;
  useEffect(() => {
    previousStep.current = activeStep;
  }, [activeStep]);

  const passwordAdornment = (
    <InputAdornment position="end">
      <IconButton onClick={() => setShowPassword(!showPassword)} edge="end" aria-label={showPassword ? 'Hide password' : 'Show password'}>
        {showPassword ? <VisibilityOff /> : <Visibility />}
      </IconButton>
    </InputAdornment>
  );

  const deploySshKey = async () => {
    setSshStatus(prev => ({ ...prev, testing: true }));
    try {
      const response = await api.post('/ssh/setup-key', formData.pihole);
      if (response.data.success) {
        setSshStatus({
          connected: true,
          keyDeployed: true,
          testing: false,
        });
        toast.success('SSH key deployed successfully!');
      } else {
        toast.error('SSH key deployment failed: ' + response.data.error);
        setSshStatus(prev => ({ ...prev, testing: false }));
      }
    } catch (error) {
      console.error('SSH key deployment error:', error);
      toast.error('SSH key deployment failed: ' + error.message);
      setSshStatus(prev => ({ ...prev, testing: false }));
    }
  };

  const method = formData.pihole.connectionMethod;
  const usesSsh = method === 'ssh' || method === 'hybrid';
  const usesWeb = method === 'web' || method === 'hybrid';

  const getStepContent = (step) => {
    switch (step) {
      case 0:
        return (
          <>
            <F>
              <Typography sx={{ ...labelText, mb: 1.25 }}>Connection method</Typography>
              <Box
                role="radiogroup"
                aria-label="Connection method"
                sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 1.5, mb: 3 }}
              >
                {METHODS.map((m) => {
                  const selected = method === m.value;
                  return (
                    <Box
                      key={m.value}
                      component="button"
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => handleInputChange('pihole', 'connectionMethod', m.value)}
                      sx={{
                        all: 'unset',
                        boxSizing: 'border-box',
                        position: 'relative',
                        cursor: 'pointer',
                        p: 2,
                        borderRadius: '14px',
                        border: `1px solid ${selected ? 'transparent' : ink.lineStrong}`,
                        backgroundColor: selected ? 'rgba(91,140,255,0.08)' : 'rgba(255,255,255,0.02)',
                        transition: 'background-color 200ms, border-color 200ms, transform 200ms',
                        '&:hover': { borderColor: selected ? 'transparent' : 'rgba(91,140,255,0.4)', transform: 'translateY(-2px)' },
                        '&:focus-visible': { outline: `2px solid ${ink.accent}`, outlineOffset: 2 }
                      }}
                    >
                      {selected && (
                        <motion.div
                          // Not a shared layoutId: a layout animation inside the
                          // step's exiting subtree stalls AnimatePresence, and the
                          // next step never mounts.
                          initial={{ opacity: 0, scale: 0.94 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                          style={{
                            position: 'absolute',
                            inset: -1,
                            borderRadius: 14,
                            border: `1.5px solid ${ink.accent}`,
                            boxShadow: `0 0 0 4px ${ink.accentDim}, 0 10px 30px -12px ${ink.accent}`,
                            pointerEvents: 'none'
                          }}
                        />
                      )}
                      <Stack direction="row" alignItems="center" spacing={1.25} sx={{ mb: 1 }}>
                        <Box sx={{ color: selected ? ink.accent : ink.muted, display: 'inline-flex', transition: 'color 200ms' }}>{m.icon}</Box>
                        <Typography sx={{ fontWeight: 600, fontSize: '0.9375rem', color: ink.text }}>{m.title}</Typography>
                        <Box sx={{ flexGrow: 1 }} />
                        <AnimatePresence>
                          {selected && (
                            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} style={{ display: 'inline-flex' }}>
                              <CheckCircle sx={{ fontSize: 18, color: ink.accent }} />
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </Stack>
                      <Typography sx={{ fontSize: '0.8125rem', color: ink.muted, lineHeight: 1.45 }}>{m.blurb}</Typography>
                    </Box>
                  );
                })}
              </Box>
            </F>

            <Grid container spacing={2.5}>
              <Grid item xs={12} md={usesSsh ? 6 : 12}>
                <F>
                  <TextField
                    fullWidth
                    label={method === 'web' ? 'Pi-hole URL or Hostname' : 'Pi-hole Host IP'}
                    value={formData.pihole.host}
                    onChange={(e) => handleInputChange('pihole', 'host', e.target.value)}
                    placeholder={method === 'web' ? 'https://192.168.1.100/admin/ or 192.168.1.100' : '192.168.1.100'}
                    InputProps={{ sx: monoText }}
                    helperText={
                      method === 'web'
                        ? 'Full URL or just the host — HTTPS and port are detected from a URL'
                        : 'IP address or hostname of your Pi-hole server'
                    }
                  />
                </F>
              </Grid>

              {usesSsh && (
                <>
                  <Grid item xs={12} md={6}>
                    <F>
                      <TextField
                        fullWidth
                        label="SSH Port"
                        type="number"
                        value={formData.pihole.port}
                        onChange={(e) => handleInputChange('pihole', 'port', parseInt(e.target.value))}
                        helperText="Default SSH port is 22"
                      />
                    </F>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <F>
                      <TextField
                        fullWidth
                        label="SSH Username"
                        value={formData.pihole.username}
                        onChange={(e) => handleInputChange('pihole', 'username', e.target.value)}
                        placeholder="pi"
                        helperText="SSH username for Pi-hole server"
                      />
                    </F>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <F>
                      <TextField
                        fullWidth
                        label="SSH Password"
                        type={showPassword ? 'text' : 'password'}
                        value={formData.pihole.password}
                        onChange={(e) => handleInputChange('pihole', 'password', e.target.value)}
                        helperText="Used once to install a key, then discarded"
                        InputProps={{ endAdornment: passwordAdornment }}
                      />
                    </F>
                  </Grid>
                </>
              )}

              {usesWeb && (
                <>
                  <Grid item xs={6} md={4}>
                    <F>
                      <TextField
                        fullWidth
                        label="Web Port"
                        type="number"
                        value={formData.pihole.webPort}
                        onChange={(e) => handleInputChange('pihole', 'webPort', parseInt(e.target.value))}
                        helperText="Usually 80 or 8080"
                      />
                    </F>
                  </Grid>
                  <Grid item xs={6} md={3}>
                    <F>
                      <FormControlLabel
                        sx={{ mt: 1 }}
                        control={
                          <Switch
                            checked={formData.pihole.useHttps}
                            onChange={(e) => handleInputChange('pihole', 'useHttps', e.target.checked)}
                          />
                        }
                        label="Use HTTPS"
                      />
                    </F>
                  </Grid>
                  <Grid item xs={12} md={5}>
                    <F>
                      <TextField
                        fullWidth
                        label="Web Password"
                        type={showPassword ? 'text' : 'password'}
                        value={formData.pihole.webPassword}
                        onChange={(e) => handleInputChange('pihole', 'webPassword', e.target.value)}
                        helperText={method === 'web' ? 'Pi-hole admin password (required)' : 'Pi-hole admin password (optional)'}
                        required={method === 'web'}
                        InputProps={{ endAdornment: passwordAdornment }}
                      />
                    </F>
                  </Grid>
                </>
              )}

              {method === 'web' && (
                <Grid item xs={12}>
                  <F>
                    <Alert severity="info">
                      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Accepted formats</Typography>
                      <Box component="ul" sx={{ m: 0, pl: 2.25, '& code': { ...monoText, fontSize: '0.8125rem', color: ink.accent2 } }}>
                        <li><code>https://192.168.1.100/admin/</code> — HTTPS on 443</li>
                        <li><code>http://pihole.local/admin/</code> — HTTP on 80</li>
                        <li><code>https://pihole.example.com:8443/admin/</code> — custom port</li>
                        <li><code>192.168.1.100</code> — set the HTTPS toggle and port yourself</li>
                      </Box>
                      <Typography variant="body2" sx={{ mt: 1, color: 'inherit' }}>
                        The <code>/admin/</code> path is handled automatically.
                      </Typography>
                    </Alert>
                  </F>
                </Grid>
              )}
            </Grid>
          </>
        );
      case 1:
        return (
          <Grid container spacing={2.5}>
            <Grid item xs={12} md={8}>
              <F>
                <TextField
                  fullWidth
                  label="Backup Destination Path"
                  value={formData.backup.destinationPath}
                  onChange={(e) => handleInputChange('backup', 'destinationPath', e.target.value)}
                  InputProps={{ sx: monoText }}
                  helperText="Path inside the container where backups are written"
                />
              </F>
            </Grid>
            <Grid item xs={12} md={4}>
              <F>
                <TextField
                  fullWidth
                  label="Maximum Backups"
                  type="number"
                  value={formData.backup.maxBackups}
                  onChange={(e) => handleInputChange('backup', 'maxBackups', parseInt(e.target.value))}
                  helperText="Oldest are rotated out"
                  inputProps={{ min: 1, max: 100 }}
                />
              </F>
            </Grid>
            <Grid item xs={12}>
              <F>
                <Panel>
                  <Typography sx={{ ...labelText, mb: 1.5 }}>
                    Retention preview — {formData.backup.maxBackups || 0} restore points
                  </Typography>
                  <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', rowGap: 0.75 }}>
                    {Array.from({ length: Math.min(Math.max(formData.backup.maxBackups || 0, 0), 30) }).map((_, i) => (
                      <motion.div
                        key={i}
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 25, delay: i * 0.02 }}
                        style={{
                          width: 14,
                          height: 22,
                          borderRadius: 4,
                          background: i === 0 ? gradient.accent : 'rgba(91,140,255,0.22)',
                          border: '1px solid rgba(91,140,255,0.3)'
                        }}
                      />
                    ))}
                    {formData.backup.maxBackups > 30 && (
                      <Typography sx={{ ...labelText, alignSelf: 'center', pl: 0.5 }}>+{formData.backup.maxBackups - 30}</Typography>
                    )}
                  </Stack>
                </Panel>
              </F>
            </Grid>
          </Grid>
        );
      case 2:
        return (
          <Grid container spacing={2.5}>
            <Grid item xs={12}>
              <F>
                <FormControlLabel
                  control={
                    <Switch
                      checked={Boolean(formData.schedule.enabled)}
                      onChange={(e) => handleInputChange('schedule', 'enabled', e.target.checked)}
                    />
                  }
                  label="Run backups automatically"
                />
              </F>
            </Grid>
            <Grid item xs={12} md={8}>
              <F>
                <TextField
                  fullWidth
                  label="Cron Expression"
                  value={formData.schedule.cronExpression}
                  onChange={(e) => handleInputChange('schedule', 'cronExpression', e.target.value)}
                  InputProps={{ sx: monoText }}
                  helperText={describeCron(formData.schedule.cronExpression) || 'minute hour day month weekday'}
                  disabled={!formData.schedule.enabled}
                />
              </F>
            </Grid>
            <Grid item xs={12} md={4}>
              <F>
                <FormControl fullWidth>
                  <InputLabel>Timezone</InputLabel>
                  <Select
                    value={formData.schedule.timezone}
                    onChange={(e) => handleInputChange('schedule', 'timezone', e.target.value)}
                    label="Timezone"
                  >
                    {TIMEZONES.map((tz) => (
                      <MenuItem key={tz} value={tz}>
                        {tz}{tz === 'GMT+0' ? ' (UTC)' : tz === 'GMT+3' ? ' (Default)' : ''}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </F>
            </Grid>
            <Grid item xs={12}>
              <F>
                <Typography sx={{ ...labelText, mb: 1.25 }}>Quick picks</Typography>
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
                  {CRON_PRESETS.map((p) => {
                    const selected = formData.schedule.cronExpression === p.cron;
                    return (
                      <Chip
                        key={p.cron}
                        clickable
                        disabled={!formData.schedule.enabled}
                        onClick={() => handleInputChange('schedule', 'cronExpression', p.cron)}
                        label={
                          <span>
                            {p.label}
                            <Box component="span" sx={{ ...monoText, ml: 1, opacity: 0.6, fontSize: '0.6875rem' }}>{p.cron}</Box>
                          </span>
                        }
                        sx={{
                          height: 32,
                          px: 0.5,
                          border: `1px solid ${selected ? ink.accent : ink.lineStrong}`,
                          backgroundColor: selected ? ink.accentDim : 'rgba(255,255,255,0.02)',
                          color: selected ? ink.text : ink.muted,
                          transition: 'all 200ms'
                        }}
                      />
                    );
                  })}
                </Stack>
              </F>
            </Grid>
          </Grid>
        );
      case 3:
        return (
          <>
            <F>
              <Panel sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                <Box>
                  <Typography sx={{ fontWeight: 600, color: ink.text }}>Discord notifications</Typography>
                  <Typography variant="body2">Optional — you can set this up later from Settings.</Typography>
                </Box>
                <Switch
                  checked={formData.discord.enabled}
                  onChange={(e) => handleInputChange('discord', 'enabled', e.target.checked)}
                  inputProps={{ 'aria-label': 'Enable Discord notifications' }}
                />
              </Panel>
            </F>

            <AnimatePresence initial={false}>
              {formData.discord.enabled && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.35, ease }}
                  style={{ overflow: 'hidden' }}
                >
                  <Grid container spacing={2.5} sx={{ pt: 3 }}>
                    <Grid item xs={12}>
                      <TextField
                        fullWidth
                        label="Discord Webhook URL"
                        value={formData.discord.webhookUrl}
                        onChange={(e) => handleInputChange('discord', 'webhookUrl', e.target.value)}
                        placeholder="https://discord.com/api/webhooks/..."
                        helperText="Server settings → Integrations → Webhooks → Copy URL"
                        type="url"
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={formData.discord.notifyOnSuccess}
                            onChange={(e) => handleInputChange('discord', 'notifyOnSuccess', e.target.checked)}
                          />
                        }
                        label="Notify on success"
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={formData.discord.notifyOnFailure}
                            onChange={(e) => handleInputChange('discord', 'notifyOnFailure', e.target.checked)}
                          />
                        }
                        label="Notify on failure"
                      />
                    </Grid>
                  </Grid>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        );
      case 4:
        if (method === 'web') {
          return (
            <>
              <F>
                <Panel sx={{ mb: 2.5 }}>
                  <StatusLine label="Pi-hole web API" ok okText="Ready" />
                </Panel>
              </F>
              <F>
                <Alert severity="warning">
                  <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Heads up: web-only backups are limited</Typography>
                  <Typography variant="body2" sx={{ color: 'inherit' }}>
                    Pi-hole backups currently need SSH to run the teleporter command. Pick the
                    "Hybrid" method if you want full backup functionality.
                  </Typography>
                </Alert>
              </F>
            </>
          );
        }

        return (
          <>
            <F>
              <Typography variant="body2" sx={{ mb: 2.5 }}>
                PiHoleVault generates a key pair and installs the public key on your Pi-hole, so
                backups run password-less from now on.
              </Typography>
            </F>
            <F>
              <Panel sx={{ mb: 3 }}>
                <StatusLine label="Connection" ok={sshStatus.connected} okText="Connected" badText="Not connected" />
                <StatusLine label="SSH key" ok={sshStatus.keyDeployed} warn okText="Deployed" badText="Not deployed" />
              </Panel>
            </F>
            {!sshStatus.keyDeployed && (
              <F>
                <Button
                  variant="contained"
                  onClick={deploySshKey}
                  disabled={sshStatus.testing}
                  startIcon={sshStatus.testing ? <CircularProgress size={16} color="inherit" /> : <Key />}
                  sx={{ position: 'relative', overflow: 'hidden' }}
                >
                  {sshStatus.testing && <Shimmer />}
                  {sshStatus.testing ? 'Deploying SSH key…' : 'Deploy SSH key'}
                </Button>
              </F>
            )}
          </>
        );
      default:
        return 'Unknown step';
    }
  };

  const isStepValid = (step) => {
    switch (step) {
      case 0:
        // Basic validation
        if (!formData.pihole.host) return false;
        
        // SSH validation
        if (formData.pihole.connectionMethod === 'ssh' || formData.pihole.connectionMethod === 'hybrid') {
          if (!formData.pihole.username || !formData.pihole.password) return false;
        }
        
        // Web validation  
        if (formData.pihole.connectionMethod === 'web' || formData.pihole.connectionMethod === 'hybrid') {
          if (!formData.pihole.webPort) return false;
        }
        
        return true;
      case 1:
        return formData.backup.destinationPath && formData.backup.maxBackups > 0;
      case 2:
        return formData.schedule.cronExpression;
      case 3:
        return true; // Discord notifications are optional
      case 4:
        // SSH key deployment only required for SSH-based methods
        if (formData.pihole.connectionMethod === 'web') {
          return true; // No SSH key needed for web-only
        }
        return sshStatus.keyDeployed;
      default:
        return false;
    }
  };

  const isLast = activeStep === steps.length - 1;

  return (
    <Box sx={{ minHeight: '100vh', py: { xs: 4, md: 7 } }}>
      <Container maxWidth="md">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease }}
          style={{ textAlign: 'center', marginBottom: 32 }}
        >
          <motion.div
            initial={{ scale: 0.7, rotate: -8 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 14 }}
            style={{ display: 'inline-block', marginBottom: 20 }}
          >
            <motion.div
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Box
                component="img"
                src="/logo.png"
                alt="PiHoleVault Logo"
                sx={{
                  height: 76,
                  width: 'auto',
                  borderRadius: '20px',
                  boxShadow: `0 0 0 1px rgba(255,255,255,0.08), 0 20px 50px -12px ${ink.accent}99`
                }}
              />
            </motion.div>
          </motion.div>
          <Typography variant="h1" sx={{ fontSize: { xs: '1.875rem', md: '2.5rem' }, mb: 1 }}>
            Welcome to <GradientText>PiHoleVault</GradientText>
          </Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: '1.0625rem', maxWidth: 520, mx: 'auto' }}>
            Five quick steps and your Pi-hole config is backed up on autopilot.
          </Typography>
        </motion.div>

        {/* Setup Card */}
        <GlowCard
          glow={false}
          initial="hidden"
          animate="show"
          sx={{ p: { xs: 2.5, md: 4 }, mb: 4 }}
        >
          <ProgressRail active={activeStep} compact={isMobile} />

          <Box sx={{ position: 'relative', minHeight: 280 }}>
            <AnimatePresence mode="wait" custom={direction} initial={false}>
              <motion.div
                key={activeStep}
                custom={direction}
                variants={{ ...slide, center: { ...slide.center, ...fieldGroup.center, transition: { ...slide.center.transition, ...fieldGroup.center.transition } } }}
                initial="enter"
                animate="center"
                exit="exit"
              >
                <StepHeader step={activeStep} />
                {getStepContent(activeStep)}
              </motion.div>
            </AnimatePresence>
          </Box>

          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              mt: 4,
              pt: 3,
              borderTop: `1px solid ${ink.line}`
            }}
          >
            <Button
              disabled={activeStep === 0}
              onClick={handleBack}
              startIcon={<ArrowBack />}
              variant="text"
            >
              Back
            </Button>

            <Button
              variant="contained"
              size="large"
              onClick={handleNext}
              disabled={loading || !isStepValid(activeStep)}
              endIcon={
                loading ? (
                  <CircularProgress size={16} color="inherit" />
                ) : isLast ? (
                  <CheckCircle />
                ) : (
                  <ArrowForward />
                )
              }
              sx={{ position: 'relative', overflow: 'hidden', px: 3, '&:hover .MuiButton-endIcon': { transform: 'translateX(3px)' }, '& .MuiButton-endIcon': { transition: 'transform 200ms' } }}
            >
              {loading && <Shimmer />}
              {loading
                ? (activeStep === 0 ? 'Testing connection…' : 'Working…')
                : isLast
                  ? 'Finish setup'
                  : activeStep === 0
                    ? 'Test & continue'
                    : 'Continue'
              }
            </Button>
          </Box>
        </GlowCard>
      </Container>
    </Box>
  );
};

export default SetupWizard;
