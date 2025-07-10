import React, { useState, useEffect } from 'react';
import {
  Container,
  Grid,
  Paper,
  Typography,
  Button,
  Card,
  CardContent,
  CardActions,
  Box,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Alert,
  Divider,
  AppBar,
  Toolbar,
} from '@mui/material';
import {
  PlayArrow,
  Schedule,
  Storage,
  Settings,
  Download,
  Delete,
  Edit,
  Refresh,
  CheckCircle,
  Error,
  Warning,
  Info,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import api from '../services/api';

const Dashboard = () => {
  const [config, setConfig] = useState(null);
  const [backups, setBackups] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [runningBackup, setRunningBackup] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editConfig, setEditConfig] = useState({});

  useEffect(() => {
    loadDashboardData();
    const interval = setInterval(loadDashboardData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const loadDashboardData = async () => {
    try {
      // Use individual try-catch blocks for each API call
      try {
        const configRes = await api.get('/config');
        setConfig(configRes.data);
      } catch (configError) {
        console.error('Failed to load configuration:', configError);
        // Use default config if loading fails
        setConfig({
          pihole: { host: '192.168.31.230', username: 'root', port: 22 },
          backup: { destinationPath: '/app/backups', maxBackups: 10 },
          schedule: { enabled: true, cronExpression: '0 3 * * *', timezone: 'UTC' }
        });
      }
      
      try {
        const backupsRes = await api.get('/backups');
        setBackups(backupsRes.data || []);
      } catch (backupError) {
        console.error('Failed to load backups:', backupError);
        setBackups([]);
      }
      
      try {
        const jobsRes = await api.get('/jobs');
        setJobs(jobsRes.data || []);
      } catch (jobsError) {
        console.error('Failed to load jobs:', jobsError);
        setJobs([]);
      }
      
    } catch (error) {
      console.error('General error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const runBackupNow = async () => {
    setRunningBackup(true);
    try {
      const response = await api.post('/backup/run');
      if (response.data.success) {
        toast.success('Backup started successfully!');
        loadDashboardData();
      } else {
        toast.error('Failed to start backup: ' + response.data.error);
      }
    } catch (error) {
      toast.error('Failed to start backup: ' + error.message);
    } finally {
      setRunningBackup(false);
    }
  };

  const deleteBackup = async (filename) => {
    if (window.confirm('Are you sure you want to delete this backup?')) {
      try {
        await api.delete(`/backups/${filename}`);
        toast.success('Backup deleted successfully');
        loadDashboardData();
      } catch (error) {
        toast.error('Failed to delete backup');
      }
    }
  };

  const downloadBackup = async (filename) => {
    try {
      const response = await api.get(`/backups/${filename}/download`, {
        responseType: 'blob',
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast.error('Failed to download backup');
    }
  };

  const handleEditConfig = () => {
    setEditConfig(config);
    setEditDialogOpen(true);
  };

  const saveConfig = async () => {
    try {
      await api.put('/config', editConfig);
      toast.success('Configuration updated successfully');
      setConfig(editConfig);
      setEditDialogOpen(false);
      loadDashboardData();
    } catch (error) {
      toast.error('Failed to update configuration');
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getJobStatusIcon = (status) => {
    switch (status) {
      case 'success':
        return <CheckCircle color="success" />;
      case 'error':
        return <Error color="error" />;
      case 'running':
        return <CircularProgress size={24} />;
      case 'warning':
        return <Warning color="warning" />;
      default:
        return <Info color="info" />;
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <>
      <AppBar position="static">
        <Toolbar>
          <Box sx={{ display: 'flex', alignItems: 'center', flexGrow: 1 }}>
            <img 
              src="/logo.png" 
              alt="HoleSafe Logo" 
              style={{ height: '32px', marginRight: '12px' }}
              onError={(e) => {
                e.target.style.display = 'none';
              }}
            />
            <Typography variant="h6" component="div">
              HoleSafe
            </Typography>
          </Box>
          <IconButton color="inherit" onClick={loadDashboardData}>
            <Refresh />
          </IconButton>
          <IconButton color="inherit" onClick={handleEditConfig}>
            <Settings />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Grid container spacing={3}>
          {/* Quick Actions */}
          <Grid item xs={12}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>
                Quick Actions
              </Typography>
              <Box display="flex" gap={2}>
                <Button
                  variant="contained"
                  startIcon={<PlayArrow />}
                  onClick={runBackupNow}
                  disabled={runningBackup}
                >
                  {runningBackup ? 'Running...' : 'Run Backup Now'}
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<Settings />}
                  onClick={handleEditConfig}
                >
                  Configure
                </Button>
              </Box>
            </Paper>
          </Grid>

          {/* System Status */}
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  System Status
                </Typography>
                <List dense>
                  <ListItem>
                    <ListItemIcon>
                      <CheckCircle color="success" />
                    </ListItemIcon>
                    <ListItemText
                      primary="Pi-hole Server"
                      secondary={`${config?.pihole?.host}:${config?.pihole?.port}`}
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon>
                      <Storage />
                    </ListItemIcon>
                    <ListItemText
                      primary="Backup Directory"
                      secondary={config?.backup?.destinationPath}
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon>
                      <Schedule />
                    </ListItemIcon>
                    <ListItemText
                      primary="Schedule"
                      secondary={config?.schedule?.cronExpression}
                    />
                  </ListItem>
                </List>
              </CardContent>
            </Card>
          </Grid>

          {/* Recent Jobs */}
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Recent Jobs
                </Typography>
                <List dense>
                  {jobs.slice(0, 5).map((job, index) => (
                    <ListItem key={index}>
                      <ListItemIcon>
                        {getJobStatusIcon(job.status)}
                      </ListItemIcon>
                      <ListItemText
                        primary={new Date(job.timestamp).toLocaleString()}
                        secondary={job.message}
                      />
                    </ListItem>
                  ))}
                  {jobs.length === 0 && (
                    <ListItem>
                      <ListItemText primary="No recent jobs" />
                    </ListItem>
                  )}
                </List>
              </CardContent>
            </Card>
          </Grid>

          {/* Backup Files */}
          <Grid item xs={12}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>
                Backup Files ({backups.length})
              </Typography>
              <Grid container spacing={2}>
                {backups.map((backup) => (
                  <Grid item xs={12} md={6} lg={4} key={backup.filename}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="subtitle1" noWrap>
                          {backup.filename}
                        </Typography>
                        <Typography variant="body2" color="textSecondary">
                          {new Date(backup.timestamp).toLocaleString()}
                        </Typography>
                        <Typography variant="body2" color="textSecondary">
                          Size: {formatFileSize(backup.size)}
                        </Typography>
                      </CardContent>
                      <CardActions>
                        <IconButton
                          size="small"
                          onClick={() => downloadBackup(backup.filename)}
                        >
                          <Download />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => deleteBackup(backup.filename)}
                        >
                          <Delete />
                        </IconButton>
                      </CardActions>
                    </Card>
                  </Grid>
                ))}
                {backups.length === 0 && (
                  <Grid item xs={12}>
                    <Alert severity="info">
                      No backup files found. Run your first backup to get started.
                    </Alert>
                  </Grid>
                )}
              </Grid>
            </Paper>
          </Grid>
        </Grid>
      </Container>

      {/* Edit Configuration Dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Edit Configuration</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Pi-hole Host"
                value={editConfig?.pihole?.host || ''}
                onChange={(e) => setEditConfig({
                  ...editConfig,
                  pihole: { ...editConfig.pihole, host: e.target.value }
                })}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="SSH Port"
                type="number"
                value={editConfig?.pihole?.port || 22}
                onChange={(e) => setEditConfig({
                  ...editConfig,
                  pihole: { ...editConfig.pihole, port: parseInt(e.target.value) }
                })}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Backup Destination"
                value={editConfig?.backup?.destinationPath || ''}
                onChange={(e) => setEditConfig({
                  ...editConfig,
                  backup: { ...editConfig.backup, destinationPath: e.target.value }
                })}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Max Backups"
                type="number"
                value={editConfig?.backup?.maxBackups || 10}
                onChange={(e) => setEditConfig({
                  ...editConfig,
                  backup: { ...editConfig.backup, maxBackups: parseInt(e.target.value) }
                })}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Cron Expression"
                value={editConfig?.schedule?.cronExpression || ''}
                onChange={(e) => setEditConfig({
                  ...editConfig,
                  schedule: { ...editConfig.schedule, cronExpression: e.target.value }
                })}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button onClick={saveConfig} variant="contained">Save</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default Dashboard;
