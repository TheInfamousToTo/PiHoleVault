import React, { useState } from 'react';
import {
  Container,
  Paper,
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
} from '@mui/material';
import {
  Visibility,
  VisibilityOff,
  Storage,
  Schedule,
  Security,
  Settings,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import api from '../services/api';

const steps = [
  'Pi-hole Server Configuration',
  'Backup Settings',
  'Schedule Configuration',
  'SSH Key Setup'
];

const SetupWizard = ({ onComplete }) => {
  const [activeStep, setActiveStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  // Form data
  const [formData, setFormData] = useState({
    pihole: {
      host: '',
      username: '',
      password: '',
      port: 22,
    },
    backup: {
      destinationPath: '/app/backups',
      maxBackups: 10,
    },
    schedule: {
      enabled: true,
      cronExpression: '0 3 * * *', // Daily at 3 AM
      timezone: 'UTC',
    }
  });

  const [sshStatus, setSshStatus] = useState({
    connected: false,
    keyDeployed: false,
    testing: false,
  });

  const handleNext = async () => {
    if (activeStep === steps.length - 1) {
      // On the last step (SSH Key Setup)
      await setupSSHKey();
    } else {
      if (activeStep === 0) {
        await testConnection();
      } else if (activeStep === 2) {
        await validateSchedule();
      } else {
        setActiveStep((prevActiveStep) => prevActiveStep + 1);
      }
    }
  };

  const handleBack = () => {
    setActiveStep((prevActiveStep) => prevActiveStep - 1);
  };

  const handleInputChange = (section, field, value) => {
    setFormData(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value
      }
    }));
  };

  const testConnection = async () => {
    setLoading(true);
    try {
      const response = await api.post('/pihole/test-connection', formData.pihole);
      if (response.data.success) {
        toast.success('Connection successful!');
        setActiveStep((prevActiveStep) => prevActiveStep + 1);
      } else {
        toast.error('Connection failed: ' + response.data.error);
      }
    } catch (error) {
      toast.error('Connection failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const validateSchedule = async () => {
    try {
      const response = await api.post('/schedule/validate', formData.schedule);
      if (response.data.valid) {
        toast.success('Schedule is valid!');
        setActiveStep((prevActiveStep) => prevActiveStep + 1);
      } else {
        toast.error('Invalid schedule: ' + response.data.error);
      }
    } catch (error) {
      toast.error('Schedule validation failed: ' + error.message);
    }
  };

  const setupSSHKey = async () => {
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
        // Since this is the last step, call handleFinish directly instead of going to the next step
        handleFinish();
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

  const debugSSH = async () => {
    try {
      const response = await api.post('/ssh/debug', formData.pihole);
      console.log('SSH Debug Results:', response.data);
      
      if (response.data.success) {
        const debug = response.data.debug;
        let message = 'SSH Debug Results:\n';
        
        Object.entries(debug.tests).forEach(([test, result]) => {
          message += `${test}: ${result.success ? 'PASS' : 'FAIL'}`;
          if (!result.success) {
            message += ` (${result.error})`;
          }
          message += '\n';
        });
        
        alert(message);
      } else {
        alert('Debug failed: ' + JSON.stringify(response.data.debug, null, 2));
      }
    } catch (error) {
      console.error('SSH debug error:', error);
      alert('Debug request failed: ' + error.message);
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

  const renderStepContent = (step) => {
    switch (step) {
      case 0:
        return (
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>
                Pi-hole Server Connection Details
              </Typography>
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Pi-hole Server IP/Hostname"
                value={formData.pihole.host}
                onChange={(e) => handleInputChange('pihole', 'host', e.target.value)}
                required
                helperText="Enter the IP address or hostname of your Pi-hole server"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="SSH Port"
                type="number"
                value={formData.pihole.port}
                onChange={(e) => handleInputChange('pihole', 'port', parseInt(e.target.value))}
                required
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Username"
                value={formData.pihole.username}
                onChange={(e) => handleInputChange('pihole', 'username', e.target.value)}
                required
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Password"
                type={showPassword ? 'text' : 'password'}
                value={formData.pihole.password}
                onChange={(e) => handleInputChange('pihole', 'password', e.target.value)}
                required
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
          </Grid>
        );

      case 1:
        return (
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>
                Backup Configuration
              </Typography>
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Backup Destination Path"
                value={formData.backup.destinationPath}
                onChange={(e) => handleInputChange('backup', 'destinationPath', e.target.value)}
                required
                helperText="Local path where backups will be stored"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Maximum Backups to Keep"
                type="number"
                value={formData.backup.maxBackups}
                onChange={(e) => handleInputChange('backup', 'maxBackups', parseInt(e.target.value))}
                required
                inputProps={{ min: 1, max: 100 }}
                helperText="Number of backup files to retain"
              />
            </Grid>
          </Grid>
        );

      case 2:
        return (
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>
                Backup Schedule
              </Typography>
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Cron Expression"
                value={formData.schedule.cronExpression}
                onChange={(e) => handleInputChange('schedule', 'cronExpression', e.target.value)}
                required
                helperText="Use cron syntax (e.g., '0 3 * * *' for daily at 3 AM)"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Timezone</InputLabel>
                <Select
                  value={formData.schedule.timezone}
                  onChange={(e) => handleInputChange('schedule', 'timezone', e.target.value)}
                  label="Timezone"
                >
                  <MenuItem value="UTC">UTC</MenuItem>
                  <MenuItem value="America/New_York">Eastern Time</MenuItem>
                  <MenuItem value="America/Chicago">Central Time</MenuItem>
                  <MenuItem value="America/Denver">Mountain Time</MenuItem>
                  <MenuItem value="America/Los_Angeles">Pacific Time</MenuItem>
                  <MenuItem value="Europe/London">London</MenuItem>
                  <MenuItem value="Europe/Paris">Paris</MenuItem>
                  <MenuItem value="Asia/Tokyo">Tokyo</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        );

      case 3:
        return (
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>
                SSH Key Setup
              </Typography>
              <Typography variant="body2" color="textSecondary" gutterBottom>
                This step will generate and deploy an SSH key to your Pi-hole server for passwordless authentication.
              </Typography>
            </Grid>
            <Grid item xs={12}>
              <Card>
                <CardContent>
                  <Box display="flex" alignItems="center" mb={2}>
                    <Security color={sshStatus.connected ? 'success' : 'disabled'} />
                    <Typography variant="body1" ml={1}>
                      SSH Connection: {sshStatus.connected ? 'Connected' : 'Not Connected'}
                    </Typography>
                  </Box>
                  <Box display="flex" alignItems="center">
                    <Settings color={sshStatus.keyDeployed ? 'success' : 'disabled'} />
                    <Typography variant="body1" ml={1}>
                      SSH Key: {sshStatus.keyDeployed ? 'Deployed' : 'Not Deployed'}
                    </Typography>
                  </Box>
                  {sshStatus.testing && (
                    <Box display="flex" alignItems="center" mt={2}>
                      <CircularProgress size={20} />
                      <Typography variant="body2" ml={1}>
                        Setting up SSH key...
                      </Typography>
                    </Box>
                  )}
                  {!sshStatus.testing && !sshStatus.connected && (
                    <Box mt={2}>
                      <Button
                        variant="outlined"
                        color="primary"
                        onClick={debugSSH}
                        size="small"
                        sx={{ mr: 1 }}
                      >
                        Debug Connection
                      </Button>
                      <Button
                        variant="contained"
                        color="primary"
                        onClick={setupSSHKey}
                        size="small"
                      >
                        Deploy SSH Key
                      </Button>
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        );

      default:
        return 'Unknown step';
    }
  };

  const isStepOptional = (step) => {
    return false;
  };

  const isStepComplete = (step) => {
    switch (step) {
      case 0:
        return formData.pihole.host && formData.pihole.username && formData.pihole.password;
      case 1:
        return formData.backup.destinationPath && formData.backup.maxBackups > 0;
      case 2:
        return formData.schedule.cronExpression;
      case 3:
        return sshStatus.keyDeployed;
      default:
        return false;
    }
  };

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
      <Paper elevation={3} sx={{ p: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom align="center">
          HoleSafe Setup
        </Typography>
        
        <Stepper activeStep={activeStep} sx={{ pt: 3, pb: 5 }}>
          {steps.map((label, index) => {
            const stepProps = {};
            const labelProps = {};
            if (isStepOptional(index)) {
              labelProps.optional = (
                <Typography variant="caption">Optional</Typography>
              );
            }
            return (
              <Step key={label} {...stepProps}>
                <StepLabel {...labelProps}>{label}</StepLabel>
              </Step>
            );
          })}
        </Stepper>

        <Box sx={{ mt: 2, mb: 1 }}>
          {renderStepContent(activeStep)}
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'row', pt: 2 }}>
          <Button
            color="inherit"
            disabled={activeStep === 0}
            onClick={handleBack}
            sx={{ mr: 1 }}
          >
            Back
          </Button>
          <Box sx={{ flex: '1 1 auto' }} />
          <Button
            onClick={handleNext}
            disabled={loading || !isStepComplete(activeStep)}
          >
            {loading ? (
              <CircularProgress size={24} />
            ) : activeStep === steps.length - 1 ? (
              'Finish'
            ) : (
              'Next'
            )}
          </Button>
        </Box>
      </Paper>
    </Container>
  );
};

export default SetupWizard;
