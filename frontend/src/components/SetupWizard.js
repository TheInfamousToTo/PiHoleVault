import React, { useState } from 'react';
import {
  Container,
  Stepper,
  Step,
  StepLabel,
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
  Card,
  CardContent,
  IconButton,
  InputAdornment,
  Stack,
  Avatar,
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
  Shield,
  CheckCircle,
  ArrowForward,
  ArrowBack,
  Computer,
  Key,
  Notifications,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import api from '../services/api';

const steps = [
  'Pi-hole Server Configuration',
  'Backup Settings',
  'Schedule Configuration',
  'Discord Notifications',
  'SSH Key Setup'
];

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

  const getStepContent = (step) => {
    switch (step) {
      case 0:
        return (
          <Card sx={{ mt: 3 }}>
            <CardContent sx={{ p: 4 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                <Avatar sx={{ bgcolor: 'primary.main', mr: 2 }}>
                  <Computer />
                </Avatar>
                <Box>
                  <Typography variant="h6" fontWeight="bold">
                    Pi-hole Server Configuration
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Configure connection to your Pi-hole server
                  </Typography>
                </Box>
              </Box>
              
              <Grid container spacing={3}>
                <Grid item xs={12}>
                  <FormControl fullWidth>
                    <InputLabel>Connection Method</InputLabel>
                    <Select
                      value={formData.pihole.connectionMethod}
                      onChange={(e) => handleInputChange('pihole', 'connectionMethod', e.target.value)}
                      label="Connection Method"
                    >
                      <MenuItem value="web">
                        <Box>
                          <Typography variant="body2" fontWeight="medium">Web/API Only</Typography>
                          <Typography variant="caption" color="text.secondary">
                            Perfect for Docker Pi-hole - No SSH required
                          </Typography>
                        </Box>
                      </MenuItem>
                      <MenuItem value="hybrid">
                        <Box>
                          <Typography variant="body2" fontWeight="medium">Hybrid (Web + SSH)</Typography>
                          <Typography variant="caption" color="text.secondary">
                            Best reliability - Requires SSH access
                          </Typography>
                        </Box>
                      </MenuItem>
                      <MenuItem value="ssh">
                        <Box>
                          <Typography variant="body2" fontWeight="medium">SSH Only</Typography>
                          <Typography variant="caption" color="text.secondary">
                            Traditional method - SSH only
                          </Typography>
                        </Box>
                      </MenuItem>
                    </Select>
                  </FormControl>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    {formData.pihole.connectionMethod === 'ssh' && 'Traditional SSH-only method. Requires SSH access to Pi-hole server.'}
                    {formData.pihole.connectionMethod === 'hybrid' && 'Uses Web API for status monitoring and SSH for backups. Most reliable option.'}
                    {formData.pihole.connectionMethod === 'web' && 'Perfect for Docker-based Pi-hole installations. No SSH access required.'}
                  </Typography>
                </Grid>
                
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label={formData.pihole.connectionMethod === 'web' ? 'Pi-hole URL or Hostname' : 'Pi-hole Host IP'}
                    value={formData.pihole.host}
                    onChange={(e) => handleInputChange('pihole', 'host', e.target.value)}
                    placeholder={formData.pihole.connectionMethod === 'web' ? 'https://192.168.1.100/admin/ or 192.168.1.100' : '192.168.1.100'}
                    helperText={
                      formData.pihole.connectionMethod === 'web' 
                        ? 'Full URL (https://host/admin/) or just hostname/IP - HTTPS and port will be auto-detected from URL' 
                        : 'IP address or hostname of your Pi-hole server'
                    }
                  />
                </Grid>
                
                {/* SSH Configuration */}
                {(formData.pihole.connectionMethod === 'ssh' || formData.pihole.connectionMethod === 'hybrid') && (
                  <>
                    <Grid item xs={12} md={6}>
                      <TextField
                        fullWidth
                        label="SSH Port"
                        type="number"
                        value={formData.pihole.port}
                        onChange={(e) => handleInputChange('pihole', 'port', parseInt(e.target.value))}
                        helperText="Default SSH port is 22"
                      />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <TextField
                        fullWidth
                        label="SSH Username"
                        value={formData.pihole.username}
                        onChange={(e) => handleInputChange('pihole', 'username', e.target.value)}
                        placeholder="pi"
                        helperText="SSH username for Pi-hole server"
                      />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <TextField
                        fullWidth
                        label="SSH Password"
                        type={showPassword ? 'text' : 'password'}
                        value={formData.pihole.password}
                        onChange={(e) => handleInputChange('pihole', 'password', e.target.value)}
                        helperText="SSH password for the user"
                        InputProps={{
                          endAdornment: (
                            <InputAdornment position="end">
                              <IconButton
                                onClick={() => setShowPassword(!showPassword)}
                                edge="end"
                              >
                                {showPassword ? <VisibilityOff /> : <Visibility />}
                              </IconButton>
                            </InputAdornment>
                          ),
                        }}
                      />
                    </Grid>
                  </>
                )}
                
                {/* Web API Configuration */}
                {(formData.pihole.connectionMethod === 'web' || formData.pihole.connectionMethod === 'hybrid') && (
                  <>
                    <Grid item xs={12} md={4}>
                      <TextField
                        fullWidth
                        label="Web Port"
                        type="number"
                        value={formData.pihole.webPort}
                        onChange={(e) => handleInputChange('pihole', 'webPort', parseInt(e.target.value))}
                        helperText="Pi-hole web interface port (usually 80 or 8080)"
                      />
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={formData.pihole.useHttps}
                            onChange={(e) => handleInputChange('pihole', 'useHttps', e.target.checked)}
                          />
                        }
                        label="Use HTTPS"
                      />
                      <Typography variant="body2" color="text.secondary">
                        Enable if Pi-hole uses SSL/TLS
                      </Typography>
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <TextField
                        fullWidth
                        label="Web Password"
                        type={showPassword ? 'text' : 'password'}
                        value={formData.pihole.webPassword}
                        onChange={(e) => handleInputChange('pihole', 'webPassword', e.target.value)}
                        helperText={
                          formData.pihole.connectionMethod === 'web' 
                            ? 'Pi-hole admin password (required for web-only backups)' 
                            : 'Pi-hole admin password (optional for monitoring)'
                        }
                        required={formData.pihole.connectionMethod === 'web'}
                        InputProps={{
                          endAdornment: (
                            <InputAdornment position="end">
                              <IconButton
                                onClick={() => setShowPassword(!showPassword)}
                                edge="end"
                              >
                                {showPassword ? <VisibilityOff /> : <Visibility />}
                              </IconButton>
                            </InputAdornment>
                          ),
                        }}
                      />
                    </Grid>
                  </>
                )}
                
                {/* Web-only connection URL format guidance */}
                {formData.pihole.connectionMethod === 'web' && (
                  <Grid item xs={12}>
                    <Alert severity="info" sx={{ mt: 2 }}>
                      <Typography variant="subtitle2" gutterBottom>
                        Pi-hole Connection Options
                      </Typography>
                      <Typography variant="body2" component="div">
                        <strong>Option 1 - Full URL (Recommended):</strong>
                        <br />• <code>https://192.168.1.100/admin/</code> (auto-detects HTTPS + port 443)
                        <br />• <code>http://pihole.local/admin/</code> (auto-detects HTTP + port 80)
                        <br />• <code>https://my-pihole.domain.com:8443/admin/</code> (custom port)
                      </Typography>
                      <Typography variant="body2" component="div" sx={{ mt: 1 }}>
                        <strong>Option 2 - Hostname only:</strong>
                        <br />• <code>192.168.1.100</code> (then manually set HTTPS toggle and port)
                      </Typography>
                      <Typography variant="body2" sx={{ mt: 1 }}>
                        <strong>Note:</strong> The system will automatically handle the <code>/admin/</code> path.
                      </Typography>
                    </Alert>
                  </Grid>
                )}
              </Grid>
            </CardContent>
          </Card>
        );
      case 1:
        return (
          <Card sx={{ mt: 3 }}>
            <CardContent sx={{ p: 4 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                <Avatar sx={{ bgcolor: 'secondary.main', mr: 2 }}>
                  <Storage />
                </Avatar>
                <Box>
                  <Typography variant="h6" fontWeight="bold">
                    Backup Settings
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Configure backup storage and retention
                  </Typography>
                </Box>
              </Box>
              
              <Grid container spacing={3}>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Backup Destination Path"
                    value={formData.backup.destinationPath}
                    onChange={(e) => handleInputChange('backup', 'destinationPath', e.target.value)}
                    helperText="Path where backups will be stored"
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Maximum Backups"
                    type="number"
                    value={formData.backup.maxBackups}
                    onChange={(e) => handleInputChange('backup', 'maxBackups', parseInt(e.target.value))}
                    helperText="Number of backups to retain"
                    inputProps={{ min: 1, max: 100 }}
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        );
      case 2:
        return (
          <Card sx={{ mt: 3 }}>
            <CardContent sx={{ p: 4 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                <Avatar sx={{ bgcolor: 'success.main', mr: 2 }}>
                  <Schedule />
                </Avatar>
                <Box>
                  <Typography variant="h6" fontWeight="bold">
                    Schedule Configuration
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Set up automated backup schedule
                  </Typography>
                </Box>
              </Box>
              
              <Grid container spacing={3}>
                <Grid item xs={12}>
                  <FormControl fullWidth>
                    <InputLabel>Schedule Enabled</InputLabel>
                    <Select
                      value={formData.schedule.enabled}
                      onChange={(e) => handleInputChange('schedule', 'enabled', e.target.value)}
                    >
                      <MenuItem value={true}>Enabled</MenuItem>
                      <MenuItem value={false}>Disabled</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} md={8}>
                  <TextField
                    fullWidth
                    label="Cron Expression"
                    value={formData.schedule.cronExpression}
                    onChange={(e) => handleInputChange('schedule', 'cronExpression', e.target.value)}
                    helperText="Example: 0 3 * * * (daily at 3 AM)"
                    disabled={!formData.schedule.enabled}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <FormControl fullWidth>
                    <InputLabel>Timezone</InputLabel>
                    <Select
                      value={formData.schedule.timezone}
                      onChange={(e) => handleInputChange('schedule', 'timezone', e.target.value)}
                      label="Timezone"
                    >
                      <MenuItem value="GMT-12">GMT-12</MenuItem>
                      <MenuItem value="GMT-11">GMT-11</MenuItem>
                      <MenuItem value="GMT-10">GMT-10</MenuItem>
                      <MenuItem value="GMT-9">GMT-9</MenuItem>
                      <MenuItem value="GMT-8">GMT-8</MenuItem>
                      <MenuItem value="GMT-7">GMT-7</MenuItem>
                      <MenuItem value="GMT-6">GMT-6</MenuItem>
                      <MenuItem value="GMT-5">GMT-5</MenuItem>
                      <MenuItem value="GMT-4">GMT-4</MenuItem>
                      <MenuItem value="GMT-3">GMT-3</MenuItem>
                      <MenuItem value="GMT-2">GMT-2</MenuItem>
                      <MenuItem value="GMT-1">GMT-1</MenuItem>
                      <MenuItem value="GMT+0">GMT+0 (UTC)</MenuItem>
                      <MenuItem value="GMT+1">GMT+1</MenuItem>
                      <MenuItem value="GMT+2">GMT+2</MenuItem>
                      <MenuItem value="GMT+3">GMT+3 (Default)</MenuItem>
                      <MenuItem value="GMT+4">GMT+4</MenuItem>
                      <MenuItem value="GMT+5">GMT+5</MenuItem>
                      <MenuItem value="GMT+6">GMT+6</MenuItem>
                      <MenuItem value="GMT+7">GMT+7</MenuItem>
                      <MenuItem value="GMT+8">GMT+8</MenuItem>
                      <MenuItem value="GMT+9">GMT+9</MenuItem>
                      <MenuItem value="GMT+10">GMT+10</MenuItem>
                      <MenuItem value="GMT+11">GMT+11</MenuItem>
                      <MenuItem value="GMT+12">GMT+12</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>
              
              <Box sx={{ mt: 3, p: 2, bgcolor: 'background.paper', borderRadius: 1 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Common Cron Expressions:
                </Typography>
                <Stack spacing={1}>
                  <Chip label="0 3 * * * - Daily at 3 AM" variant="outlined" size="small" />
                  <Chip label="0 2 * * 0 - Weekly on Sunday at 2 AM" variant="outlined" size="small" />
                  <Chip label="0 1 1 * * - Monthly on 1st at 1 AM" variant="outlined" size="small" />
                </Stack>
              </Box>
            </CardContent>
          </Card>
        );
      case 3:
        return (
          <Card sx={{ mt: 3 }}>
            <CardContent sx={{ p: 4 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                <Avatar sx={{ bgcolor: 'info.main', mr: 2 }}>
                  <Notifications />
                </Avatar>
                <Box>
                  <Typography variant="h6" fontWeight="bold">
                    Discord Notifications
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Configure Discord webhook for backup notifications (optional)
                  </Typography>
                </Box>
              </Box>
              
              <Alert severity="info" sx={{ mb: 3 }}>
                Discord notifications are optional. You can skip this step or configure it later in the settings.
              </Alert>
              
              <Grid container spacing={3}>
                <Grid item xs={12}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={formData.discord.enabled}
                        onChange={(e) => handleInputChange('discord', 'enabled', e.target.checked)}
                        color="primary"
                      />
                    }
                    label="Enable Discord Notifications"
                  />
                </Grid>
                
                {formData.discord.enabled && (
                  <>
                    <Grid item xs={12}>
                      <TextField
                        fullWidth
                        label="Discord Webhook URL"
                        value={formData.discord.webhookUrl}
                        onChange={(e) => handleInputChange('discord', 'webhookUrl', e.target.value)}
                        placeholder="https://discord.com/api/webhooks/..."
                        helperText="Get this from your Discord server settings > Integrations > Webhooks"
                        type="url"
                      />
                    </Grid>
                    
                    <Grid item xs={12} md={6}>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={formData.discord.notifyOnSuccess}
                            onChange={(e) => handleInputChange('discord', 'notifyOnSuccess', e.target.checked)}
                            color="primary"
                          />
                        }
                        label="Notify on Successful Backup"
                      />
                    </Grid>
                    
                    <Grid item xs={12} md={6}>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={formData.discord.notifyOnFailure}
                            onChange={(e) => handleInputChange('discord', 'notifyOnFailure', e.target.checked)}
                            color="primary"
                          />
                        }
                        label="Notify on Backup Failure"
                      />
                    </Grid>
                  </>
                )}
              </Grid>
              
              {formData.discord.enabled && (
                <Box sx={{ mt: 3, p: 2, bgcolor: 'background.paper', borderRadius: 1 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    How to get Discord Webhook URL:
                  </Typography>
                  <Stack spacing={1}>
                    <Typography variant="body2" color="text.secondary">
                      1. Go to your Discord server settings
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      2. Click on "Integrations" in the left sidebar
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      3. Click "Create Webhook" or "View Webhooks"
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      4. Copy the webhook URL and paste it above
                    </Typography>
                  </Stack>
                </Box>
              )}
            </CardContent>
          </Card>
        );
      case 4:
        if (formData.pihole.connectionMethod === 'web') {
          return (
            <Card sx={{ mt: 3 }}>
              <CardContent sx={{ p: 4 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                  <Avatar sx={{ bgcolor: 'success.main', mr: 2 }}>
                    <CheckCircle />
                  </Avatar>
                  <Box>
                    <Typography variant="h6" fontWeight="bold">
                      Configuration Complete
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Web-only connection method selected - no SSH key deployment needed
                    </Typography>
                  </Box>
                </Box>
                
                <Alert severity="info" sx={{ mb: 3 }}>
                  You've selected web-only connection method. This provides basic Pi-hole monitoring but backup 
                  functionality will be limited until Pi-hole adds backup APIs in future versions.
                </Alert>
                
                <Alert severity="warning" sx={{ mb: 3 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Note about backup functionality:
                  </Typography>
                  <Typography variant="body2">
                    Currently, Pi-hole backups require SSH access to run the teleporter command. 
                    Consider using the "Hybrid" method for full backup functionality.
                  </Typography>
                </Alert>
                
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                  <Typography variant="body2">Connection Status:</Typography>
                  <Chip
                    label="Web API Ready"
                    color="success"
                    size="small"
                  />
                </Box>
              </CardContent>
            </Card>
          );
        }
        
        return (
          <Card sx={{ mt: 3 }}>
            <CardContent sx={{ p: 4 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                <Avatar sx={{ bgcolor: 'warning.main', mr: 2 }}>
                  <Key />
                </Avatar>
                <Box>
                  <Typography variant="h6" fontWeight="bold">
                    SSH Key Setup
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Deploy SSH key for secure authentication
                  </Typography>
                </Box>
              </Box>
              
              <Alert severity="info" sx={{ mb: 3 }}>
                This step will generate and deploy an SSH key to your Pi-hole server for secure, 
                password-less authentication.
              </Alert>
              
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <Typography variant="body2">Connection Status:</Typography>
                <Chip
                  label={sshStatus.connected ? 'Connected' : 'Not Connected'}
                  color={sshStatus.connected ? 'success' : 'error'}
                  size="small"
                />
              </Box>
              
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Typography variant="body2">SSH Key Status:</Typography>
                <Chip
                  label={sshStatus.keyDeployed ? 'Deployed' : 'Not Deployed'}
                  color={sshStatus.keyDeployed ? 'success' : 'warning'}
                  size="small"
                />
              </Box>
              
              {!sshStatus.keyDeployed && (
                <Box sx={{ mt: 3 }}>
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={async () => {
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
                    }}
                    disabled={sshStatus.testing}
                    startIcon={sshStatus.testing ? <CircularProgress size={20} /> : <Key />}
                  >
                    {sshStatus.testing ? 'Deploying SSH Key...' : 'Deploy SSH Key'}
                  </Button>
                </Box>
              )}
              
              {sshStatus.testing && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 2 }}>
                  <CircularProgress size={20} />
                  <Typography variant="body2">Deploying SSH key...</Typography>
                </Box>
              )}
            </CardContent>
          </Card>
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

  return (
    <Box sx={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      py: 4
    }}>
      <Container maxWidth="md">
        {/* Header */}
        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <Box sx={{ mb: 2 }}>
            <img 
              src="/logo.png" 
              alt="PiHoleVault Logo" 
              style={{ 
                height: 80, 
                width: 'auto', 
                borderRadius: '12px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
              }} 
            />
          </Box>
          <Typography variant="h3" fontWeight="bold" color="white" gutterBottom>
            Welcome to PiHoleVault
          </Typography>
          <Typography variant="h6" color="text.secondary" sx={{ maxWidth: 600, mx: 'auto' }}>
            Let's set up your Pi-hole backup solution in just a few steps
          </Typography>
        </Box>

        {/* Setup Card */}
        <Card sx={{ mb: 4 }}>
          <CardContent sx={{ p: 4 }}>
            <Stepper activeStep={activeStep} alternativeLabel={!isMobile}>
              {steps.map((label, index) => (
                <Step key={label}>
                  <StepLabel>
                    <Typography variant="body2" fontWeight="medium">
                      {label}
                    </Typography>
                  </StepLabel>
                </Step>
              ))}
            </Stepper>
            
            {getStepContent(activeStep)}
            
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 4 }}>
              <Button
                disabled={activeStep === 0}
                onClick={handleBack}
                startIcon={<ArrowBack />}
                variant="outlined"
              >
                Back
              </Button>
              
              <Button
                variant="contained"
                onClick={handleNext}
                disabled={loading || !isStepValid(activeStep)}
                endIcon={
                  loading ? (
                    <CircularProgress size={20} color="inherit" />
                  ) : activeStep === steps.length - 1 ? (
                    <CheckCircle />
                  ) : (
                    <ArrowForward />
                  )
                }
              >
                {loading 
                  ? 'Processing...' 
                  : activeStep === steps.length - 1 
                    ? 'Finish Setup' 
                    : 'Next'
                }
              </Button>
            </Box>
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
};

export default SetupWizard;
