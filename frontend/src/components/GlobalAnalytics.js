import React, { useState, useEffect, memo } from 'react';
import {
  Card,
  CardContent,
  Box,
  Typography,
  CircularProgress,
  Grow,
  useTheme,
  Chip,
  Tooltip,
  IconButton,
  Fade,
} from '@mui/material';
import {
  Public,
  Refresh,
  TrendingUp,
  Groups,
  CheckCircle,
  Storage,
  Speed,
  Info,
} from '@mui/icons-material';
import { fetchGlobalAnalytics, getInstanceId } from '../services/analytics';

const GlobalAnalytics = memo(() => {
  const theme = useTheme();
  const [globalStats, setGlobalStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadGlobalStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const stats = await fetchGlobalAnalytics();
      setGlobalStats(stats);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err.message);
      console.error('Failed to load global analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGlobalStats();
    // Refresh every 5 minutes
    const interval = setInterval(loadGlobalStats, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !globalStats) {
    return (
      <Card
        sx={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          borderRadius: '16px',
          overflow: 'hidden',
        }}
      >
        <CardContent sx={{ textAlign: 'center', py: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            <CircularProgress size={24} sx={{ color: 'white' }} />
            <Typography variant="body1">Loading global community stats...</Typography>
          </Box>
        </CardContent>
      </Card>
    );
  }

  if (error && !globalStats) {
    return (
      <Card
        sx={{
          background: 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)',
          color: 'white',
          borderRadius: '16px',
          overflow: 'hidden',
        }}
      >
        <CardContent sx={{ textAlign: 'center', py: 3 }}>
          <Typography variant="body2" sx={{ opacity: 0.8 }}>
            Global stats temporarily unavailable
          </Typography>
        </CardContent>
      </Card>
    );
  }

  if (!globalStats) return null;

  const formatNumber = (num) => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toLocaleString();
  };

  const formatSize = (bytes) => {
    if (bytes >= 1024 * 1024 * 1024) {
      return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
    } else if (bytes >= 1024 * 1024) {
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    } else if (bytes >= 1024) {
      return (bytes / 1024).toFixed(1) + ' KB';
    }
    return bytes + ' B';
  };

  return (
    <Grow in={true} style={{ transformOrigin: '0 0 0' }} timeout={1000}>
      <Card
        sx={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          borderRadius: '16px',
          overflow: 'hidden',
          position: 'relative',
          '&::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'linear-gradient(45deg, rgba(255,255,255,0.1), transparent)',
            opacity: 0,
            transition: 'opacity 0.3s ease',
          },
          '&:hover': {
            transform: 'translateY(-4px)',
            boxShadow: '0 20px 40px rgba(102, 126, 234, 0.3)',
            '&::before': {
              opacity: 1,
            },
          },
        }}
      >
        <CardContent sx={{ p: 3 }}>
          {/* Header */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 48,
                  height: 48,
                  borderRadius: '12px',
                  background: 'rgba(255, 255, 255, 0.2)',
                  backdropFilter: 'blur(10px)',
                }}
              >
                <Public sx={{ fontSize: 24 }} />
              </Box>
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
                  🌍 HoleSafe Global Community
                </Typography>
                <Typography variant="body2" sx={{ opacity: 0.9 }}>
                  Worldwide Pi-hole backup statistics
                </Typography>
              </Box>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {lastUpdated && (
                <Tooltip title={`Last updated: ${lastUpdated.toLocaleTimeString()}`}>
                  <Chip
                    size="small"
                    label="Live"
                    sx={{
                      background: 'rgba(16, 185, 129, 0.2)',
                      color: '#10b981',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      fontSize: '0.75rem',
                    }}
                  />
                </Tooltip>
              )}
              <Tooltip title="Refresh statistics">
                <IconButton
                  size="small"
                  onClick={loadGlobalStats}
                  disabled={loading}
                  sx={{ color: 'white', opacity: 0.8, '&:hover': { opacity: 1 } }}
                >
                  <Refresh fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>

          {/* Stats Grid */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 2,
              mb: 3,
            }}
          >
            <Fade in={true} timeout={800}>
              <Box
                sx={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  borderRadius: '12px',
                  p: 2,
                  textAlign: 'center',
                  backdropFilter: 'blur(10px)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 1 }}>
                  <Storage sx={{ fontSize: 20, mr: 0.5, opacity: 0.9 }} />
                </Box>
                <Typography variant="h4" sx={{ fontWeight: 800, mb: 0.5 }}>
                  {formatNumber(globalStats.total_jobs)}
                </Typography>
                <Typography variant="body2" sx={{ opacity: 0.9, fontSize: '0.8rem' }}>
                  Total Backup Jobs
                </Typography>
              </Box>
            </Fade>

            <Fade in={true} timeout={1000}>
              <Box
                sx={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  borderRadius: '12px',
                  p: 2,
                  textAlign: 'center',
                  backdropFilter: 'blur(10px)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 1 }}>
                  <Groups sx={{ fontSize: 20, mr: 0.5, opacity: 0.9 }} />
                </Box>
                <Typography variant="h4" sx={{ fontWeight: 800, mb: 0.5 }}>
                  {globalStats.unique_instances}
                </Typography>
                <Typography variant="body2" sx={{ opacity: 0.9, fontSize: '0.8rem' }}>
                  Active Instances
                </Typography>
              </Box>
            </Fade>

            <Fade in={true} timeout={1200}>
              <Box
                sx={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  borderRadius: '12px',
                  p: 2,
                  textAlign: 'center',
                  backdropFilter: 'blur(10px)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 1 }}>
                  <CheckCircle sx={{ fontSize: 20, mr: 0.5, opacity: 0.9 }} />
                </Box>
                <Typography variant="h4" sx={{ fontWeight: 800, mb: 0.5 }}>
                  {globalStats.success_rate.toFixed(1)}%
                </Typography>
                <Typography variant="body2" sx={{ opacity: 0.9, fontSize: '0.8rem' }}>
                  Success Rate
                </Typography>
              </Box>
            </Fade>

            <Fade in={true} timeout={1400}>
              <Box
                sx={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  borderRadius: '12px',
                  p: 2,
                  textAlign: 'center',
                  backdropFilter: 'blur(10px)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 1 }}>
                  <Speed sx={{ fontSize: 20, mr: 0.5, opacity: 0.9 }} />
                </Box>
                <Typography variant="h4" sx={{ fontWeight: 800, mb: 0.5 }}>
                  {globalStats.average_duration ? `${globalStats.average_duration.toFixed(1)}s` : 'N/A'}
                </Typography>
                <Typography variant="body2" sx={{ opacity: 0.9, fontSize: '0.8rem' }}>
                  Avg Duration
                </Typography>
              </Box>
            </Fade>
          </Box>

          {/* Community Message */}
          <Box
            sx={{
              background: 'rgba(255, 255, 255, 0.1)',
              borderRadius: '12px',
              p: 2.5,
              textAlign: 'center',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            <Typography variant="body1" sx={{ fontWeight: 500, mb: 1 }}>
              🎉 You're part of a global community protecting{' '}
              <strong>{globalStats.unique_instances}</strong> Pi-hole instances worldwide!
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.9 }}>
              Together we've secured{' '}
              <strong>{formatNumber(globalStats.successful_jobs)}</strong> successful backups
              {globalStats.total_backup_size && (
                <span> totaling <strong>{formatSize(globalStats.total_backup_size)}</strong></span>
              )}
            </Typography>
          </Box>

          {/* Instance ID Info */}
          <Box sx={{ mt: 2, textAlign: 'center' }}>
            <Tooltip title="Your unique HoleSafe instance identifier">
              <Chip
                size="small"
                icon={<Info sx={{ fontSize: '14px !important' }} />}
                label={`Instance: ${getInstanceId()}`}
                sx={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  color: 'rgba(255, 255, 255, 0.8)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  fontSize: '0.7rem',
                  '& .MuiChip-icon': {
                    color: 'rgba(255, 255, 255, 0.6)',
                  },
                }}
              />
            </Tooltip>
          </Box>
        </CardContent>
      </Card>
    </Grow>
  );
});

GlobalAnalytics.displayName = 'GlobalAnalytics';

export default GlobalAnalytics;
