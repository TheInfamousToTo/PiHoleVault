import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import {
  Container,
  Grid,
  Typography,
  Button,
  Box,
  Chip,
  ListItemIcon,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  AppBar,
  Toolbar,
  Stack,
  Tooltip,
  MenuItem,
  Menu,
  Divider,
  useMediaQuery,
  useTheme
} from '@mui/material';
import {
  PlayArrow,
  Schedule,
  Settings,
  Download,
  DeleteOutline,
  Refresh,
  CheckCircle,
  Shield,
  CloudOff,
  GitHub,
  Coffee,
  Favorite,
  Star,
  Notifications,
  Dns,
  Inventory2,
  History,
  FolderOpen,
  WarningAmber,
  VolunteerActivism,
  OpenInNew,
  PushPin,
  PushPinOutlined,
  SettingsBackupRestore,
  CompareArrows,
  Lock,
  CloudDone,
  CloudUpload,
  VerifiedUser,
  GppBad,
  PrivacyTip
} from '@mui/icons-material';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'react-toastify';
import api from '../services/api';
import GlobalAnalytics from './GlobalAnalytics';
import SettingsDialog from './SettingsDialog';
import RestoreDialog from './RestoreDialog';
import DiffDialog from './DiffDialog';
import {
  MotionBox,
  GlowCard,
  CountUp,
  LiveDot,
  IconTile,
  GradientText,
  Ring,
  Shimmer,
  stagger,
  rise
} from './ui';
import { ink, monoText, labelText, ease } from '../theme';
import { describeCron } from '../utils/cron';

const SUPPORT_LINKS = [
  { label: 'GitHub', href: 'https://github.com/TheInfamousToTo', icon: <GitHub fontSize="small" /> },
  { label: 'Star on GitHub', href: 'https://github.com/TheInfamousToTo/PiHoleVault', icon: <Star fontSize="small" sx={{ color: '#F5B451' }} /> },
  { label: 'Buy Me a Coffee', href: 'https://buymeacoffee.com/theinfamoustoto', icon: <Coffee fontSize="small" sx={{ color: '#FF9D5C' }} /> },
  { label: 'Support on Ko-fi', href: 'https://ko-fi.com/theinfamoustoto', icon: <Favorite fontSize="small" sx={{ color: '#FF6B6B' }} /> },
  { label: 'GitHub Sponsors', href: 'https://github.com/sponsors/TheInfamousToTo', icon: <VolunteerActivism fontSize="small" sx={{ color: '#C084FC' }} /> }
];

// --- Formatting helpers -----------------------------------------------------

const formatDate = (dateString) => new Date(dateString).toLocaleString();

const formatBytes = (bytes) => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(i ? 1 : 0)) + ' ' + sizes[i];
};

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const relativeTime = (value) => {
  if (!value) return null;
  const seconds = (new Date(value).getTime() - Date.now()) / 1000;
  if (!Number.isFinite(seconds)) return null;
  const units = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60]
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return 'just now';
};

// Jobs are logged as success/error by the scheduled path and completed/failed
// by the manual one; backups listed from disk carry no status at all. Fold
// them into three states so a failed job can never render as a green tick.
const normaliseStatus = (status) => {
  if (status === 'running') return 'running';
  if (status === 'error' || status === 'failed') return 'failed';
  return 'ok';
};

const STATUS = {
  ok: { color: ink.ok, label: 'Completed' },
  running: { color: ink.warn, label: 'Running' },
  failed: { color: ink.bad, label: 'Failed' }
};

// --- Small presentational pieces -------------------------------------------

const HeaderIcon = memo(({ tooltip, onClick, disabled, children, spinning }) => (
  <Tooltip title={tooltip}>
    <span>
      <IconButton
        onClick={onClick}
        disabled={disabled}
        aria-label={tooltip}
        sx={{
          width: 38,
          height: 38,
          '& svg': spinning ? { animation: 'pv-spin 0.9s linear infinite' } : undefined
        }}
      >
        {children}
      </IconButton>
    </span>
  </Tooltip>
));

const SectionHeader = ({ icon, title, meta, tone }) => (
  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2.5 }}>
    <Stack direction="row" alignItems="center" spacing={1.5}>
      <IconTile size={34} tone={tone}>{icon}</IconTile>
      <Typography variant="h4">{title}</Typography>
    </Stack>
    {meta && <Typography sx={{ ...labelText, fontVariantNumeric: 'tabular-nums' }}>{meta}</Typography>}
  </Stack>
);

const StatTile = memo(({ icon, label, children, note, tone = ink.accent }) => (
  <GlowCard
    whileHover={{ y: -3 }}
    transition={{ type: 'spring', stiffness: 300, damping: 22 }}
    sx={{ p: 2.5, height: '100%' }}
  >
    <Stack direction="row" alignItems="center" spacing={1.25} sx={{ mb: 1.75 }}>
      <IconTile size={30} tone={tone}>{icon}</IconTile>
      <Typography sx={labelText}>{label}</Typography>
    </Stack>
    <Box
      sx={{
        fontSize: '1.625rem',
        fontWeight: 650,
        letterSpacing: '-0.03em',
        lineHeight: 1.15,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap'
      }}
    >
      {children}
    </Box>
    {note && (
      <Typography
        sx={{
          mt: 0.75,
          fontSize: '0.8125rem',
          color: ink.faint,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}
        title={typeof note === 'string' ? note : undefined}
      >
        {note}
      </Typography>
    )}
  </GlowCard>
));

const InfoRow = ({ label, value, mono: isMono = false }) => (
  <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2} sx={{ py: 1.25 }}>
    <Typography variant="body2">{label}</Typography>
    <Typography
      variant="body2"
      sx={{
        color: 'text.primary',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        ...(isMono ? monoText : null)
      }}
      title={typeof value === 'string' ? value : undefined}
    >
      {value}
    </Typography>
  </Stack>
);

// --- Dashboard --------------------------------------------------------------

const Dashboard = ({ onReconfigure }) => {
  const [config, setConfig] = useState(null);
  const [backups, setBackups] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [runningBackup, setRunningBackup] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [settingsAnchorEl, setSettingsAnchorEl] = useState(null);
  const [supportAnchorEl, setSupportAnchorEl] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [scrolled, setScrolled] = useState(false);
  const [settingsTab, setSettingsTab] = useState(null);
  const [restoreTarget, setRestoreTarget] = useState(null);
  const [diffTarget, setDiffTarget] = useState(null);
  const [instanceFilter, setInstanceFilter] = useState('all');
  const [showAll, setShowAll] = useState(false);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const settingsOpen = Boolean(settingsAnchorEl);

  // The header turns to frosted glass once content scrolls beneath it.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleSettingsClick = (event) => {
    setSettingsAnchorEl(event.currentTarget);
  };

  const handleSettingsClose = () => {
    setSettingsAnchorEl(null);
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
        setConfig({ instances: [], backup: {}, schedule: {} });
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
      // Runs to completion (every enabled Pi-hole, verified, uploaded), so
      // give it the time a slow SSH host or off-site upload needs.
      const { data } = await api.post('/backup/run', {}, { timeout: 300000 });
      const results = data.results || [];
      if (results.length > 1) {
        toast.success(`Backed up ${results.length} Pi-holes`);
      } else {
        toast.success('Backup completed');
      }
    } catch (error) {
      const results = error.response?.data?.results || [];
      const failed = results.filter((r) => !r.success);
      if (failed.length && failed.length < results.length) {
        toast.warn(`${failed.length} of ${results.length} Pi-holes failed: ${failed.map((r) => `${r.instanceName}: ${r.error}`).join('; ')}`);
      } else {
        toast.error('Backup failed: ' + (error.response?.data?.error || error.message));
      }
    } finally {
      setRunningBackup(false);
      loadDashboardData();
    }
  };

  const handlePin = async (backup) => {
    try {
      await api.patch(`/backups/${encodeURIComponent(backup.filename)}`, { pinned: !backup.pinned });
      setBackups((prev) => prev.map((b) => (b.filename === backup.filename ? { ...b, pinned: !backup.pinned } : b)));
      toast.success(backup.pinned ? 'Unpinned: retention may delete it now' : 'Pinned: retention will keep it');
    } catch (error) {
      toast.error('Could not update the backup: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleVerify = async (backup) => {
    try {
      const { data } = await api.post(`/backups/${encodeURIComponent(backup.filename)}/verify`, {}, { timeout: 60000 });
      setBackups((prev) => prev.map((b) => (b.filename === backup.filename ? { ...b, integrity: data.integrity } : b)));
      data.integrity?.ok
        ? toast.success('Backup verified: pihole.toml and gravity.db are intact')
        : toast.error(`Verification failed: ${data.integrity?.error || 'unknown error'}`);
    } catch (error) {
      toast.error('Verification failed: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleDeleteBackup = async (backupId) => {
    try {
      await api.delete(`/backups/${encodeURIComponent(backupId)}`);
      // Drop the row straight away so its exit animation plays, then resync.
      setBackups((prev) => prev.filter((b) => (b.id || b.filename) !== backupId));
      toast.success('Backup deleted successfully');
      loadDashboardData();
    } catch (error) {
      toast.error('Failed to delete backup: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleDownloadBackup = async (backupId) => {
    try {
      const response = await api.get(`/backups/${encodeURIComponent(backupId)}/download`, {
        responseType: 'blob',
        timeout: 60000
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      // Encrypted backups are decrypted by the server on download, so the
      // file is a plain Teleporter zip whatever its name on disk.
      link.setAttribute('download', String(backupId).replace(/\.enc$/, ''));
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast.error('Failed to download backup: ' + (error.response?.data?.error || error.message));
    }
  };

  // --- Derived state ---------------------------------------------------------

  const instances = config?.instances || [];
  const multi = instances.length > 1;
  const instanceName = useCallback(
    (id) => instances.find((i) => i.id === id)?.name || id,
    [instances]
  );
  const enabledInstances = Math.max(1, instances.filter((i) => i.enabled !== false).length);
  const retention = config?.backup?.retention || {};
  const retentionMode = retention.mode === 'gfs' ? 'gfs' : 'count';
  const keepLast = retention.keepLast || config?.backup?.maxBackups || 10;
  // How many restore points retention will hold at most, across every Pi-hole.
  const maxBackups = enabledInstances * (retentionMode === 'gfs'
    ? keepLast + (retention.daily ?? 7) + (retention.weekly ?? 4) + (retention.monthly ?? 6)
    : keepLast);
  const pinnedCount = backups.filter((b) => b.pinned).length;
  const visibleBackups = useMemo(
    () => (instanceFilter === 'all' ? backups : backups.filter((b) => b.instanceId === instanceFilter)),
    [backups, instanceFilter]
  );
  const latestBackup = backups[0];
  const latestJob = jobs[0];
  const totalSize = useMemo(() => backups.reduce((sum, b) => sum + (b.size || 0), 0), [backups]);
  const runningJobs = jobs.filter((j) => j.status === 'running').length;
  const failedJobs = jobs.filter((j) => normaliseStatus(j.status) === 'failed').length;
  const scheduleText = describeCron(config?.schedule?.cronExpression);

  // One sentence that answers "am I covered?", with a colour to match.
  const health = useMemo(() => {
    const ageHours = latestBackup
      ? (Date.now() - new Date(latestBackup.timestamp || latestBackup.createdAt).getTime()) / 3.6e6
      : Infinity;

    if (runningJobs > 0 || runningBackup) {
      return { tone: ink.accent2, title: 'Backup in progress', detail: multi ? 'Taking a fresh snapshot of every Pi-hole…' : 'Taking a fresh snapshot of your Pi-hole…', pulse: true };
    }
    if (latestJob && normaliseStatus(latestJob.status) === 'failed') {
      return { tone: ink.bad, title: 'Last backup failed', detail: latestJob.message || 'Check the job log for details.', pulse: true };
    }
    if (!latestBackup) {
      return { tone: ink.warn, title: 'No restore points yet', detail: 'Run your first backup to start protecting your config.', pulse: true };
    }
    if (ageHours > 72) {
      return { tone: ink.warn, title: 'Backups are getting stale', detail: `Last restore point was ${relativeTime(latestBackup.timestamp || latestBackup.createdAt)}.`, pulse: true };
    }
    return { tone: ink.ok, title: multi ? 'Your Pi-holes are protected' : 'Your Pi-hole is protected', detail: `Last restore point ${relativeTime(latestBackup.timestamp || latestBackup.createdAt)}.`, pulse: true };
  }, [latestBackup, latestJob, runningJobs, runningBackup, multi]);

  if (loading) {
    return (
      <Container maxWidth="xl" sx={{ py: 12 }}>
        <Stack alignItems="center" spacing={2}>
          <CircularProgress size={28} thickness={4} />
          <Typography variant="body2">Loading your vault…</Typography>
        </Stack>
      </Container>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh' }}>
      {/* Header ------------------------------------------------------------ */}
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          transition: 'background-color 300ms, border-color 300ms, backdrop-filter 300ms',
          backgroundColor: scrolled ? 'rgba(10, 14, 21, 0.72)' : 'transparent',
          backdropFilter: scrolled ? 'blur(16px) saturate(150%)' : 'none',
          WebkitBackdropFilter: scrolled ? 'blur(16px) saturate(150%)' : 'none',
          borderBottom: `1px solid ${scrolled ? ink.line : 'transparent'}`
        }}
      >
        <Toolbar sx={{ gap: 1, minHeight: { xs: 60, sm: 68 } }}>
          <motion.div
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, ease }}
            style={{ display: 'flex', alignItems: 'center', gap: 12 }}
          >
            <Box
              component="img"
              src="/favicon.svg"
              alt=""
              sx={{ height: 32, width: 32, borderRadius: '7px', boxShadow: '0 0 0 1px rgba(255,255,255,0.08), 0 6px 18px -6px rgba(91,140,255,0.6)' }}
            />
            <Typography variant="h5" sx={{ letterSpacing: '-0.02em', fontWeight: 650 }}>
              PiHoleVault
            </Typography>
          </motion.div>

          <Box sx={{ flexGrow: 1 }} />

          <MotionBox
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease, delay: 0.1 }}
            sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
          >
            <Button
              size="small"
              variant="text"
              onClick={(e) => setSupportAnchorEl(e.currentTarget)}
              startIcon={<Favorite sx={{ color: '#FF6B8B' }} />}
              sx={{ display: { xs: 'none', sm: 'inline-flex' }, mr: 0.5 }}
            >
              Support
            </Button>
            <Box sx={{ display: { xs: 'inline-flex', sm: 'none' } }}>
              <HeaderIcon tooltip="Support the project" onClick={(e) => setSupportAnchorEl(e.currentTarget)}>
                <Favorite sx={{ color: '#FF6B8B' }} />
              </HeaderIcon>
            </Box>

            <HeaderIcon tooltip="Refresh" onClick={() => loadDashboardData()} disabled={refreshing} spinning={refreshing}>
              <Refresh />
            </HeaderIcon>

            <HeaderIcon tooltip="Settings" onClick={handleSettingsClick}>
              <Settings />
            </HeaderIcon>

            <AnimatePresence>
              {scrolled && !isMobile && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, width: 0 }}
                  animate={{ opacity: 1, scale: 1, width: 'auto' }}
                  exit={{ opacity: 0, scale: 0.9, width: 0 }}
                  transition={{ duration: 0.3, ease }}
                  style={{ overflow: 'hidden', marginLeft: 8 }}
                >
                  <Button
                    variant="contained"
                    size="small"
                    startIcon={runningBackup ? <CircularProgress size={14} color="inherit" /> : <PlayArrow />}
                    onClick={handleRunBackup}
                    disabled={runningBackup}
                    sx={{ whiteSpace: 'nowrap' }}
                  >
                    Run backup
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </MotionBox>

          <Menu
            anchorEl={supportAnchorEl}
            open={Boolean(supportAnchorEl)}
            onClose={() => setSupportAnchorEl(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          >
            <Typography sx={{ ...labelText, px: 1.5, pt: 0.75, pb: 1 }}>
              Enjoying PiHoleVault? Help keep it going.
            </Typography>
            {SUPPORT_LINKS.map((link) => (
              <MenuItem
                key={link.href}
                component="a"
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setSupportAnchorEl(null)}
              >
                <ListItemIcon sx={{ minWidth: 34 }}>{link.icon}</ListItemIcon>
                <Box sx={{ flexGrow: 1 }}>{link.label}</Box>
                <OpenInNew sx={{ fontSize: 14, color: ink.faint, ml: 1.5 }} />
              </MenuItem>
            ))}
          </Menu>

          <Menu
            anchorEl={settingsAnchorEl}
            open={settingsOpen}
            onClose={handleSettingsClose}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          >
            {[
              { tab: 'piholes', label: 'Pi-holes', icon: <Dns fontSize="small" /> },
              { tab: 'backups', label: 'Schedule & retention', icon: <Schedule fontSize="small" /> },
              { tab: 'offsite', label: 'Off-site storage', icon: <CloudUpload fontSize="small" /> },
              { tab: 'encryption', label: 'Encryption', icon: <Lock fontSize="small" /> },
              { tab: 'notifications', label: 'Notifications', icon: <Notifications fontSize="small" /> },
              { tab: 'privacy', label: 'Privacy', icon: <PrivacyTip fontSize="small" /> }
            ].map((item) => (
              <MenuItem key={item.tab} onClick={() => { setSettingsTab(item.tab); handleSettingsClose(); }}>
                <ListItemIcon sx={{ minWidth: 34 }}>{item.icon}</ListItemIcon>
                {item.label}
              </MenuItem>
            ))}
            {onReconfigure && <Divider sx={{ my: 0.5 }} />}
            {onReconfigure && (
              <MenuItem onClick={handleReconfigure}>
                <ListItemIcon sx={{ minWidth: 34, color: ink.warn }}>
                  <Shield fontSize="small" />
                </ListItemIcon>
                Re-run setup wizard
              </MenuItem>
            )}
          </Menu>
        </Toolbar>
      </AppBar>

      <Container
        maxWidth="xl"
        component={motion.main}
        variants={stagger(0.05, 0.07)}
        initial="hidden"
        animate="show"
        sx={{ py: { xs: 3, md: 4 } }}
      >
        {/* Hero: health + run ------------------------------------------------ */}
        <GlowCard sx={{ mb: 3, p: { xs: 3, md: 4 } }}>
          {/* Wash of the current health colour in the corner. */}
          <Box
            aria-hidden
            sx={{
              position: 'absolute',
              top: -120,
              right: -80,
              width: 360,
              height: 360,
              borderRadius: '50%',
              background: `radial-gradient(closest-side, ${health.tone}22, transparent)`,
              transition: 'background 600ms',
              zIndex: -1
            }}
          />
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            alignItems={{ xs: 'flex-start', md: 'center' }}
            justifyContent="space-between"
            spacing={4}
          >
            <Box sx={{ minWidth: 0 }}>
              <Chip
                size="small"
                icon={<Box sx={{ display: 'inline-flex', ml: '8px !important' }}><LiveDot color={health.tone} pulse={health.pulse} size={7} /></Box>}
                label={multi ? `Watching ${instances.filter((i) => i.enabled !== false).length} of ${instances.length} Pi-holes` : config?.pihole?.host ? `Watching ${config.pihole.host}` : 'Not connected'}
                sx={{
                  mb: 2,
                  maxWidth: '100%',
                  backgroundColor: 'rgba(255,255,255,0.04)',
                  border: `1px solid ${ink.line}`,
                  color: ink.muted,
                  '& .MuiChip-label': { ...monoText, fontSize: '0.75rem' }
                }}
              />
              <AnimatePresence mode="wait">
                <motion.div
                  key={health.title}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.35, ease }}
                >
                  <Typography variant="h1" component="h1" sx={{ fontSize: { xs: '1.75rem', md: '2.375rem' }, mb: 1 }}>
                    <GradientText>{health.title}</GradientText>
                  </Typography>
                  <Typography sx={{ color: 'text.secondary', fontSize: '1rem', maxWidth: 560 }}>
                    {health.detail}
                  </Typography>
                </motion.div>
              </AnimatePresence>

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 3.5 }}>
                <Button
                  variant="contained"
                  size="large"
                  onClick={handleRunBackup}
                  disabled={runningBackup}
                  startIcon={runningBackup ? <CircularProgress size={16} color="inherit" /> : <PlayArrow />}
                  sx={{ position: 'relative', overflow: 'hidden', px: 3, py: 1.25 }}
                >
                  {runningBackup && <Shimmer />}
                  {runningBackup ? 'Starting backup…' : 'Run backup now'}
                </Button>
                {latestBackup && (
                  <Button
                    variant="outlined"
                    size="large"
                    startIcon={<Download />}
                    onClick={() => handleDownloadBackup(latestBackup.filename)}
                    sx={{ px: 2.5, py: 1.25 }}
                  >
                    Download latest
                  </Button>
                )}
              </Stack>
            </Box>

            <Stack direction="row" alignItems="center" spacing={3} sx={{ alignSelf: { xs: 'center', md: 'auto' } }}>
              <Ring value={Math.min(1, (backups.length - pinnedCount) / maxBackups)} size={156}>
                <Box>
                  <Box sx={{ fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1 }}>
                    <CountUp value={backups.length} />
                    {retentionMode === 'count' && (
                      <Box component="span" sx={{ fontSize: '1rem', color: ink.faint, fontWeight: 500 }}>
                        /{maxBackups + pinnedCount}
                      </Box>
                    )}
                  </Box>
                  <Typography sx={{ ...labelText, fontSize: '0.75rem', mt: 0.5 }}>restore points</Typography>
                </Box>
              </Ring>
            </Stack>
          </Stack>
        </GlowCard>

        {/* Stat tiles ------------------------------------------------------- */}
        <MotionBox
          variants={stagger(0, 0.07)}
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4, 1fr)' },
            gap: { xs: 1.5, md: 2 },
            mb: 3
          }}
        >
          <StatTile icon={<Inventory2 />} label="Stored backups" note={`${formatBytes(totalSize)} on disk`}>
            <CountUp value={backups.length} />
          </StatTile>
          <StatTile icon={<History />} label="Jobs logged" tone={failedJobs ? ink.bad : ink.accent2}
            note={runningJobs ? `${runningJobs} running` : failedJobs ? `${failedJobs} failed` : 'All healthy'}>
            <CountUp value={jobs.length} />
          </StatTile>
          <StatTile icon={<Dns />} label={multi ? 'Pi-holes' : 'Pi-hole'} tone="#A78BFA"
            note={
              multi
                ? instances.map((i) => i.name || i.host).join(' · ')
                : config?.pihole?.host
                  ? config.pihole.connectionMethod === 'web'
                    ? `web · ${config.pihole.useHttps ? 'https' : 'http'} :${config.pihole.webPort || (config.pihole.useHttps ? 443 : 80)}`
                    : `${config.pihole.connectionMethod || 'ssh'} · ssh :${config.pihole.port || 22}`
                  : null
            }>
            {multi ? (
              <CountUp value={instances.length} />
            ) : (
              <Box component="span" sx={{ ...monoText, fontSize: '1.125rem' }} title={config?.pihole?.host}>
                {config?.pihole?.host || 'Not configured'}
              </Box>
            )}
          </StatTile>
          <StatTile
            icon={<Schedule />}
            label="Schedule"
            tone={config?.schedule?.enabled ? ink.ok : ink.muted}
            note={
              config?.schedule?.cronExpression ? (
                <Box component="span" sx={monoText}>
                  {config.schedule.cronExpression} · {config.schedule.timezone || 'GMT+3'}
                </Box>
              ) : 'No schedule set'
            }
          >
            <Stack direction="row" alignItems="center" spacing={1}>
              {config?.schedule?.enabled && <LiveDot size={8} />}
              <Box component="span" sx={{ fontSize: scheduleText ? '1.125rem' : undefined }}>
                {config?.schedule?.enabled ? scheduleText || 'Enabled' : 'Paused'}
              </Box>
            </Stack>
          </StatTile>
        </MotionBox>

        {/* Main grid -------------------------------------------------------- */}
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} lg={8}>
            <GlowCard sx={{ p: { xs: 2, md: 3 }, height: '100%' }} glow={false}>
              <SectionHeader
                icon={<Inventory2 />}
                title="Restore points"
                meta={`${visibleBackups.length} stored${pinnedCount ? ` · ${pinnedCount} pinned` : ''}`}
              />

              {multi && (
                <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', gap: 1 }}>
                  {[{ id: 'all', name: 'All Pi-holes' }, ...instances].map((i) => {
                    const active = instanceFilter === i.id;
                    return (
                      <Chip
                        key={i.id}
                        label={i.name || i.host}
                        size="small"
                        onClick={() => setInstanceFilter(i.id)}
                        sx={{
                          ml: '0 !important',
                          color: active ? '#06101F' : ink.muted,
                          background: active ? `linear-gradient(135deg, ${ink.accent}, ${ink.accent2})` : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${active ? 'transparent' : ink.line}`,
                          fontWeight: active ? 650 : 500
                        }}
                      />
                    );
                  })}
                </Stack>
              )}

              {visibleBackups.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 8 }}>
                  <motion.div
                    animate={{ y: [0, -6, 0] }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                    style={{ display: 'inline-block' }}
                  >
                    <IconTile size={56} tone={ink.faint}>
                      <CloudOff />
                    </IconTile>
                  </motion.div>
                  <Typography variant="h5" sx={{ mt: 2, mb: 0.5 }}>No backups yet</Typography>
                  <Typography variant="body2">Run a backup to store your first restore point.</Typography>
                </Box>
              ) : (
                <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                  <AnimatePresence initial={true}>
                    {visibleBackups.slice(0, showAll ? undefined : 10).map((backup, index) => {
                      const id = backup.filename;
                      const when = backup.timestamp;
                      const verified = backup.integrity?.ok === true;
                      const broken = backup.integrity && backup.integrity.ok === false;
                      return (
                        <motion.li
                          key={id}
                          layout
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0, transition: { duration: 0.4, ease, delay: 0.15 + Math.min(index, 10) * 0.05 } }}
                          exit={{ opacity: 0, x: -40, height: 0, marginBottom: 0, transition: { duration: 0.3, ease } }}
                          style={{ marginBottom: 8, overflow: 'hidden' }}
                        >
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1.75,
                              px: { xs: 1.5, sm: 2 },
                              py: 1.5,
                              borderRadius: '12px',
                              border: `1px solid ${backup.pinned ? 'rgba(245,180,81,0.3)' : ink.line}`,
                              backgroundColor: backup.pinned ? 'rgba(245,180,81,0.035)' : 'rgba(255,255,255,0.015)',
                              transition: 'background-color 200ms, border-color 200ms, transform 200ms',
                              '&:hover': {
                                backgroundColor: 'rgba(91,140,255,0.06)',
                                borderColor: 'rgba(91,140,255,0.28)',
                                transform: 'translateX(2px)'
                              },
                              '&:hover .row-actions': { opacity: 1 }
                            }}
                          >
                            <Tooltip
                              title={
                                broken
                                  ? `Failed verification: ${backup.integrity.error}`
                                  : verified
                                    ? `Verified ${relativeTime(backup.integrity.checkedAt) || ''}: pihole.toml and gravity.db intact`
                                    : 'Not verified yet: click to check'
                              }
                            >
                              <Box
                                component="button"
                                onClick={() => handleVerify(backup)}
                                aria-label="Verify backup"
                                sx={{
                                  all: 'unset',
                                  cursor: 'pointer',
                                  display: 'grid',
                                  placeItems: 'center',
                                  width: 36,
                                  height: 36,
                                  borderRadius: '10px',
                                  flexShrink: 0,
                                  backgroundColor: `${broken ? ink.bad : verified ? ink.ok : ink.faint}14`,
                                  '&:focus-visible': { outline: `2px solid ${ink.accent}` }
                                }}
                              >
                                {broken ? (
                                  <GppBad sx={{ fontSize: 18, color: ink.bad }} />
                                ) : verified ? (
                                  <VerifiedUser sx={{ fontSize: 18, color: ink.ok }} />
                                ) : (
                                  <CheckCircle sx={{ fontSize: 18, color: ink.faint }} />
                                )}
                              </Box>
                            </Tooltip>

                            <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                              <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0 }}>
                                <Tooltip title={when ? formatDate(when) : ''}>
                                  <Typography sx={{ fontSize: '0.875rem', fontWeight: 550, whiteSpace: 'nowrap', color: ink.text }}>
                                    {relativeTime(when) || '—'}
                                  </Typography>
                                </Tooltip>
                                {multi && (
                                  <Chip
                                    label={instanceName(backup.instanceId)}
                                    size="small"
                                    sx={{ height: 20, fontSize: '0.6875rem', color: '#C4B5FD', backgroundColor: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.25)' }}
                                  />
                                )}
                                {index === 0 && instanceFilter === 'all' && (
                                  <Chip
                                    label="Latest"
                                    size="small"
                                    sx={{ height: 20, fontSize: '0.6875rem', color: ink.accent2, backgroundColor: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.25)' }}
                                  />
                                )}
                                {backup.encrypted && (
                                  <Tooltip title="Encrypted (AES-256-GCM)">
                                    <Lock sx={{ fontSize: 15, color: ink.muted }} />
                                  </Tooltip>
                                )}
                                {backup.offsite?.status === 'uploaded' && (
                                  <Tooltip title={`Off-site copy at ${backup.offsite.target}`}>
                                    <CloudDone sx={{ fontSize: 16, color: ink.accent2 }} />
                                  </Tooltip>
                                )}
                                {backup.offsite?.status === 'failed' && (
                                  <Tooltip title={`Off-site upload failed: ${backup.offsite.error}`}>
                                    <CloudOff sx={{ fontSize: 16, color: ink.warn }} />
                                  </Tooltip>
                                )}
                              </Stack>
                              <Stack direction="row" spacing={1.5} sx={{ mt: 0.25, minWidth: 0 }}>
                                <Typography
                                  variant="caption"
                                  sx={{ ...monoText, color: ink.faint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                  title={backup.filename}
                                >
                                  {backup.note || backup.filename}
                                </Typography>
                                {backup.size ? (
                                  <Typography variant="caption" sx={{ ...monoText, color: ink.faint, whiteSpace: 'nowrap' }}>
                                    {formatBytes(backup.size)}
                                  </Typography>
                                ) : null}
                              </Stack>
                            </Box>

                            <Stack
                              direction="row"
                              spacing={0.25}
                              className="row-actions"
                              sx={{ opacity: { xs: 1, md: 0.55 }, transition: 'opacity 200ms' }}
                            >
                              <Tooltip title={backup.pinned ? 'Unpin' : 'Pin: never delete'}>
                                <IconButton size="small" aria-label={backup.pinned ? 'Unpin' : 'Pin'} onClick={() => handlePin(backup)} sx={{ color: backup.pinned ? ink.warn : undefined, '&:hover': { color: ink.warn } }}>
                                  {backup.pinned ? <PushPin fontSize="small" /> : <PushPinOutlined fontSize="small" />}
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Compare with another backup">
                                <IconButton size="small" aria-label="Compare" onClick={() => setDiffTarget(backup)} sx={{ display: { xs: 'none', sm: 'inline-flex' }, '&:hover': { color: ink.accent2 } }}>
                                  <CompareArrows fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Restore">
                                <span>
                                  <IconButton size="small" aria-label="Restore" onClick={() => setRestoreTarget(backup)} disabled={broken} sx={{ '&:hover': { color: ink.warn } }}>
                                    <SettingsBackupRestore fontSize="small" />
                                  </IconButton>
                                </span>
                              </Tooltip>
                              <Tooltip title="Download">
                                <IconButton
                                  size="small"
                                  onClick={() => handleDownloadBackup(backup.filename)}
                                  sx={{ '&:hover': { color: ink.accent } }}
                                >
                                  <Download fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Delete">
                                <IconButton
                                  size="small"
                                  onClick={() => setDeleteTarget(backup)}
                                  sx={{ '&:hover': { color: ink.bad, backgroundColor: 'rgba(242,112,106,0.1)' } }}
                                >
                                  <DeleteOutline fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </Stack>
                          </Box>
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                  {visibleBackups.length > 10 && (
                    <Button size="small" onClick={() => setShowAll(!showAll)} sx={{ mt: 0.5 }}>
                      {showAll ? 'Show fewer' : `Show all ${visibleBackups.length}`}
                    </Button>
                  )}
                </Box>
              )}
            </GlowCard>
          </Grid>

          <Grid item xs={12} lg={4}>
            <Stack spacing={3} sx={{ height: '100%' }}>
              <GlowCard sx={{ p: { xs: 2, md: 3 } }}>
                <SectionHeader icon={<FolderOpen />} title="Storage" tone={ink.accent2} />
                <InfoRow label="Folder" value={config?.runtime?.backupDir || '/app/backups'} mono />
                <Divider />
                <InfoRow
                  label="Retention"
                  value={retentionMode === 'gfs'
                    ? `${keepLast} + ${retention.daily ?? 7}d / ${retention.weekly ?? 4}w / ${retention.monthly ?? 6}m`
                    : `Last ${keepLast}${multi ? ' per Pi-hole' : ''}`}
                />
                <Divider />
                <InfoRow
                  label="Off-site"
                  value={
                    <Box component="button" onClick={() => setSettingsTab('offsite')} sx={{ all: 'unset', cursor: 'pointer', color: config?.offsite?.enabled ? ink.accent2 : ink.faint }}>
                      {config?.offsite?.enabled ? (config.offsite.type === 'webdav' ? 'WebDAV' : `S3 · ${config.offsite.s3?.bucket || '?'}`) : 'Off · set up'}
                    </Box>
                  }
                />
                <Divider />
                <InfoRow
                  label="Encryption"
                  value={
                    <Box component="button" onClick={() => setSettingsTab('encryption')} sx={{ all: 'unset', cursor: 'pointer', color: config?.encryption?.enabled ? ink.ok : ink.faint }}>
                      {config?.encryption?.enabled ? 'AES-256-GCM' : 'Off · set up'}
                    </Box>
                  }
                />
                <Divider />
                <InfoRow label="Used" value={formatBytes(totalSize)} mono />
                <Box sx={{ mt: 1.5, height: 6, borderRadius: 999, backgroundColor: ink.line, overflow: 'hidden' }}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, ((backups.length - pinnedCount) / maxBackups) * 100)}%` }}
                    transition={{ duration: 1.2, ease, delay: 0.4 }}
                    style={{ height: '100%', borderRadius: 999, background: `linear-gradient(90deg, ${ink.accent}, ${ink.accent2})` }}
                  />
                </Box>
                <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>
                  {retentionMode === 'gfs'
                    ? 'Older backups thin out to one per day, week and month.'
                    : `${Math.max(0, maxBackups - (backups.length - pinnedCount))} slots left before the oldest is rotated out.`}
                  {pinnedCount ? ` ${pinnedCount} pinned ${pinnedCount === 1 ? 'backup is' : 'backups are'} kept regardless.` : ''}
                </Typography>
              </GlowCard>

              <GlowCard sx={{ p: { xs: 2, md: 3 }, flexGrow: 1 }}>
                <SectionHeader icon={<History />} title="Activity" tone="#A78BFA" meta={jobs.length ? `${jobs.length} ${jobs.length === 1 ? 'job' : 'jobs'}` : null} />
                {jobs.length === 0 ? (
                  <Box sx={{ textAlign: 'center', py: 3 }}>
                    <Typography variant="body2">No jobs yet</Typography>
                  </Box>
                ) : (
                  <Box sx={{ position: 'relative', pl: 3 }}>
                    {/* Timeline spine draws itself in. */}
                    <motion.div
                      initial={{ scaleY: 0 }}
                      animate={{ scaleY: 1 }}
                      transition={{ duration: 0.8, ease, delay: 0.3 }}
                      style={{
                        position: 'absolute',
                        left: 7,
                        top: 8,
                        bottom: 8,
                        width: 2,
                        transformOrigin: 'top',
                        background: `linear-gradient(${ink.lineStrong}, transparent)`
                      }}
                    />
                    {jobs.slice(0, 6).map((job, index) => {
                      const state = normaliseStatus(job.status);
                      return (
                        <motion.div
                          key={job.id || index}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.4, ease, delay: 0.35 + index * 0.07 }}
                          style={{ position: 'relative', paddingBottom: 14 }}
                        >
                          <Box sx={{ position: 'absolute', left: -21, top: 5 }}>
                            <LiveDot color={STATUS[state].color} pulse={state === 'running'} size={10} />
                          </Box>
                          <Stack direction="row" alignItems="baseline" justifyContent="space-between" spacing={1}>
                            <Typography sx={{ fontSize: '0.875rem', fontWeight: 550, color: STATUS[state].color }}>
                              {job.type === 'restore'
                                ? { ok: 'Restored', running: 'Restoring', failed: 'Restore failed' }[state]
                                : STATUS[state].label}
                              {multi && job.instanceName && (
                                <Box component="span" sx={{ color: ink.faint, fontWeight: 500 }}> · {job.instanceName}</Box>
                              )}
                            </Typography>
                            <Tooltip title={formatDate(job.timestamp || job.createdAt)}>
                              <Typography variant="caption" sx={{ whiteSpace: 'nowrap' }}>
                                {relativeTime(job.timestamp || job.createdAt)}
                              </Typography>
                            </Tooltip>
                          </Stack>
                          <Typography
                            variant="caption"
                            sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', color: ink.faint }}
                            title={job.message}
                          >
                            {job.message || job.type || 'Backup job'}
                          </Typography>
                        </motion.div>
                      );
                    })}
                  </Box>
                )}
              </GlowCard>
            </Stack>
          </Grid>
        </Grid>

        {config?.analytics?.enabled && (
          <MotionBox variants={rise}>
            <GlobalAnalytics />
          </MotionBox>
        )}
      </Container>

      {/* Delete confirmation ---------------------------------------------- */}
      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <IconTile size={36} tone={ink.bad}><WarningAmber /></IconTile>
            <span>Delete this backup?</span>
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1.5 }}>
            {deleteTarget?.pinned ? 'This backup is pinned. ' : ''}
            It will be removed from disk{config?.offsite?.enabled ? ' and from off-site storage' : ''}. This can't be undone.
          </Typography>
          <Box sx={{ p: 1.5, borderRadius: '10px', border: `1px solid ${ink.line}`, backgroundColor: 'rgba(0,0,0,0.25)', ...monoText, fontSize: '0.8125rem', wordBreak: 'break-all' }}>
            {deleteTarget?.filename || deleteTarget?.id}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            startIcon={<DeleteOutline />}
            onClick={() => {
              const target = deleteTarget;
              setDeleteTarget(null);
              handleDeleteBackup(target.filename);
            }}
            sx={{ background: ink.bad, color: '#1A0705', '&:hover': { background: '#FF8A84' } }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <SettingsDialog
        open={Boolean(settingsTab)}
        initialTab={settingsTab || 'piholes'}
        config={config}
        onClose={() => setSettingsTab(null)}
        onSaved={(next) => setConfig(next)}
      />

      <RestoreDialog
        backup={restoreTarget}
        instances={instances}
        onClose={() => setRestoreTarget(null)}
        onDone={() => loadDashboardData()}
      />

      <DiffDialog backup={diffTarget} backups={backups} onClose={() => setDiffTarget(null)} />
    </Box>
  );
};

export default Dashboard;
