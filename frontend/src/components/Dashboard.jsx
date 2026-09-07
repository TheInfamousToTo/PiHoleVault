import React, { useState, useEffect, useCallback, memo } from 'react';
import {
  Container,
  Grid,
  Typography,
  Button,
  Card,
  CardContent,
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
  CircularProgress,
  AppBar,
  Toolbar,
  Avatar,
  Stack,
  useTheme,
  useMediaQuery,
  Tooltip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Menu,
  Fade,
  Grow,
  Slide,
  Zoom,
  FormControlLabel,
  Switch,
} from '@mui/material';
import {
  PlayArrow,
  Schedule,
  Storage,
  Settings,
  Download,
  Delete,
  Refresh,
  CheckCircle,
  Error,
  Info,
  Shield,
  Cloud,
  Timeline,
  Speed,
  Security,
  GitHub,
  Coffee,
  Favorite,
  Star,
  LaunchOutlined,
  Close,
  MoreVert,
  Notifications,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import api from '../services/api';
import GlobalAnalytics from './GlobalAnalytics';
import { ink, monoText, labelText } from '../theme';

// One reading from the status panel.
//
// These were four separately tinted, animated cards: a different hue each, a
// gradient fill, a gradient-clipped number and a lift-and-scale on hover. Four
// colours carried no meaning, and the gradient text cost legibility on the one
// thing worth reading. A reading is now a label, a value and a note, and the
// panel below sets them in a row divided by hairlines.
const StatCell = memo(({ label, value, note, mono: isMono, tone }) => (
  <Box sx={{ px: 2.5, py: 2.25, minWidth: 0 }}>
    <Typography sx={{ ...labelText, mb: 0.75 }}>{label}</Typography>
    <Typography
      sx={{
        fontSize: isMono ? '1.125rem' : '1.5rem',
        fontWeight: 600,
        lineHeight: 1.2,
        letterSpacing: '-0.02em',
        color: tone || 'text.primary',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        ...(isMono ? monoText : { fontVariantNumeric: 'tabular-nums' })
      }}
      title={String(value)}
    >
      {value}
    </Typography>
    {note && (
      <Typography
        sx={{
          mt: 0.5,
          fontSize: '0.8125rem',
          color: ink.faint,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          ...(isMono ? monoText : null)
        }}
        title={String(note)}
      >
        {note}
      </Typography>
    )}
  </Box>
));

// The four readings sit in one bordered panel split by hairlines rather than in
// four separate cards, so they read as one instrument rather than four unrelated
// tiles. The dividers collapse to horizontal rules when the row wraps.
const StatusPanel = memo(({ children }) => (
  <Box
    sx={{
      mb: 4,
      display: 'grid',
      gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, 1fr)' },
      backgroundColor: ink.surface,
      border: `1px solid ${ink.line}`,
      borderRadius: '12px',
      overflow: 'hidden',
      '& > *': {
        borderTop: `1px solid ${ink.line}`,
        borderLeft: `1px solid ${ink.line}`
      },
      '& > *:nth-of-type(-n+1)': { borderTop: 'none' },
      '& > *:nth-of-type(odd)': { borderLeft: { sm: 'none', lg: `1px solid ${ink.line}` } },
      '& > *:first-of-type': { borderLeft: 'none' },
      '& > *:nth-of-type(-n+2)': { borderTop: { sm: 'none', lg: undefined } },
      '& > *:nth-of-type(-n+4)': { borderTop: { lg: 'none' } },
      '& > *:nth-of-type(4n+1)': { borderLeft: { lg: 'none' } }
    }}
  >
    {children}
  </Box>
));

// The dashboard previously opened with a full-width purple gradient banner
// carrying a marketing sentence and three decorative chips (Secure, Automated,
// Fast). It occupied roughly a third of the first screen and told a returning
// user nothing they did not already know. The status panel now opens the page,
// so the answer to "am I backed up" is the first thing on screen.

// A quiet icon button.
//
// Each of these used to carry its own bright colour, a translucent fill, a
// coloured border and a lift-and-glow on hover, which turned a row of secondary
// links into six competing focal points. They now share the muted treatment
// every icon button gets, and only reveal themselves on hover. The `color` prop
// is still accepted so callers need no changes, but it is applied on hover
// only, where it identifies the destination without shouting.
const EnhancedIconButton = memo(({ children, onClick, color, tooltip, disabled = false, sx = {} }) => (
  <Tooltip title={tooltip} placement="bottom">
    <span>
      <IconButton
        onClick={onClick}
        disabled={disabled}
        aria-label={typeof tooltip === 'string' ? tooltip : undefined}
        sx={{
          width: 36,
          height: 36,
          color: 'text.secondary',
          '&:hover': {
            color: color || 'text.primary',
            backgroundColor: ink.raised
          },
          '&.Mui-disabled': { opacity: 0.4 },
          ...sx
        }}
      >
        {children}
      </IconButton>
    </span>
  </Tooltip>
));

// Action Button Component (Enhanced)
const ActionButton = memo(({ icon, label, onClick, color = 'primary', disabled = false, variant = 'contained' }) => (
  <Button
    variant={variant}
    color={color}
    startIcon={icon}
    onClick={onClick}
    disabled={disabled}
    sx={{
      minWidth: 132,
      py: 1,
      px: 2.25,
      fontWeight: 600
    }}
  >
    {label}
  </Button>
));

const Dashboard = ({ onReconfigure }) => {
  const [config, setConfig] = useState(null);
  const [backups, setBackups] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [runningBackup, setRunningBackup] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editConfig, setEditConfig] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [settingsAnchorEl, setSettingsAnchorEl] = useState(null);
  const [discordDialogOpen, setDiscordDialogOpen] = useState(false);
  const [discordConfig, setDiscordConfig] = useState({
    enabled: false,
    webhookUrl: '',
    notifyOnSuccess: true,
    notifyOnFailure: true
  });
  const [discordTesting, setDiscordTesting] = useState(false);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const settingsOpen = Boolean(settingsAnchorEl);

  const handleSettingsClick = (event) => {
    setSettingsAnchorEl(event.currentTarget);
  };

  const handleSettingsClose = () => {
    setSettingsAnchorEl(null);
  };

  const handleEditConfig = () => {
    setEditConfig({ ...config });
    setEditDialogOpen(true);
    handleSettingsClose();
  };

  const handleReconfigure = () => {
    if (onReconfigure) {
      onReconfigure();
      handleSettingsClose();
    }
  };

  const loadDashboardData = useCallback(async () => {
    try {
      setRefreshing(true);
      
      const [configRes, backupsRes, jobsRes] = await Promise.allSettled([
        api.get('/config'),
        api.get('/backups'),
        api.get('/jobs')
      ]);

      if (configRes.status === 'fulfilled') {
        setConfig(configRes.value.data);
      } else {
        console.error('Failed to load configuration:', configRes.reason);
        setConfig({
          pihole: { host: '192.168.1.100', username: 'root', port: 22 },
          backup: { destinationPath: '/app/backups', maxBackups: 10 },
          schedule: { enabled: true, cronExpression: '0 3 * * *', timezone: 'GMT+3' }
        });
      }

      if (backupsRes.status === 'fulfilled') {
        setBackups(backupsRes.value.data || []);
      } else {
        console.error('Failed to load backups:', backupsRes.reason);
        setBackups([]);
      }

      if (jobsRes.status === 'fulfilled') {
        setJobs(jobsRes.value.data || []);
      } else {
        console.error('Failed to load jobs:', jobsRes.reason);
        setJobs([]);
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const handleRunBackup = async () => {
    if (runningBackup) return;
    
    setRunningBackup(true);
    
    try {
      const response = await api.post('/backup/run');
      
      toast.success('Backup started successfully!');
      setTimeout(() => {
        loadDashboardData();
      }, 2000);
    } catch (error) {
      toast.error('Failed to start backup: ' + (error.response?.data?.message || error.message));
    } finally {
      setRunningBackup(false);
    }
  };

  const handleDeleteBackup = async (backupId) => {
    try {
      await api.delete(`/backups/${backupId}`);
      toast.success('Backup deleted successfully');
      loadDashboardData();
    } catch (error) {
      toast.error('Failed to delete backup: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleDownloadBackup = async (backupId) => {
    try {
      const response = await api.get(`/backups/${backupId}/download`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `backup-${backupId}.tar.gz`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      toast.error('Failed to download backup: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleDiscordOpen = async () => {
    try {
      const response = await api.get('/discord/config');
      if (response.data.success) {
        setDiscordConfig({
          enabled: response.data.config.enabled,
          webhookUrl: '', // Don't expose the webhook URL
          notifyOnSuccess: response.data.config.notifyOnSuccess,
          notifyOnFailure: response.data.config.notifyOnFailure
        });
      }
    } catch (error) {
      console.error('Failed to load Discord config:', error);
    }
    setDiscordDialogOpen(true);
    handleSettingsClose();
  };

  const handleDiscordClose = () => {
    setDiscordDialogOpen(false);
    setDiscordConfig({
      enabled: false,
      webhookUrl: '',
      notifyOnSuccess: true,
      notifyOnFailure: true
    });
  };

  const handleDiscordSave = async () => {
    try {
      const response = await api.post('/discord/config', discordConfig);
      if (response.data.success) {
        toast.success('Discord configuration updated successfully!');
        handleDiscordClose();
      } else {
        toast.error('Failed to update Discord configuration: ' + response.data.error);
      }
    } catch (error) {
      toast.error('Failed to update Discord configuration: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleDiscordTest = async () => {
    if (!discordConfig.webhookUrl) {
      toast.error('Please enter a webhook URL first');
      return;
    }

    setDiscordTesting(true);
    try {
      const response = await api.post('/discord/test', {
        webhookUrl: discordConfig.webhookUrl
      });
      
      if (response.data.success) {
        toast.success('Discord test notification sent successfully!');
      } else {
        toast.error('Discord test failed: ' + response.data.error);
      }
    } catch (error) {
      toast.error('Discord test failed: ' + (error.response?.data?.error || error.message));
    } finally {
      setDiscordTesting(false);
    }
  };



  const handleSaveConfig = async () => {
    try {
      await api.put('/config', editConfig);
      setConfig(editConfig);
      setEditDialogOpen(false);
      toast.success('Configuration updated successfully');
    } catch (error) {
      toast.error('Failed to update configuration: ' + (error.response?.data?.message || error.message));
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return theme.palette.success.main;
      case 'running':
        return theme.palette.warning.main;
      case 'failed':
        return theme.palette.error.main;
      // A stored file with no recorded status is a completed backup, and the
      // label already says so; the colour should agree with it.
      default:
        return theme.palette.success.main;
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'running':
        return <CircularProgress size={16} thickness={5} />;
      case 'failed':
        return <Error sx={{ fontSize: 18, color: ink.bad }} />;
      case 'completed':
      default:
        return <CheckCircle sx={{ fontSize: 18, color: ink.ok }} />;
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress size={60} />
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', backgroundColor: ink.ground }}>
      {/* Modern App Bar with Icon-Only Buttons */}
      {/* The bar shares the page's ground and is separated by a hairline, so the
          header reads as the top of one surface rather than a floating panel. */}
      <AppBar position="sticky" elevation={0}>
        <Toolbar>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <img
              src="/logo.png"
              alt=""
              style={{ height: 28, width: 'auto', borderRadius: '6px' }}
            />
            <Typography variant="h5" sx={{ letterSpacing: '-0.01em' }}>
              PiHoleVault
            </Typography>
          </Box>
          
          <Box sx={{ flexGrow: 1 }} />
          
          <Stack direction="row" spacing={1} alignItems="center">
            {/* GitHub */}
            <EnhancedIconButton
              onClick={() => window.open('https://github.com/TheInfamousToTo', '_blank')}
              tooltip="GitHub"
              color="#6e5494"
            >
              <GitHub />
            </EnhancedIconButton>

            {/* Star */}
            <EnhancedIconButton
              onClick={() => window.open('https://github.com/TheInfamousToTo/PiHoleVault', '_blank')}
              tooltip="Star on GitHub"
              color="#f59e0b"
            >
              <Star />
            </EnhancedIconButton>

            {/* Buy Coffee */}
            <EnhancedIconButton
              onClick={() => window.open('https://buymeacoffee.com/theinfamoustoto', '_blank')}
              tooltip="Buy Me a Coffee"
              color="#ff813f"
            >
              <Coffee />
            </EnhancedIconButton>

            {/* Ko-fi */}
            <EnhancedIconButton
              onClick={() => window.open('https://ko-fi.com/theinfamoustoto', '_blank')}
              tooltip="Support on Ko-fi"
              color="#ff5722"
            >
              <Favorite />
            </EnhancedIconButton>

            {/* Sponsor with Heart icon */}
            <EnhancedIconButton
              onClick={() => window.open('https://github.com/sponsors/TheInfamousToTo', '_blank')}
              tooltip="Sponsor"
              color="#8b5cf6"
            >
              <Favorite />
            </EnhancedIconButton>

            {/* Refresh */}
            <EnhancedIconButton
              onClick={() => loadDashboardData()}
              disabled={refreshing}
              tooltip="Refresh"
              color="rgba(255, 255, 255, 0.8)"
            >
              <Refresh />
            </EnhancedIconButton>

            {/* Run Backup */}
            <ActionButton
              icon={<PlayArrow />}
              label="Run backup"
              onClick={handleRunBackup}
              disabled={runningBackup}
            />

            {/* Settings Menu */}
            <EnhancedIconButton
              onClick={handleSettingsClick}
              tooltip="Settings"
              color="rgba(255, 255, 255, 0.8)"
            >
              <Settings />
            </EnhancedIconButton>

            <Menu
              anchorEl={settingsAnchorEl}
              open={settingsOpen}
              onClose={handleSettingsClose}
              PaperProps={{
                sx: {
                  background: 'rgba(30, 41, 59, 0.95)',
                  backdropFilter: 'blur(12px)',
                  border: '1px solid rgba(148, 163, 184, 0.2)',
                  borderRadius: 2,
                  minWidth: 200,
                  '& .MuiMenuItem-root': {
                    color: 'white',
                    '&:hover': {
                      backgroundColor: 'rgba(148, 163, 184, 0.1)',
                    }
                  }
                }
              }}
            >
              <MenuItem onClick={handleEditConfig}>
                <ListItemIcon sx={{ color: 'inherit', minWidth: 36 }}>
                  <Settings fontSize="small" />
                </ListItemIcon>
                Configure Settings
              </MenuItem>
              <MenuItem onClick={handleDiscordOpen}>
                <ListItemIcon sx={{ color: 'info.main', minWidth: 36 }}>
                  <Notifications fontSize="small" />
                </ListItemIcon>
                Discord Notifications
              </MenuItem>
              {onReconfigure && (
                <MenuItem onClick={handleReconfigure}>
                  <ListItemIcon sx={{ color: 'warning.main', minWidth: 36 }}>
                    <Shield fontSize="small" />
                  </ListItemIcon>
                  Reconfigure System
                </MenuItem>
              )}
            </Menu>
          </Stack>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ py: 4 }}>

        {/* Status panel: the four readings that answer "is my Pi-hole backed
            up", in one instrument rather than four tiles. */}
        <StatusPanel>
          <StatCell
            label="Backups"
            value={backups.length}
            note={backups.length === 1 ? '1 stored' : `${backups.length} stored`}
          />
          <StatCell
            label="Scheduled jobs"
            value={jobs.length}
            note={`${jobs.filter((j) => j.status === 'running').length} running`}
          />
          <StatCell
            label="Pi-hole"
            value={config?.pihole?.host || 'Not configured'}
            note={config?.pihole?.host ? `port ${config?.pihole?.port || 22}` : null}
            mono={Boolean(config?.pihole?.host)}
          />
          <StatCell
            label="Schedule"
            value={config?.schedule?.enabled ? 'Enabled' : 'Disabled'}
            tone={config?.schedule?.enabled ? ink.ok : ink.muted}
            note={config?.schedule?.cronExpression || 'No schedule set'}
            mono={Boolean(config?.schedule?.cronExpression)}
          />
        </StatusPanel>

        {/* Main Content Grid */}
        <Grid container spacing={4} sx={{ mb: 4 }}>
          {/* Recent Backups */}
          <Grid item xs={12} lg={8}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
                  <Typography variant="h4">Recent backups</Typography>
                  <Typography sx={{ ...labelText, fontVariantNumeric: 'tabular-nums' }}>
                    {backups.length} stored
                  </Typography>
                </Stack>
                
                {backups.length === 0 ? (
                  <Box sx={{ textAlign: 'center', py: 6 }}>
                    <Cloud sx={{ fontSize: 28, color: ink.faint, mb: 1.5 }} />
                    <Typography variant="h5" sx={{ mb: 0.5 }}>No backups yet</Typography>
                    <Typography variant="body2">
                      Run a backup to store your first restore point.
                    </Typography>
                  </Box>
                ) : (
                  <List>
                    {backups.slice(0, 10).map((backup, index) => (
                      <Grow
                        key={backup.id || index}
                        in={true}
                        timeout={300 + index * 100}
                      >
                        <ListItem
                          sx={{
                            borderRadius: 2,
                            mb: 1,
                            px: 1.5,
                            border: `1px solid ${ink.line}`,
                            '&:hover': { backgroundColor: ink.raised }
                          }}
                        >
                        <ListItemIcon sx={{ minWidth: 32 }}>
                          {getStatusIcon(backup.status)}
                        </ListItemIcon>
                        <ListItemText
                          primary={
                            <Stack direction="row" alignItems="center" spacing={2}>
                              <Typography sx={{ ...monoText, fontSize: '0.875rem', fontWeight: 500 }}>
                                {backup.filename || `Backup #${backup.id || index + 1}`}
                              </Typography>
                              <Chip
                                label={backup.status || 'completed'}
                                size="small"
                                variant="outlined"
                                sx={{ color: getStatusColor(backup.status), borderColor: ink.line }}
                              />
                            </Stack>
                          }
                          secondary={
                            <Stack direction="row" alignItems="center" spacing={2} sx={{ mt: 1 }}>
                              <Typography variant="body2" color="text.secondary">
                                {formatDate(backup.createdAt || backup.timestamp)}
                              </Typography>
                              {backup.size && (
                                <Typography variant="body2" sx={{ ...monoText, color: ink.faint }}>
                                  {formatBytes(backup.size)}
                                </Typography>
                              )}
                            </Stack>
                          }
                        />
                        <Stack direction="row" spacing={1}>
                          <Tooltip title="Download">
                            <IconButton
                              onClick={() => handleDownloadBackup(backup.id || backup.filename)}
                              disabled={backup.status !== 'completed' && backup.status !== undefined}
                              size="small"
                            >
                              <Download />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete">
                            <IconButton
                              onClick={() => handleDeleteBackup(backup.id || backup.filename)}
                              color="error"
                              size="small"
                            >
                              <Delete />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </ListItem>
                      </Grow>
                    ))}
                  </List>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* System Status & Jobs */}
          <Grid item xs={12} lg={4}>
            <Stack spacing={3}>
              {/* System Status */}
              <Card>
                <CardContent>
                  <Typography variant="h4" sx={{ mb: 2 }}>System status</Typography>
                  <Stack spacing={2}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Typography variant="body2">Connection</Typography>
                      <Chip
                        label="Connected"
                        size="small"
                        variant="outlined"
                        sx={{ color: ink.ok, borderColor: 'rgba(63, 185, 132, 0.35)' }}
                      />
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Typography variant="body2">Storage</Typography>
                      <Typography variant="body2" sx={{ ...monoText, color: 'text.secondary' }}>
                        {config?.backup?.destinationPath || 'Not configured'}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Typography variant="body2">Keep at most</Typography>
                      <Typography variant="body2" sx={{ ...monoText, color: 'text.secondary' }}>
                        {config?.backup?.maxBackups || 10}
                      </Typography>
                    </Box>
                  </Stack>
                </CardContent>
              </Card>

              {/* Recent Jobs */}
              <Card>
                <CardContent>
                  <Typography variant="h4" sx={{ mb: 2 }}>Recent jobs</Typography>
                  {jobs.length === 0 ? (
                    <Box sx={{ textAlign: 'center', py: 2 }}>
                      <Schedule sx={{ fontSize: 24, color: ink.faint, mb: 1 }} />
                      <Typography variant="body2" color="text.secondary">
                        No jobs yet
                      </Typography>
                    </Box>
                  ) : (
                    <List dense>
                      {jobs.slice(0, 5).map((job, index) => (
                        <Fade
                          key={job.id || index}
                          in={true}
                          timeout={400 + index * 150}
                        >
                          <ListItem 
                            sx={{ 
                              px: 0,
                              borderRadius: 1,
                              transition: 'all 0.2s ease',
                              '&:hover': {
                                backgroundColor: 'rgba(148, 163, 184, 0.05)',
                                transform: 'translateX(4px)',
                              }
                            }}
                          >
                            <ListItemIcon>
                              {getStatusIcon(job.status)}
                            </ListItemIcon>
                            <ListItemText
                              primary={job.type || 'Backup Job'}
                              secondary={formatDate(job.createdAt || job.timestamp)}
                              primaryTypographyProps={{ fontSize: '0.875rem' }}
                              secondaryTypographyProps={{ fontSize: '0.75rem' }}
                            />
                          </ListItem>
                        </Fade>
                      ))}
                    </List>
                  )}
                </CardContent>
              </Card>
            </Stack>
          </Grid>
        </Grid>

        {/* Global Analytics */}
        <Box>
          <GlobalAnalytics />
        </Box>
      </Container>

      {/* Configuration Edit Dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          <Stack direction="row" alignItems="center" spacing={2}>
            <Settings />
            <Typography variant="h6">Edit Configuration</Typography>
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ mt: 2 }}>
            <TextField
              label="Pi-hole Host"
              value={editConfig.pihole?.host || ''}
              onChange={(e) => setEditConfig({
                ...editConfig,
                pihole: { ...editConfig.pihole, host: e.target.value }
              })}
              fullWidth
            />
            <TextField
              label="Username"
              value={editConfig.pihole?.username || ''}
              onChange={(e) => setEditConfig({
                ...editConfig,
                pihole: { ...editConfig.pihole, username: e.target.value }
              })}
              fullWidth
            />
            <TextField
              label="SSH Port"
              type="number"
              value={editConfig.pihole?.port || 22}
              onChange={(e) => setEditConfig({
                ...editConfig,
                pihole: { ...editConfig.pihole, port: parseInt(e.target.value) }
              })}
              fullWidth
            />
            <TextField
              label="Backup Path"
              value={editConfig.backup?.destinationPath || ''}
              onChange={(e) => setEditConfig({
                ...editConfig,
                backup: { ...editConfig.backup, destinationPath: e.target.value }
              })}
              fullWidth
            />
            <TextField
              label="Max Backups"
              type="number"
              value={editConfig.backup?.maxBackups || 10}
              onChange={(e) => setEditConfig({
                ...editConfig,
                backup: { ...editConfig.backup, maxBackups: parseInt(e.target.value) }
              })}
              fullWidth
            />
            <TextField
              label="Cron Expression"
              value={editConfig.schedule?.cronExpression || ''}
              onChange={(e) => setEditConfig({
                ...editConfig,
                schedule: { ...editConfig.schedule, cronExpression: e.target.value }
              })}
              fullWidth
              helperText="Example: 0 3 * * * (daily at 3 AM)"
            />
            <FormControl fullWidth>
              <InputLabel>Timezone</InputLabel>
              <Select
                value={editConfig.schedule?.timezone || 'GMT+3'}
                onChange={(e) => setEditConfig({
                  ...editConfig,
                  schedule: { ...editConfig.schedule, timezone: e.target.value }
                })}
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
                <MenuItem value="GMT+0">GMT+0</MenuItem>
                <MenuItem value="GMT+1">GMT+1</MenuItem>
                <MenuItem value="GMT+2">GMT+2</MenuItem>
                <MenuItem value="GMT+3">GMT+3</MenuItem>
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
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveConfig}>
            Save Changes
          </Button>
        </DialogActions>
      </Dialog>

      {/* Discord Configuration Dialog */}
      <Dialog open={discordDialogOpen} onClose={handleDiscordClose} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Avatar sx={{ bgcolor: 'info.main' }}>
              <Notifications />
            </Avatar>
            Discord Notifications
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={discordConfig.enabled}
                  onChange={(e) => setDiscordConfig(prev => ({ ...prev, enabled: e.target.checked }))}
                  color="primary"
                />
              }
              label="Enable Discord Notifications"
              sx={{ mb: 3 }}
            />
            
            {discordConfig.enabled && (
              <Stack spacing={3}>
                <TextField
                  fullWidth
                  label="Discord Webhook URL"
                  value={discordConfig.webhookUrl}
                  onChange={(e) => setDiscordConfig(prev => ({ ...prev, webhookUrl: e.target.value }))}
                  placeholder="https://discord.com/api/webhooks/..."
                  helperText="Get this from your Discord server settings > Integrations > Webhooks"
                  type="url"
                />
                
                <Box>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={discordConfig.notifyOnSuccess}
                        onChange={(e) => setDiscordConfig(prev => ({ ...prev, notifyOnSuccess: e.target.checked }))}
                        color="primary"
                      />
                    }
                    label="Notify on Successful Backup"
                  />
                </Box>
                
                <Box>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={discordConfig.notifyOnFailure}
                        onChange={(e) => setDiscordConfig(prev => ({ ...prev, notifyOnFailure: e.target.checked }))}
                        color="primary"
                      />
                    }
                    label="Notify on Backup Failure"
                  />
                </Box>
                
                <Box sx={{ p: 2, bgcolor: 'background.paper', borderRadius: 1 }}>
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
                
                {discordConfig.webhookUrl && (
                  <Button
                    variant="outlined"
                    onClick={handleDiscordTest}
                    disabled={discordTesting}
                    startIcon={discordTesting ? <CircularProgress size={20} /> : <Notifications />}
                    fullWidth
                  >
                    {discordTesting ? 'Testing...' : 'Send Test Notification'}
                  </Button>
                )}
              </Stack>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDiscordClose}>Cancel</Button>
          <Button variant="contained" onClick={handleDiscordSave}>
            Save Configuration
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Dashboard;
