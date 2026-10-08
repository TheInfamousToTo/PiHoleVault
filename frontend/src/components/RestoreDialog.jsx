import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  Typography
} from '@mui/material';
import { CheckCircle, SettingsBackupRestore } from '@mui/icons-material';
import { AnimatePresence, motion } from 'framer-motion';
import api from '../services/api';
import { IconTile, Shimmer } from './ui';
import { ink, labelText, monoText, ease } from '../theme';

// What a Pi-hole v6 Teleporter import can restore, one switch per part.
const PARTS = [
  { key: 'domains', label: 'Allow and deny lists', detail: 'Exact and regex domains' },
  { key: 'adlists', label: 'Blocklists', detail: 'Subscribed adlist URLs (run gravity afterwards to download them)' },
  { key: 'groups', label: 'Groups', detail: 'Group names and their assignments' },
  { key: 'clients', label: 'Clients', detail: 'Client definitions and their groups' },
  { key: 'settings', label: 'Settings', detail: 'pihole.toml: DNS, DHCP, web interface, password' },
  { key: 'dhcpLeases', label: 'DHCP leases', detail: 'Current leases' }
];

const ALL = Object.fromEntries(PARTS.map((p) => [p.key, true]));

const RestoreDialog = ({ backup, instances = [], onClose, onDone }) => {
  const open = Boolean(backup);
  const [target, setTarget] = useState('primary');
  const [parts, setParts] = useState(ALL);
  const [backupFirst, setBackupFirst] = useState(true);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setTarget(instances.some((i) => i.id === backup.instanceId) ? backup.instanceId : instances[0]?.id || 'primary');
      setParts(ALL);
      setBackupFirst(true);
      setResult(null);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, backup?.filename]);

  const instance = instances.find((i) => i.id === target);
  const viaSsh = (instance?.connectionMethod || 'ssh') === 'ssh';
  const nothing = !viaSsh && !Object.values(parts).some(Boolean);
  const crossRestore = backup && target !== backup.instanceId;

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const { data } = await api.post(
        `/backups/${encodeURIComponent(backup.filename)}/restore`,
        { instanceId: target, parts: viaSsh ? undefined : parts, backupFirst },
        // A safety backup, the import and Pi-hole's restart: allow minutes.
        { timeout: 240000 }
      );
      if (data.success) {
        setResult(data);
        onDone?.(data);
      } else {
        setError(data.error || 'Restore failed');
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog open={open} onClose={running ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <IconTile size={36} tone={ink.warn}><SettingsBackupRestore /></IconTile>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h4">Restore backup</Typography>
            <Typography variant="caption" sx={{ ...monoText, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {backup?.filename}
            </Typography>
          </Box>
        </Stack>
      </DialogTitle>

      <DialogContent>
        <AnimatePresence mode="wait" initial={false}>
          {result ? (
            <motion.div key="done" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.35, ease }}>
              <Stack alignItems="center" spacing={1.5} sx={{ py: 3, textAlign: 'center' }}>
                <motion.div initial={{ scale: 0, rotate: -45 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 16 }}>
                  <CheckCircle sx={{ fontSize: 56, color: ink.ok }} />
                </motion.div>
                <Typography variant="h5">Restored to {result.instanceName}</Typography>
                <Typography variant="body2">
                  {result.restarted ? 'Pi-hole restarted and is answering again.' : 'Pi-hole may take a few seconds to restart.'}
                </Typography>
                {result.safetyBackup && (
                  <Typography variant="caption">
                    The previous state was saved and pinned as{' '}
                    <Box component="span" sx={monoText}>{result.safetyBackup}</Box>
                  </Typography>
                )}
                {Array.isArray(result.processed) && result.processed.length > 0 && (
                  <Box sx={{ width: '100%', textAlign: 'left', mt: 1 }}>
                    <Typography sx={{ ...labelText, mb: 0.5 }}>Imported</Typography>
                    <Box sx={{ ...monoText, fontSize: '0.75rem', color: ink.muted, maxHeight: 140, overflow: 'auto' }}>
                      {result.processed.map((line) => <div key={line}>{line}</div>)}
                    </Box>
                  </Box>
                )}
              </Stack>
            </motion.div>
          ) : (
            <motion.div key="form" exit={{ opacity: 0 }}>
              <FormControl fullWidth sx={{ mt: 1, mb: 2 }}>
                <InputLabel>Restore to</InputLabel>
                <Select label="Restore to" value={target} onChange={(e) => setTarget(e.target.value)} disabled={running}>
                  {instances.map((i) => (
                    <MenuItem key={i.id} value={i.id}>
                      {i.name || i.host}
                      <Box component="span" sx={{ ...monoText, color: ink.faint, ml: 1, fontSize: '0.75rem' }}>{i.host}</Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {crossRestore && (
                <Alert severity="info" sx={{ mb: 2 }}>
                  This backup came from a different Pi-hole. Leave “Settings” off unless you want this Pi-hole to take over the other one’s
                  address, DHCP and password settings.
                </Alert>
              )}

              {viaSsh ? (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  This Pi-hole is connected over SSH, which can only import the whole archive. Switch it to the web or hybrid method for a
                  selective restore.
                </Alert>
              ) : (
                <>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                    <Typography sx={labelText}>What to restore</Typography>
                    <Button size="small" onClick={() => setParts(Object.values(parts).every(Boolean) ? Object.fromEntries(PARTS.map((p) => [p.key, false])) : ALL)} disabled={running}>
                      {Object.values(parts).every(Boolean) ? 'Select none' : 'Select all'}
                    </Button>
                  </Stack>
                  <Box sx={{ border: `1px solid ${ink.line}`, borderRadius: '12px', px: 1.5, py: 0.5, mb: 2 }}>
                    {PARTS.map((p) => (
                      <FormControlLabel
                        key={p.key}
                        sx={{ display: 'flex', alignItems: 'flex-start', my: 0.5, mr: 0 }}
                        control={
                          <Checkbox
                            size="small"
                            checked={parts[p.key]}
                            disabled={running}
                            onChange={(e) => setParts({ ...parts, [p.key]: e.target.checked })}
                            sx={{ pt: 0.5 }}
                          />
                        }
                        label={
                          <Box>
                            <Typography variant="body2" sx={{ color: ink.text, fontWeight: 550 }}>{p.label}</Typography>
                            <Typography variant="caption">{p.detail}</Typography>
                          </Box>
                        }
                      />
                    ))}
                  </Box>
                </>
              )}

              <FormControlLabel
                control={<Switch checked={backupFirst} onChange={(e) => setBackupFirst(e.target.checked)} disabled={running} />}
                label={
                  <Box>
                    <Typography variant="body2" sx={{ color: ink.text }}>Back up the current state first</Typography>
                    <Typography variant="caption">Pinned, so you can undo this restore</Typography>
                  </Box>
                }
              />

              {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
              {running && (
                <Typography variant="caption" sx={{ display: 'block', mt: 2 }}>
                  Importing… Pi-hole restarts after every import, so this takes up to a minute.
                </Typography>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        {result ? (
          <Button variant="contained" onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button onClick={onClose} disabled={running}>Cancel</Button>
            <Button
              variant="contained"
              onClick={run}
              disabled={running || nothing}
              startIcon={running ? <CircularProgress size={14} color="inherit" /> : <SettingsBackupRestore />}
              sx={{ position: 'relative', overflow: 'hidden', background: ink.warn, color: '#1A1205', '&:hover': { background: '#FFC56E' } }}
            >
              {running && <Shimmer />}
              {running ? 'Restoring…' : 'Restore'}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default RestoreDialog;
