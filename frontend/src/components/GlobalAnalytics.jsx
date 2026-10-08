import React, { useState, useEffect, memo } from 'react';
import {
  Box,
  Typography,
  CircularProgress,
  Chip,
  Tooltip,
  IconButton,
  Stack,
} from '@mui/material';
import {
  Public,
  Refresh,
  Groups,
  CheckCircle,
  Storage,
  Speed,
} from '@mui/icons-material';
import { motion } from 'framer-motion';
import { GlowCard, CountUp, LiveDot, IconTile } from './ui';
import { ink, gradient, monoText, labelText, ease } from '../theme';
import { fetchGlobalAnalytics } from '../services/analytics';

const GlobalAnalytics = memo(() => {
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

  // Community stats are a nice-to-have from a third-party service. When it is
  // unreachable -- which is common on a network that deliberately blocks
  // outbound traffic -- say nothing rather than announce the absence.
  if (error && !globalStats) {
    return null;
  }

  if (loading && !globalStats) {
    return (
      <GlowCard glow={false} sx={{ p: 3 }}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <CircularProgress size={14} thickness={5} />
          <Typography variant="body2">Loading community stats…</Typography>
        </Stack>
      </GlowCard>
    );
  }

  if (!globalStats) return null;

  const formatNumber = (num) => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return Math.round(num).toLocaleString();
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

  const tiles = [
    { icon: <Storage />, label: 'Backup jobs', value: globalStats.total_jobs, format: formatNumber, tone: ink.accent },
    { icon: <Groups />, label: 'Active instances', value: globalStats.unique_instances, format: formatNumber, tone: '#A78BFA' },
    { icon: <CheckCircle />, label: 'Success rate', value: globalStats.success_rate, format: (v) => `${v.toFixed(1)}%`, tone: ink.ok },
    {
      icon: <Speed />,
      label: 'Avg duration',
      value: globalStats.average_duration || 0,
      format: (v) => (globalStats.average_duration ? `${v.toFixed(1)}s` : 'N/A'),
      tone: ink.accent2
    }
  ];

  return (
    <GlowCard sx={{ p: { xs: 2, md: 3 } }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2} sx={{ mb: 3 }}>
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ minWidth: 0 }}>
          <IconTile size={34}>
            <motion.span
              animate={{ rotate: 360 }}
              transition={{ duration: 24, repeat: Infinity, ease: 'linear' }}
              style={{ display: 'inline-flex' }}
            >
              <Public />
            </motion.span>
          </IconTile>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h4">Global community</Typography>
            <Typography variant="caption">PiHoleVault instances backing up worldwide</Typography>
          </Box>
        </Stack>
        <Stack direction="row" alignItems="center" spacing={1}>
          {lastUpdated && (
            <Tooltip title={`Last updated: ${lastUpdated.toLocaleTimeString()}`}>
              <Chip
                size="small"
                icon={<Box sx={{ display: 'inline-flex', ml: '8px !important' }}><LiveDot size={6} /></Box>}
                label="Live"
                sx={{ color: ink.ok, backgroundColor: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.25)' }}
              />
            </Tooltip>
          )}
          <Tooltip title="Refresh statistics">
            <span>
              <IconButton
                size="small"
                onClick={loadGlobalStats}
                disabled={loading}
                sx={{ '& svg': loading ? { animation: 'pv-spin 0.9s linear infinite' } : undefined }}
              >
                <Refresh fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      </Stack>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
          gap: { xs: 1.5, md: 2 },
          mb: 2.5
        }}
      >
        {tiles.map((tile, index) => (
          <motion.div
            key={tile.label}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.5, ease, delay: index * 0.08 }}
          >
            <Box
              sx={{
                p: 2,
                height: '100%',
                borderRadius: '12px',
                border: `1px solid ${ink.line}`,
                backgroundColor: 'rgba(255,255,255,0.02)',
                transition: 'border-color 200ms, transform 200ms',
                '&:hover': { borderColor: `${tile.tone}55`, transform: 'translateY(-2px)' }
              }}
            >
              <Box sx={{ color: tile.tone, display: 'inline-flex', mb: 1, '& svg': { fontSize: 18 } }}>{tile.icon}</Box>
              <Box sx={{ fontSize: '1.5rem', fontWeight: 650, letterSpacing: '-0.03em', lineHeight: 1.2 }}>
                <CountUp value={tile.value} format={tile.format} duration={1.4} />
              </Box>
              <Typography sx={{ ...labelText, fontSize: '0.75rem', mt: 0.25 }}>{tile.label}</Typography>
            </Box>
          </motion.div>
        ))}
      </Box>

      <Box
        sx={{
          p: 2,
          borderRadius: '12px',
          background: gradient.accentSoft,
          border: '1px solid rgba(91,140,255,0.18)',
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          alignItems: { xs: 'flex-start', sm: 'center' },
          justifyContent: 'space-between',
          gap: 1.5
        }}
      >
        <Typography variant="body2" sx={{ color: 'text.primary' }}>
          PiHoleVault users who share anonymous stats: <strong>{globalStats.unique_instances}</strong> instances,{' '}
          <strong>{formatNumber(globalStats.successful_jobs)}</strong> successful backups
          {globalStats.total_backup_size ? (
            <span> totalling <strong>{formatSize(globalStats.total_backup_size)}</strong></span>
          ) : null}
          .
        </Typography>
      </Box>
    </GlowCard>
  );
});

GlobalAnalytics.displayName = 'GlobalAnalytics';

export default GlobalAnalytics;
