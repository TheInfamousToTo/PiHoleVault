import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme
} from '@mui/material';
import {
  Add,
  Close,
  CloudUpload,
  DeleteOutline,
  Dns,
  Lock,
  Notifications,
  PrivacyTip,
  Schedule,
  Settings,
  Wifi
} from '@mui/icons-material';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'react-toastify';
import api from '../services/api';
import { IconTile } from './ui';
import { ink, labelText, monoText, ease } from '../theme';
import { describeCron } from '../utils/cron';

const REDACTED = '***REDACTED***';

const TIMEZONES = Array.from({ length: 25 }, (_, i) => {
  const offset = i - 12;
  return `GMT${offset < 0 ? '' : '+'}${offset}`;
});

const TABS = [
  { key: 'piholes', label: 'Pi-holes', icon: <Dns fontSize="small" /> },
  { key: 'backups', label: 'Schedule & retention', icon: <Schedule fontSize="small" /> },
  { key: 'offsite', label: 'Off-site', icon: <CloudUpload fontSize="small" /> },
  { key: 'encryption', label: 'Encryption', icon: <Lock fontSize="small" /> },
  { key: 'notifications', label: 'Notifications', icon: <Notifications fontSize="small" /> },
  { key: 'privacy', label: 'Privacy', icon: <PrivacyTip fontSize="small" /> }
];

// Field lists per notification channel type. `secret` fields come back from
// the server as REDACTED and are only sent again when the user retypes them.
const CHANNEL_TYPES = {
  discord: {
    label: 'Discord',
    fields: [{ key: 'webhookUrl', label: 'Webhook URL', secret: true, placeholder: 'https://discord.com/api/webhooks/…', wide: true }]
  },
  ntfy: {
    label: 'ntfy',
    fields: [
      { key: 'server', label: 'Server', placeholder: 'https://ntfy.sh' },
      { key: 'topic', label: 'Topic', placeholder: 'pihole-backups' },
      { key: 'token', label: 'Access token (optional)', secret: true },
      { key: 'username', label: 'Username (optional)' },
      { key: 'password', label: 'Password (optional)', secret: true }
    ]
  },
  gotify: {
    label: 'Gotify',
    fields: [
      { key: 'server', label: 'Server', placeholder: 'https://gotify.example.com' },
      { key: 'appToken', label: 'Application token', secret: true }
    ]
  },
  telegram: {
    label: 'Telegram',
    fields: [
      { key: 'botToken', label: 'Bot token', secret: true, placeholder: '123456:ABC…' },
      { key: 'chatId', label: 'Chat ID', placeholder: '-1001234567890 or @channel' }
    ]
  },
  webhook: {
    label: 'Webhook (JSON POST)',
    fields: [{ key: 'webhookUrl', label: 'URL', secret: true, placeholder: 'https://n8n.example.com/webhook/…', wide: true }]
  },
  email: {
    label: 'Email (SMTP)',
    fields: [
      { key: 'host', label: 'SMTP host', placeholder: 'smtp.example.com' },
      { key: 'port', label: 'Port', placeholder: '587', type: 'number' },
      { key: 'username', label: 'Username' },
      { key: 'password', label: 'Password', secret: true },
      { key: 'from', label: 'From', placeholder: 'piholevault@example.com' },
      { key: 'to', label: 'To', placeholder: 'you@example.com' }
    ]
  }
};

const clone = (value) => JSON.parse(JSON.stringify(value || {}));

const randomId = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 8)}`;

const errorText = (error) => error.response?.data?.error || error.response?.data?.message || error.message;

// --- Small building blocks ---------------------------------------------------

/**
 * A password-type field that understands the server's REDACTED placeholder:
 * a saved secret shows as dots, typing replaces it, and clearing the field
 * puts the saved one back rather than wiping it.
 */
const SecretField = ({ label, value, onChange, helperText, ...rest }) => {
  const saved = value === REDACTED;
  return (
    <TextField
      {...rest}
      label={label}
      type="password"
      autoComplete="new-password"
      value={saved ? '' : value || ''}
      placeholder={saved ? '•••••••• saved' : rest.placeholder}
      InputLabelProps={saved ? { shrink: true } : undefined}
      helperText={saved ? 'Saved. Type to replace it.' : helperText}
      onChange={(e) => onChange(e.target.value === '' && saved ? REDACTED : e.target.value)}
      fullWidth
    />
  );
};

const Section = ({ title, children, action }) => (
  <Box sx={{ mb: 3 }}>
    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
      <Typography sx={labelText}>{title}</Typography>
      {action}
    </Stack>
    {children}
  </Box>
);

const Card = ({ children, sx }) => (
  <Box
    sx={{
      p: 2,
      borderRadius: '12px',
      border: `1px solid ${ink.line}`,
      backgroundColor: 'rgba(0,0,0,0.18)',
      ...sx
    }}
  >
    {children}
  </Box>
);

const Reveal = ({ when, children }) => (
  <AnimatePresence initial={false}>
    {when && (
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.3, ease }}
        style={{ overflow: 'hidden' }}
      >
        {children}
      </motion.div>
    )}
  </AnimatePresence>
);

// --- Tabs ---------------------------------------------------------------------

const InstanceCard = ({ instance, index, onChange, onRemove, onTest, testing }) => {
  const set = (key, value) => onChange({ ...instance, [key]: value });
  const method = instance.connectionMethod || 'ssh';
  const usesWeb = method === 'web' || method === 'hybrid';
  const usesSsh = method === 'ssh' || method === 'hybrid';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.3, ease }}
      style={{ marginBottom: 12 }}
    >
      <Card sx={{ opacity: instance.enabled === false ? 0.6 : 1 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
          <Typography sx={{ ...monoText, fontSize: '0.75rem', color: ink.faint, flexGrow: 1 }}>
            {index === 0 ? 'primary' : instance.id || 'new'}
          </Typography>
          <FormControlLabel
            sx={{ mr: 0 }}
            control={<Switch size="small" checked={instance.enabled !== false} onChange={(e) => set('enabled', e.target.checked)} />}
            label={<Typography variant="body2">Back up</Typography>}
          />
          <Button
            size="small"
            variant="outlined"
            onClick={onTest}
            disabled={testing || !instance.host}
            startIcon={testing ? <CircularProgress size={14} /> : <Wifi fontSize="small" />}
          >
            Test
          </Button>
          {index > 0 && (
            <Tooltip title="Remove this Pi-hole">
              <IconButton size="small" onClick={onRemove} sx={{ '&:hover': { color: ink.bad } }}>
                <DeleteOutline fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Stack>

        <Grid container spacing={2}>
          <Grid item xs={12} sm={4}>
            <TextField label="Name" value={instance.name || ''} onChange={(e) => set('name', e.target.value)} fullWidth />
          </Grid>
          <Grid item xs={12} sm={5}>
            <TextField
              label="Host or admin URL"
              value={instance.host || ''}
              onChange={(e) => set('host', e.target.value)}
              placeholder="192.168.1.2 or https://pi.hole/admin/"
              InputProps={{ sx: monoText }}
              fullWidth
            />
          </Grid>
          <Grid item xs={12} sm={3}>
            <FormControl fullWidth>
              <InputLabel>Method</InputLabel>
              <Select label="Method" value={method} onChange={(e) => set('connectionMethod', e.target.value)}>
                <MenuItem value="web">Web / API</MenuItem>
                <MenuItem value="hybrid">Hybrid</MenuItem>
                <MenuItem value="ssh">SSH only</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          {usesWeb && (
            <>
              <Grid item xs={4} sm={2}>
                <TextField
                  label="Web port"
                  type="number"
                  value={instance.webPort || 80}
                  onChange={(e) => set('webPort', parseInt(e.target.value, 10) || '')}
                  fullWidth
                />
              </Grid>
              <Grid item xs={8} sm={4}>
                <SecretField
                  label="Web / app password"
                  value={instance.webPassword}
                  onChange={(v) => set('webPassword', v)}
                  helperText="With 2FA on, use an app password"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <Stack direction="row" sx={{ height: '100%', alignItems: 'center', flexWrap: 'wrap' }}>
                  <FormControlLabel
                    control={<Switch checked={Boolean(instance.useHttps)} onChange={(e) => set('useHttps', e.target.checked)} />}
                    label="HTTPS"
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        checked={Boolean(instance.allowInsecureTls)}
                        disabled={!instance.useHttps}
                        onChange={(e) => set('allowInsecureTls', e.target.checked)}
                      />
                    }
                    label="Self-signed cert"
                  />
                </Stack>
              </Grid>
            </>
          )}

          {usesSsh && (
            <>
              <Grid item xs={8} sm={4}>
                <TextField label="SSH user" value={instance.username || ''} onChange={(e) => set('username', e.target.value)} fullWidth />
              </Grid>
              <Grid item xs={4} sm={2}>
                <TextField
                  label="SSH port"
                  type="number"
                  value={instance.port || 22}
                  onChange={(e) => set('port', parseInt(e.target.value, 10) || '')}
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <SecretField
                  label="SSH password"
                  value={instance.password}
                  onChange={(v) => set('password', v)}
                  helperText={index === 0 ? 'Not needed once the wizard deployed its SSH key' : 'Or authorise PiHoleVault’s SSH key on this host'}
                />
              </Grid>
            </>
          )}
        </Grid>
      </Card>
    </motion.div>
  );
};

const PiholesTab = ({ draft, setDraft }) => {
  const [testing, setTesting] = useState(null);
  const instances = draft.instances || [];

  const update = (index, next) => {
    const list = [...instances];
    list[index] = next;
    setDraft({ ...draft, instances: list });
  };

  const add = () => {
    setDraft({
      ...draft,
      instances: [
        ...instances,
        { name: '', host: '', connectionMethod: 'web', webPort: 80, useHttps: false, allowInsecureTls: false, webPassword: '', enabled: true }
      ]
    });
  };

  const remove = (index) => setDraft({ ...draft, instances: instances.filter((_, i) => i !== index) });

  const test = async (instance, index) => {
    setTesting(index);
    try {
      const { data } = await api.post('/pihole/test-connection', { ...instance, instanceId: instance.id });
      if (data.success) toast.success(`${instance.name || instance.host}: ${data.message}`);
      else toast.error(`${instance.name || instance.host}: ${data.error}`);
    } catch (error) {
      toast.error(`Connection test failed: ${errorText(error)}`);
    } finally {
      setTesting(null);
    }
  };

  return (
    <>
      <Typography variant="body2" sx={{ mb: 2 }}>
        Every enabled Pi-hole is backed up on each run. The first one is the primary; the setup wizard manages its SSH key.
      </Typography>
      <AnimatePresence initial={false}>
        {instances.map((instance, index) => (
          <InstanceCard
            key={instance.id || `new-${index}`}
            instance={instance}
            index={index}
            onChange={(next) => update(index, next)}
            onRemove={() => remove(index)}
            onTest={() => test(instance, index)}
            testing={testing === index}
          />
        ))}
      </AnimatePresence>
      <Button startIcon={<Add />} onClick={add} disabled={instances.length >= 20}>
        Add a Pi-hole
      </Button>
    </>
  );
};

const BackupsTab = ({ draft, setDraft }) => {
  const backup = draft.backup || {};
  const schedule = draft.schedule || {};
  const retention = backup.retention || {};
  const mode = retention.mode || 'count';
  const keepLast = retention.keepLast || backup.maxBackups || 10;

  const setBackup = (patch) => setDraft({ ...draft, backup: { ...backup, ...patch } });
  const setRetention = (patch) => setBackup({ retention: { mode, keepLast, ...retention, ...patch } });
  const setSchedule = (patch) => setDraft({ ...draft, schedule: { ...schedule, ...patch } });

  return (
    <>
      <Section
        title="Schedule"
        action={
          <FormControlLabel
            sx={{ mr: 0 }}
            control={<Switch checked={schedule.enabled !== false} onChange={(e) => setSchedule({ enabled: e.target.checked })} />}
            label={<Typography variant="body2">Run automatically</Typography>}
          />
        }
      >
        <Grid container spacing={2}>
          <Grid item xs={12} md={8}>
            <TextField
              label="Cron expression"
              value={schedule.cronExpression || ''}
              onChange={(e) => setSchedule({ cronExpression: e.target.value })}
              fullWidth
              InputProps={{ sx: monoText }}
              helperText={describeCron(schedule.cronExpression) || 'Example: 0 3 * * * (daily at 03:00)'}
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <FormControl fullWidth>
              <InputLabel>Timezone</InputLabel>
              <Select label="Timezone" value={schedule.timezone || 'GMT+0'} onChange={(e) => setSchedule({ timezone: e.target.value })}>
                {TIMEZONES.map((tz) => <MenuItem key={tz} value={tz}>{tz}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Section>

      <Section title="Retention">
        <ToggleButtonGroup
          exclusive
          size="small"
          value={mode}
          onChange={(_, value) => value && setRetention({ mode: value })}
          sx={{ mb: 2 }}
        >
          <ToggleButton value="count">Keep the last N</ToggleButton>
          <ToggleButton value="gfs">Daily / weekly / monthly</ToggleButton>
        </ToggleButtonGroup>

        <Grid container spacing={2}>
          <Grid item xs={6} md={3}>
            <TextField
              label={mode === 'gfs' ? 'Always keep newest' : 'Backups to keep'}
              type="number"
              value={keepLast}
              inputProps={{ min: 1 }}
              onChange={(e) => {
                const n = Math.max(1, parseInt(e.target.value, 10) || 1);
                setBackup({ maxBackups: n, retention: { ...retention, mode, keepLast: n } });
              }}
              fullWidth
            />
          </Grid>
          {mode === 'gfs' && [['daily', 'Daily', 7], ['weekly', 'Weekly', 4], ['monthly', 'Monthly', 6]].map(([key, label, def]) => (
            <Grid item xs={6} md={3} key={key}>
              <TextField
                label={label}
                type="number"
                value={retention[key] ?? def}
                inputProps={{ min: 0 }}
                onChange={(e) => setRetention({ [key]: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                fullWidth
              />
            </Grid>
          ))}
        </Grid>
        <Typography variant="caption" sx={{ display: 'block', mt: 1.5 }}>
          {mode === 'gfs'
            ? `Per Pi-hole: the newest ${keepLast}, plus the last backup of each of the past ${retention.daily ?? 7} days, ${retention.weekly ?? 4} weeks and ${retention.monthly ?? 6} months.`
            : `Per Pi-hole: the newest ${keepLast} backups.`}{' '}
          Pinned backups are never deleted.
        </Typography>
      </Section>

      <Section title="Local folder">
        <Card>
          <Typography sx={{ ...monoText, color: ink.text, fontSize: '0.875rem', wordBreak: 'break-all' }}>
            {draft.runtime?.backupDir || '/app/backups'}
          </Typography>
          <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
            Set by the backups volume in docker-compose. To keep backups on an SMB or NFS share, mount the share there.
          </Typography>
        </Card>
      </Section>
    </>
  );
};

const OffsiteTab = ({ draft, setDraft, saveAnd }) => {
  const offsite = draft.offsite || {};
  const type = offsite.type || 's3';
  const s3 = offsite.s3 || {};
  const dav = offsite.webdav || {};
  const [testing, setTesting] = useState(false);

  const set = (patch) => setDraft({ ...draft, offsite: { type, ...offsite, ...patch } });
  const setS3 = (key, value) => set({ s3: { forcePathStyle: true, ...s3, [key]: value } });
  const setDav = (key, value) => set({ webdav: { ...dav, [key]: value } });

  const test = () => saveAnd(async () => {
    setTesting(true);
    try {
      const { data } = await api.post('/integrations/storage/test', {}, { timeout: 60000 });
      data.success ? toast.success(data.message) : toast.error(data.error);
    } finally {
      setTesting(false);
    }
  });

  return (
    <>
      <Card sx={{ mb: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
        <Box>
          <Typography sx={{ fontWeight: 600, color: ink.text }}>Copy every backup off this machine</Typography>
          <Typography variant="body2">If the disk dies, the backups survive. Retention deletes the off-site copy too.</Typography>
        </Box>
        <Switch checked={offsite.enabled === true} onChange={(e) => set({ enabled: e.target.checked })} />
      </Card>

      <Reveal when={offsite.enabled === true}>
        <ToggleButtonGroup exclusive size="small" value={type} onChange={(_, v) => v && set({ type: v })} sx={{ mb: 2 }}>
          <ToggleButton value="s3">S3-compatible</ToggleButton>
          <ToggleButton value="webdav">WebDAV</ToggleButton>
        </ToggleButtonGroup>

        {type === 's3' ? (
          <Grid container spacing={2}>
            <Grid item xs={12} md={8}>
              <TextField
                label="Endpoint"
                value={s3.endpoint || ''}
                onChange={(e) => setS3('endpoint', e.target.value)}
                placeholder="https://s3.us-west-002.backblazeb2.com"
                helperText="Leave empty for AWS. MinIO, Garage, R2, B2, Wasabi: their S3 URL."
                InputProps={{ sx: monoText }}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField label="Region" value={s3.region || ''} onChange={(e) => setS3('region', e.target.value)} placeholder="us-east-1" fullWidth />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField label="Bucket" value={s3.bucket || ''} onChange={(e) => setS3('bucket', e.target.value)} fullWidth />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField label="Prefix (folder)" value={s3.prefix || ''} onChange={(e) => setS3('prefix', e.target.value)} placeholder="pihole/" fullWidth />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField label="Access key ID" value={s3.accessKeyId || ''} onChange={(e) => setS3('accessKeyId', e.target.value)} fullWidth />
            </Grid>
            <Grid item xs={12} md={6}>
              <SecretField label="Secret access key" value={s3.secretAccessKey} onChange={(v) => setS3('secretAccessKey', v)} />
            </Grid>
            <Grid item xs={12}>
              <FormControlLabel
                control={<Switch checked={s3.forcePathStyle !== false} onChange={(e) => setS3('forcePathStyle', e.target.checked)} />}
                label="Path-style URLs (needed by MinIO, Garage and most self-hosted stores)"
              />
            </Grid>
          </Grid>
        ) : (
          <Grid container spacing={2}>
            <Grid item xs={12} md={8}>
              <TextField
                label="Server URL"
                value={dav.url || ''}
                onChange={(e) => setDav('url', e.target.value)}
                placeholder="https://cloud.example.com/remote.php/dav/files/me"
                InputProps={{ sx: monoText }}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField label="Folder" value={dav.path || ''} onChange={(e) => setDav('path', e.target.value)} placeholder="Backups/pihole" fullWidth />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField label="Username" value={dav.username || ''} onChange={(e) => setDav('username', e.target.value)} fullWidth />
            </Grid>
            <Grid item xs={12} md={6}>
              <SecretField label="Password / app password" value={dav.password} onChange={(v) => setDav('password', v)} />
            </Grid>
          </Grid>
        )}

        <Button
          variant="outlined"
          sx={{ mt: 2 }}
          onClick={test}
          disabled={testing}
          startIcon={testing ? <CircularProgress size={14} /> : <CloudUpload fontSize="small" />}
        >
          Save and test
        </Button>
      </Reveal>
    </>
  );
};

const EncryptionTab = ({ draft, setDraft, savedEnabled, confirm, setConfirm }) => {
  const encryption = draft.encryption || {};
  const set = (patch) => setDraft({ ...draft, encryption: { ...encryption, ...patch } });
  const typed = encryption.passphrase && encryption.passphrase !== REDACTED;

  return (
    <>
      <Card sx={{ mb: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
        <Box>
          <Typography sx={{ fontWeight: 600, color: ink.text }}>Encrypt new backups</Typography>
          <Typography variant="body2">
            AES-256-GCM with a key derived from your passphrase. Worth it when backups leave this machine: a Teleporter
            archive holds your password hash, DHCP leases and client list.
          </Typography>
        </Box>
        <Switch checked={encryption.enabled === true} onChange={(e) => set({ enabled: e.target.checked })} />
      </Card>

      <Reveal when={encryption.enabled === true}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <SecretField
              label="Passphrase"
              value={encryption.passphrase}
              onChange={(v) => set({ passphrase: v })}
              helperText="At least 8 characters"
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              label="Repeat passphrase"
              type="password"
              autoComplete="new-password"
              value={confirm}
              disabled={!typed}
              onChange={(e) => setConfirm(e.target.value)}
              error={Boolean(typed && confirm && confirm !== encryption.passphrase)}
              helperText={typed && confirm && confirm !== encryption.passphrase ? 'Does not match' : ' '}
              fullWidth
            />
          </Grid>
        </Grid>
        <Alert severity="warning" sx={{ mt: 1 }}>
          Keep the passphrase somewhere safe. Without it, encrypted backups cannot be opened by anyone, including you.
          {savedEnabled && typed && ' Changing it only affects new backups; older ones still need the old passphrase.'}
        </Alert>
      </Reveal>

      {!encryption.enabled && savedEnabled && (
        <Alert severity="info">Existing encrypted backups stay encrypted and still need the saved passphrase to restore.</Alert>
      )}

      <Typography variant="caption" sx={{ display: 'block', mt: 2 }}>
        Downloads are decrypted for you, so the file you get imports straight into Pi-hole’s Teleporter page.
      </Typography>
    </>
  );
};

EncryptionTab.isValid = (draft, confirm) => {
  const enc = draft.encryption || {};
  if (!enc.enabled) return null;
  if (!enc.passphrase) return 'Set an encryption passphrase, or turn encryption off';
  if (enc.passphrase === REDACTED) return null;
  if (enc.passphrase.length < 8) return 'The passphrase needs at least 8 characters';
  if (confirm !== enc.passphrase) return 'Repeat the passphrase exactly to confirm it';
  return null;
};

const ChannelCard = ({ channel, onChange, onRemove, onTest, testing }) => {
  const spec = CHANNEL_TYPES[channel.type] || { label: channel.type, fields: [] };
  const set = (key, value) => onChange({ ...channel, [key]: value });

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.3, ease }}
      style={{ marginBottom: 12 }}
    >
      <Card sx={{ opacity: channel.enabled === false ? 0.6 : 1 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
          <Typography sx={{ fontWeight: 600, color: ink.text, flexGrow: 1 }}>{spec.label}</Typography>
          <Switch size="small" checked={channel.enabled !== false} onChange={(e) => set('enabled', e.target.checked)} inputProps={{ 'aria-label': 'Enabled' }} />
          <Button
            size="small"
            variant="outlined"
            onClick={onTest}
            disabled={testing}
            startIcon={testing ? <CircularProgress size={14} /> : <Notifications fontSize="small" />}
          >
            Save and test
          </Button>
          <Tooltip title="Remove">
            <IconButton size="small" onClick={onRemove} sx={{ '&:hover': { color: ink.bad } }}>
              <DeleteOutline fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
        <Grid container spacing={2}>
          {spec.fields.map((field) => (
            <Grid item xs={12} sm={field.wide ? 12 : 6} key={field.key}>
              {field.secret ? (
                <SecretField label={field.label} value={channel[field.key]} placeholder={field.placeholder} onChange={(v) => set(field.key, v)} />
              ) : (
                <TextField
                  label={field.label}
                  type={field.type || 'text'}
                  value={channel[field.key] ?? ''}
                  placeholder={field.placeholder}
                  onChange={(e) => set(field.key, e.target.value)}
                  fullWidth
                />
              )}
            </Grid>
          ))}
          {channel.type === 'email' && (
            <Grid item xs={12}>
              <FormControlLabel
                control={<Switch checked={channel.secure === true} onChange={(e) => set('secure', e.target.checked)} />}
                label="Implicit TLS (port 465). Off uses STARTTLS when the server offers it."
              />
            </Grid>
          )}
        </Grid>
        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
          <FormControlLabel
            control={<Switch size="small" checked={channel.notifyOnSuccess !== false} onChange={(e) => set('notifyOnSuccess', e.target.checked)} />}
            label={<Typography variant="body2">On success</Typography>}
          />
          <FormControlLabel
            control={<Switch size="small" checked={channel.notifyOnFailure !== false} onChange={(e) => set('notifyOnFailure', e.target.checked)} />}
            label={<Typography variant="body2">On failure</Typography>}
          />
        </Stack>
      </Card>
    </motion.div>
  );
};

const NotificationsTab = ({ draft, setDraft, saveAnd }) => {
  const channels = draft.notifications?.channels || [];
  const [newType, setNewType] = useState('ntfy');
  const [testing, setTesting] = useState(null);

  const setChannels = (list) => setDraft({ ...draft, notifications: { ...(draft.notifications || {}), channels: list } });

  const add = () => {
    const base = { id: randomId(newType), type: newType, name: CHANNEL_TYPES[newType].label, enabled: true, notifyOnSuccess: true, notifyOnFailure: true };
    if (newType === 'ntfy') base.server = 'https://ntfy.sh';
    if (newType === 'email') base.port = 587;
    setChannels([...channels, base]);
  };

  const test = (channel) => saveAnd(async () => {
    setTesting(channel.id);
    try {
      const { data } = await api.post('/integrations/notifications/test', { channelId: channel.id });
      data.success ? toast.success(data.message) : toast.error(`${CHANNEL_TYPES[channel.type]?.label}: ${data.error}`);
    } finally {
      setTesting(null);
    }
  });

  return (
    <>
      <Typography variant="body2" sx={{ mb: 2 }}>
        Each channel hears about successful and failed backups and restores, and about off-site uploads that fail.
      </Typography>
      <AnimatePresence initial={false}>
        {channels.map((channel, index) => (
          <ChannelCard
            key={channel.id}
            channel={channel}
            testing={testing === channel.id}
            onChange={(next) => setChannels(channels.map((c, i) => (i === index ? next : c)))}
            onRemove={() => setChannels(channels.filter((_, i) => i !== index))}
            onTest={() => test(channel)}
          />
        ))}
      </AnimatePresence>
      {channels.length === 0 && (
        <Card sx={{ mb: 2, textAlign: 'center' }}>
          <Typography variant="body2">No channels yet.</Typography>
        </Card>
      )}
      <Stack direction="row" spacing={1.5} alignItems="center">
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>Type</InputLabel>
          <Select label="Type" value={newType} onChange={(e) => setNewType(e.target.value)}>
            {Object.entries(CHANNEL_TYPES).map(([key, spec]) => <MenuItem key={key} value={key}>{spec.label}</MenuItem>)}
          </Select>
        </FormControl>
        <Button startIcon={<Add />} onClick={add}>Add channel</Button>
      </Stack>
    </>
  );
};

const PrivacyTab = ({ draft, setDraft }) => {
  const enabled = draft.analytics?.enabled === true;
  return (
    <>
      <Card sx={{ mb: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
        <Box>
          <Typography sx={{ fontWeight: 600, color: ink.text }}>Share anonymous usage statistics</Typography>
          <Typography variant="body2">Off by default. Helps show the project is used, which keeps it maintained.</Typography>
        </Box>
        <Switch checked={enabled} onChange={(e) => setDraft({ ...draft, analytics: { enabled: e.target.checked } })} />
      </Card>
      <Typography sx={{ ...labelText, mb: 1 }}>When on, after each backup this instance sends</Typography>
      <Box component="ul" sx={{ m: 0, pl: 2.5, color: ink.muted, fontSize: '0.875rem', lineHeight: 1.8 }}>
        <li>a random ID generated for this PiHoleVault install</li>
        <li>whether the backup succeeded</li>
        <li>its size in bytes and how long it took</li>
      </Box>
      <Typography sx={{ ...labelText, mt: 2, mb: 1 }}>It never sends</Typography>
      <Box component="ul" sx={{ m: 0, pl: 2.5, color: ink.muted, fontSize: '0.875rem', lineHeight: 1.8 }}>
        <li>Pi-hole addresses, hostnames, filenames or error messages</li>
        <li>anything from inside the backup</li>
      </Box>
      <Typography variant="caption" sx={{ display: 'block', mt: 2 }}>
        Destination: <Box component="span" sx={monoText}>https://PiHoleVault.satrawi.com</Box>. The community card on the dashboard
        is only shown while sharing is on.
      </Typography>
    </>
  );
};

// --- Dialog -------------------------------------------------------------------

const SettingsDialog = ({ open, onClose, config, onSaved, initialTab = 'piholes' }) => {
  const [tab, setTab] = useState(initialTab);
  const [draft, setDraft] = useState(() => clone(config));
  const [saving, setSaving] = useState(false);
  const [passConfirm, setPassConfirm] = useState('');
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));

  useEffect(() => {
    if (open) {
      setDraft(clone(config));
      setTab(initialTab);
      setPassConfirm('');
    }
    // Only reset when the dialog opens; config changes after a save are
    // applied by save() itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const savedEncryption = config?.encryption?.enabled === true;
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(config), [draft, config]);

  const save = async () => {
    const invalid = EncryptionTab.isValid(draft, passConfirm);
    if (invalid) {
      setTab('encryption');
      throw new Error(invalid);
    }
    const body = clone(draft);
    // The server mirrors instances[0] into `pihole`; sending a stale copy of
    // it alongside would only be overwritten.
    delete body.pihole;
    delete body.message;
    delete body.runtime;
    await api.put('/config', body);
    const { data } = await api.get('/config');
    setDraft(clone(data));
    setPassConfirm('');
    onSaved(data);
    return data;
  };

  const saveAnd = async (action) => {
    setSaving(true);
    try {
      await save();
    } catch (error) {
      toast.error(`Could not save: ${errorText(error)}`);
      setSaving(false);
      return;
    }
    setSaving(false);
    try {
      await action();
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await save();
      toast.success('Settings saved');
      onClose();
    } catch (error) {
      toast.error(`Could not save: ${errorText(error)}`);
    } finally {
      setSaving(false);
    }
  };

  const props = { draft, setDraft, saveAnd };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth fullScreen={fullScreen} PaperProps={{ sx: { minHeight: { sm: 620 } } }}>
      <DialogTitle sx={{ pb: 0 }}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <IconTile size={36}><Settings /></IconTile>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h4">Settings</Typography>
            <Typography variant="caption">Saved settings apply from the next backup</Typography>
          </Box>
          <IconButton onClick={onClose} aria-label="Close"><Close /></IconButton>
        </Stack>
        <Tabs
          value={tab}
          onChange={(_, value) => setTab(value)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ mt: 2, borderBottom: `1px solid ${ink.line}`, '& .MuiTab-root': { minHeight: 44, textTransform: 'none' } }}
        >
          {TABS.map((t) => <Tab key={t.key} value={t.key} label={t.label} icon={t.icon} iconPosition="start" />)}
        </Tabs>
      </DialogTitle>
      <DialogContent sx={{ pt: '20px !important' }}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease }}
          >
            {tab === 'piholes' && <PiholesTab {...props} />}
            {tab === 'backups' && <BackupsTab {...props} />}
            {tab === 'offsite' && <OffsiteTab {...props} />}
            {tab === 'encryption' && <EncryptionTab {...props} savedEnabled={savedEncryption} confirm={passConfirm} setConfirm={setPassConfirm} />}
            {tab === 'notifications' && <NotificationsTab {...props} />}
            {tab === 'privacy' && <PrivacyTab {...props} />}
          </motion.div>
        </AnimatePresence>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Typography variant="caption" sx={{ flexGrow: 1, color: dirty ? ink.warn : ink.faint }}>
          {dirty ? 'Unsaved changes' : 'All changes saved'}
        </Typography>
        <Button onClick={onClose}>Close</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving || !dirty} startIcon={saving ? <CircularProgress size={14} color="inherit" /> : null}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SettingsDialog;
