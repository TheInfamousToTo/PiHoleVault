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
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import api from '../services/api';

// Stats Card Component with Enhanced Animations
const StatsCard = memo(({ title, value, icon, color, subtitle, trend, index = 0 }) => {
  return (
    <Grow
      in={true}
      style={{ transformOrigin: '0 0 0' }}
      timeout={800 + (index * 200)}
    >
      <Card
        sx={{
          height: '100%',
          background: `linear-gradient(135deg, ${color}15 0%, ${color}05 100%)`,
          border: `1px solid ${color}30`,
          backdropFilter: 'blur(10px)',
          position: 'relative',
          overflow: 'hidden',
          '&::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: `linear-gradient(45deg, ${color}10, transparent)`,
            opacity: 0,
            transition: 'opacity 0.3s ease',
          },
          '&:hover': {
            transform: 'translateY(-8px) scale(1.02)',
            boxShadow: `0 20px 40px ${color}25, 0 0 0 1px ${color}40`,
            '&::before': {
              opacity: 1,
            },
          },
          transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
          cursor: 'pointer',
        }}
      >
        <CardContent sx={{ p: 3, position: 'relative', zIndex: 1 }}>
          <Stack direction="row" alignItems="center" spacing={2}>
            <Box
              sx={{
                p: 2,
                borderRadius: 3,
                backgroundColor: `${color}20`,
                color: color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                '&::after': {
                  content: '""',
                  position: 'absolute',
                  inset: 0,
                  borderRadius: 3,
                  background: `linear-gradient(45deg, ${color}30, transparent)`,
                  opacity: 0,
                  transition: 'opacity 0.3s ease',
                },
                '&:hover::after': {
                  opacity: 1,
                },
                transition: 'transform 0.3s ease',
                '&:hover': {
                  transform: 'rotate(5deg) scale(1.1)',
                },
              }}
            >
              {icon}
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography 
                variant="h4" 
                fontWeight="bold" 
                color="text.primary"
                sx={{
                  background: `linear-gradient(45deg, ${color}, ${color}80)`,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                {value}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                {title}
              </Typography>
              {subtitle && (
                <Typography 
                  variant="caption" 
                  color={color} 
                  sx={{ 
                    mt: 0.5, 
                    display: 'block',
                    fontWeight: 600,
                    opacity: 0.8,
                  }}
                >
                  {subtitle}
                </Typography>
              )}
            </Box>
          </Stack>
        </CardContent>
      </Card>
    </Grow>
  );
});

// Enhanced Hero Section Component
const HeroSection = memo(({ onClose, show }) => {
  if (!show) return null;
  
  return (
    <Slide direction="down" in={show} mountOnEnter unmountOnExit timeout={600}>
      <Box
        sx={{
          background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
          borderRadius: 4,
          p: 4,
          mb: 4,
          position: 'relative',
          overflow: 'hidden',
          boxShadow: '0 20px 40px rgba(59, 130, 246, 0.3)',
          '&::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(255, 255, 255, 0.1)',
            borderRadius: 4,
            backdropFilter: 'blur(10px)',
          },
          '&::after': {
            content: '""',
            position: 'absolute',
            top: '-50%',
            right: '-50%',
            width: '200%',
            height: '200%',
            background: 'linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.1) 50%, transparent 70%)',
            animation: 'shimmer 3s infinite',
            '@keyframes shimmer': {
              '0%': { transform: 'translateX(-100%) translateY(-100%) rotate(45deg)' },
              '100%': { transform: 'translateX(100%) translateY(100%) rotate(45deg)' },
            },
          },
        }}
      >
        <IconButton
          onClick={onClose}
          sx={{
            position: 'absolute',
            top: 16,
            right: 16,
            color: 'white',
            backgroundColor: 'rgba(255, 255, 255, 0.15)',
            backdropFilter: 'blur(10px)',
            '&:hover': {
              backgroundColor: 'rgba(255, 255, 255, 0.25)',
              transform: 'scale(1.1) rotate(90deg)',
            },
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            zIndex: 3,
          }}
        >
          <Close />
        </IconButton>
        <Stack spacing={3} sx={{ position: 'relative', zIndex: 2 }}>
          <Zoom in={show} timeout={800}>
            <Typography
              variant="h3"
              fontWeight="bold"
              color="white"
              sx={{
                textShadow: '0 4px 8px rgba(0,0,0,0.3)',
                background: 'linear-gradient(45deg, #ffffff, #e0e7ff)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              Welcome to HoleSafe
            </Typography>
          </Zoom>
          <Fade in={show} timeout={1200}>
            <Typography
              variant="h6"
              color="rgba(255, 255, 255, 0.95)"
              sx={{ 
                maxWidth: '600px',
                textShadow: '0 2px 4px rgba(0,0,0,0.2)',
                fontWeight: 400,
                lineHeight: 1.6,
              }}
            >
              Your modern Pi-hole backup solution. Automated, secure, and reliable backup management
              for your network-wide ad blocking configuration.
            </Typography>
          </Fade>
          <Box sx={{ display: 'flex', gap: 2, mt: 3, flexWrap: 'wrap' }}>
            {[
              { icon: <Shield />, label: "Secure", delay: 1400 },
              { icon: <Cloud />, label: "Automated", delay: 1600 },
              { icon: <Speed />, label: "Fast", delay: 1800 }
            ].map((chip, index) => (
              <Zoom key={chip.label} in={show} timeout={chip.delay}>
                <Chip
                  icon={chip.icon}
                  label={chip.label}
                  sx={{
                    backgroundColor: 'rgba(255, 255, 255, 0.2)',
                    color: 'white',
                    fontWeight: 600,
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    '& .MuiChip-icon': { color: 'white' },
                    '&:hover': {
                      backgroundColor: 'rgba(255, 255, 255, 0.3)',
                      transform: 'translateY(-2px)',
                    },
                    transition: 'all 0.3s ease',
                  }}
                />
              </Zoom>
            ))}
          </Box>
        </Stack>
      </Box>
    </Slide>
  );
});

// Enhanced Icon Button Component
const EnhancedIconButton = memo(({ children, onClick, color = '#6c757d', tooltip, disabled = false, sx = {} }) => (
  <Tooltip title={tooltip} placement="bottom">
    <IconButton
      onClick={onClick}
      disabled={disabled}
      sx={{
        color: disabled ? 'text.disabled' : color,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(10px)',
        border: `1px solid ${disabled ? 'rgba(255,255,255,0.1)' : color}40`,
        width: 44,
        height: 44,
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        '&:hover': {
          backgroundColor: disabled ? 'rgba(255, 255, 255, 0.1)' : color,
          color: disabled ? 'text.disabled' : 'white',
          transform: disabled ? 'none' : 'translateY(-2px) scale(1.05)',
          boxShadow: disabled ? 'none' : `0 8px 20px ${color}40`,
          borderColor: disabled ? 'rgba(255,255,255,0.1)' : color,
        },
        '&:active': {
          transform: disabled ? 'none' : 'translateY(0) scale(0.95)',
        },
        '&.Mui-disabled': {
          opacity: 0.5,
        },
        ...sx, // Merge with custom styles
      }}
    >
      {children}
    </IconButton>
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
      minWidth: 140,
      py: 1.5,
      px: 4,
      borderRadius: 3,
      fontWeight: 600,
      textTransform: 'none',
      position: 'relative',
      overflow: 'hidden',
      boxShadow: variant === 'contained' ? '0 6px 20px rgba(59, 130, 246, 0.3)' : 'none',
      '&::before': {
        content: '""',
        position: 'absolute',
        top: 0,
        left: '-100%',
        width: '100%',
        height: '100%',
        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)',
        transition: 'left 0.6s ease',
      },
      '&:hover': {
        transform: 'translateY(-3px) scale(1.02)',
        boxShadow: variant === 'contained' ? '0 10px 30px rgba(59, 130, 246, 0.4)' : '0 6px 20px rgba(0,0,0,0.1)',
        '&::before': {
          left: '100%',
        },
      },
      '&:active': {
        transform: 'translateY(-1px) scale(0.98)',
      },
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
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
  const [showWelcome, setShowWelcome] = useState(true);
  const [settingsAnchorEl, setSettingsAnchorEl] = useState(null);

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
          pihole: { host: '192.168.31.230', username: 'root', port: 22 },
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
      await api.post('/backup/run');
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
      default:
        return theme.palette.text.secondary;
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircle />;
      case 'running':
        return <CircularProgress size={20} />;
      case 'failed':
        return <Error />;
      default:
        return <Info />;
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
    <Box sx={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
    }}>
      {/* Modern App Bar with Icon-Only Buttons */}
      <AppBar 
        position="sticky" 
        elevation={0}
        sx={{
          background: 'rgba(30, 41, 59, 0.8)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(148, 163, 184, 0.1)',
          zIndex: (theme) => theme.zIndex.appBar, // Ensure proper layering
        }}
      >
        <Toolbar>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <img 
              src="/logo.png" 
              alt="HoleSafe Logo" 
              style={{ 
                height: 40, 
                width: 'auto', 
                borderRadius: '8px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
              }} 
            />
            <Typography variant="h6" fontWeight="bold" color="white">
              HoleSafe
            </Typography>
          </Box>
          
          <Box sx={{ flexGrow: 1 }} />
          
          <Stack direction="row" spacing={1} alignItems="center">
            {/* GitHub */}
            <EnhancedIconButton
              onClick={() => window.open('https://github.com/TheInfamousToTo', '_blank')}
              tooltip="GitHub"
              color="#6e5494"
              sx={{ 
                '&:hover': { 
                  backgroundColor: 'rgba(110, 84, 148, 0.2)',
                }
              }}
            >
              <GitHub />
            </EnhancedIconButton>

            {/* Star */}
            <EnhancedIconButton
              onClick={() => window.open('https://github.com/TheInfamousToTo/HoleSafe', '_blank')}
              tooltip="Star on GitHub"
              color="#f59e0b"
              sx={{ 
                '&:hover': { 
                  backgroundColor: 'rgba(245, 158, 11, 0.2)',
                }
              }}
            >
              <Star />
            </EnhancedIconButton>

            {/* Buy Coffee */}
            <EnhancedIconButton
              onClick={() => window.open('https://buymeacoffee.com/theinfamoustoto', '_blank')}
              tooltip="Buy Me a Coffee"
              color="#ff813f"
              sx={{ 
                '&:hover': { 
                  backgroundColor: 'rgba(255, 129, 63, 0.2)',
                }
              }}
            >
              <Coffee />
            </EnhancedIconButton>

            {/* Ko-fi */}
            <EnhancedIconButton
              onClick={() => window.open('https://ko-fi.com/theinfamoustoto', '_blank')}
              tooltip="Support on Ko-fi"
              color="#ff5722"
              sx={{ 
                '&:hover': { 
                  backgroundColor: 'rgba(255, 87, 34, 0.2)',
                }
              }}
            >
              <Favorite />
            </EnhancedIconButton>

            {/* Sponsor with Heart icon */}
            <EnhancedIconButton
              onClick={() => window.open('https://github.com/sponsors/TheInfamousToTo', '_blank')}
              tooltip="Sponsor"
              color="#8b5cf6"
              sx={{ 
                '&:hover': { 
                  backgroundColor: 'rgba(139, 92, 246, 0.2)',
                }
              }}
            >
              <Favorite />
            </EnhancedIconButton>

            {/* Refresh */}
            <EnhancedIconButton
              onClick={() => loadDashboardData()}
              disabled={refreshing}
              tooltip="Refresh"
              color="rgba(255, 255, 255, 0.8)"
              sx={{ 
                '&:hover': { 
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                }
              }}
            >
              <Refresh />
            </EnhancedIconButton>

            {/* Run Backup */}
            <ActionButton
              icon={<PlayArrow />}
              label="Run Backup"
              onClick={handleRunBackup}
              disabled={runningBackup}
            />

            {/* Settings Menu */}
            <EnhancedIconButton
              onClick={handleSettingsClick}
              tooltip="Settings"
              color="rgba(255, 255, 255, 0.8)"
              sx={{ 
                '&:hover': { 
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                }
              }}
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
        <HeroSection show={showWelcome} onClose={() => setShowWelcome(false)} />

        {/* Stats Grid */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={12} sm={6} md={3}>
            <StatsCard
              title="Total Backups"
              value={backups.length}
              icon={<Storage />}
              color={theme.palette.primary.main}
              subtitle={`${backups.filter(b => b.status === 'completed').length} completed`}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatsCard
              title="Scheduled Jobs"
              value={jobs.length}
              icon={<Schedule />}
              color={theme.palette.secondary.main}
              subtitle={`${jobs.filter(j => j.status === 'running').length} active`}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatsCard
              title="Pi-hole Host"
              value={config?.pihole?.host || 'Not configured'}
              icon={<Security />}
              color={theme.palette.success.main}
              subtitle={`Port ${config?.pihole?.port || 22}`}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatsCard
              title="Backup Schedule"
              value={config?.schedule?.enabled ? 'Enabled' : 'Disabled'}
              icon={<Timeline />}
              color={config?.schedule?.enabled ? theme.palette.success.main : theme.palette.error.main}
              subtitle={config?.schedule?.cronExpression || 'No schedule'}
            />
          </Grid>
        </Grid>

        {/* Main Content Grid */}
        <Grid container spacing={4}>
          {/* Recent Backups */}
          <Grid item xs={12} lg={8}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
                  <Typography variant="h5" fontWeight="bold">
                    Recent Backups
                  </Typography>
                  <Chip
                    label={`${backups.length} total`}
                    color="primary"
                    size="small"
                  />
                </Stack>
                
                {backups.length === 0 ? (
                  <Box sx={{ textAlign: 'center', py: 4 }}>
                    <Cloud sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
                    <Typography variant="h6" color="text.secondary">
                      No backups yet
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Run your first backup to get started
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
                            backgroundColor: 'rgba(59, 130, 246, 0.05)',
                            border: '1px solid rgba(59, 130, 246, 0.1)',
                            transition: 'all 0.3s ease',
                            '&:hover': {
                              backgroundColor: 'rgba(59, 130, 246, 0.1)',
                              border: '1px solid rgba(59, 130, 246, 0.2)',
                              transform: 'translateY(-2px)',
                              boxShadow: '0 4px 12px rgba(59, 130, 246, 0.15)',
                            }
                          }}
                        >
                        <ListItemIcon>
                          {getStatusIcon(backup.status)}
                        </ListItemIcon>
                        <ListItemText
                          primary={
                            <Stack direction="row" alignItems="center" spacing={2}>
                              <Typography variant="subtitle1" fontWeight="medium">
                                {backup.filename || `Backup #${backup.id || index + 1}`}
                              </Typography>
                              <Chip
                                label={backup.status || 'completed'}
                                size="small"
                                sx={{
                                  backgroundColor: `${getStatusColor(backup.status)}20`,
                                  color: getStatusColor(backup.status),
                                  fontWeight: 'medium',
                                }}
                              />
                            </Stack>
                          }
                          secondary={
                            <Stack direction="row" alignItems="center" spacing={2} sx={{ mt: 1 }}>
                              <Typography variant="body2" color="text.secondary">
                                {formatDate(backup.createdAt || backup.timestamp)}
                              </Typography>
                              {backup.size && (
                                <Typography variant="body2" color="text.secondary">
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
                  <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>
                    System Status
                  </Typography>
                  <Stack spacing={2}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Typography variant="body2">Connection Status</Typography>
                      <Chip
                        label="Connected"
                        size="small"
                        color="success"
                        icon={<CheckCircle />}
                      />
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Typography variant="body2">Backup Storage</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {config?.backup?.destinationPath || 'Not configured'}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Typography variant="body2">Max Backups</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {config?.backup?.maxBackups || 10}
                      </Typography>
                    </Box>
                  </Stack>
                </CardContent>
              </Card>

              {/* Recent Jobs */}
              <Card>
                <CardContent>
                  <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>
                    Recent Jobs
                  </Typography>
                  {jobs.length === 0 ? (
                    <Box sx={{ textAlign: 'center', py: 2 }}>
                      <Schedule sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
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
    </Box>
  );
};

export default Dashboard;
