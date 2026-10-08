import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography
} from '@mui/material';
import { CompareArrows, East } from '@mui/icons-material';
import { motion } from 'framer-motion';
import api from '../services/api';
import { IconTile } from './ui';
import { ink, labelText, monoText, ease } from '../theme';

const SECTIONS = [
  { key: 'domains', label: 'Allow / deny domains' },
  { key: 'adlists', label: 'Blocklists' },
  { key: 'groups', label: 'Groups' },
  { key: 'clients', label: 'Clients' }
];

const MARK = {
  added: { sign: '+', color: ink.ok, bg: 'rgba(52,211,153,0.08)' },
  removed: { sign: '−', color: ink.bad, bg: 'rgba(242,112,106,0.08)' },
  changed: { sign: '~', color: ink.warn, bg: 'rgba(245,180,81,0.08)' }
};

const when = (b) => new Date(b.timestamp).toLocaleString();

const Line = ({ kind, children, detail }) => (
  <Stack
    direction="row"
    spacing={1.25}
    sx={{ px: 1.25, py: 0.6, borderRadius: '8px', backgroundColor: MARK[kind].bg, mb: 0.5, alignItems: 'baseline' }}
  >
    <Box sx={{ ...monoText, color: MARK[kind].color, fontWeight: 700, width: 10, flexShrink: 0 }}>{MARK[kind].sign}</Box>
    <Box sx={{ minWidth: 0, flexGrow: 1 }}>
      <Box sx={{ ...monoText, fontSize: '0.8125rem', color: ink.text, wordBreak: 'break-all' }}>{children}</Box>
      {detail && <Typography variant="caption" sx={{ display: 'block' }}>{detail}</Typography>}
    </Box>
  </Stack>
);

const fieldChanges = (item) =>
  (item.fields || []).map((f) => `${f.field}: ${f.before ?? '∅'} → ${f.after ?? '∅'}`).join(' · ');

const DiffDialog = ({ backup, backups = [], onClose }) => {
  const open = Boolean(backup);
  // Only backups of the same Pi-hole make sense to compare by default, but
  // comparing two Pi-holes is useful too (are they in sync?), so allow any.
  const candidates = useMemo(() => backups.filter((b) => b.filename !== backup?.filename), [backups, backup]);
  const [from, setFrom] = useState('');
  const [diff, setDiff] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    const older = candidates.find((b) => b.instanceId === backup.instanceId && new Date(b.timestamp) < new Date(backup.timestamp));
    setFrom(older?.filename || candidates[0]?.filename || '');
    setDiff(null);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, backup?.filename]);

  useEffect(() => {
    if (!open || !from) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get('/backups/diff', { params: { from, to: backup.filename }, timeout: 60000 })
      .then(({ data }) => {
        if (cancelled) return;
        if (data.success) setDiff(data);
        else setError(data.error);
      })
      .catch((err) => !cancelled && setError(err.response?.data?.error || err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, from, backup?.filename]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <IconTile size={36} tone={ink.accent2}><CompareArrows /></IconTile>
          <Box>
            <Typography variant="h4">What changed</Typography>
            <Typography variant="caption">Lists, groups, clients and every setting between two backups</Typography>
          </Box>
        </Stack>
      </DialogTitle>

      <DialogContent>
        {candidates.length === 0 ? (
          <Alert severity="info" sx={{ mt: 1 }}>Take another backup first: there is nothing to compare this one with yet.</Alert>
        ) : (
          <>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} sx={{ mt: 1, mb: 2.5 }}>
              <FormControl fullWidth size="small">
                <InputLabel>From</InputLabel>
                <Select label="From" value={from} onChange={(e) => setFrom(e.target.value)}>
                  {candidates.map((b) => (
                    <MenuItem key={b.filename} value={b.filename}>
                      <Box component="span" sx={{ mr: 1 }}>{when(b)}</Box>
                      <Box component="span" sx={{ ...monoText, color: ink.faint, fontSize: '0.75rem' }}>{b.instanceId}</Box>
                      {b.pinned && <Box component="span" sx={{ ml: 1, color: ink.warn, fontSize: '0.75rem' }}>pinned</Box>}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <East sx={{ color: ink.faint, display: { xs: 'none', sm: 'block' } }} />
              <Box sx={{ px: 1.5, py: 1, borderRadius: '10px', border: `1px solid ${ink.line}`, whiteSpace: 'nowrap', fontSize: '0.875rem' }}>
                {backup && when(backup)}
                <Box component="span" sx={{ ...monoText, color: ink.faint, fontSize: '0.75rem', ml: 1 }}>{backup?.instanceId}</Box>
              </Box>
            </Stack>

            {loading && (
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ py: 4, justifyContent: 'center' }}>
                <CircularProgress size={18} />
                <Typography variant="body2">Comparing…</Typography>
              </Stack>
            )}
            {error && <Alert severity="error">{error}</Alert>}

            {diff && !loading && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease }}>
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1, mb: 2.5 }}>
                  {[...SECTIONS, { key: 'settings', label: 'Settings' }].map((s) => (
                    <Chip
                      key={s.key}
                      size="small"
                      label={`${s.label}: ${diff.summary[s.key]}`}
                      sx={{
                        color: diff.summary[s.key] ? ink.text : ink.faint,
                        backgroundColor: diff.summary[s.key] ? 'rgba(91,140,255,0.12)' : 'transparent',
                        border: `1px solid ${ink.line}`
                      }}
                    />
                  ))}
                </Stack>

                {diff.summary.total === 0 && (
                  <Alert severity="success">Identical: no list, group, client or setting differs.</Alert>
                )}

                {SECTIONS.filter((s) => diff.summary[s.key] > 0).map((s) => {
                  const d = diff[s.key];
                  return (
                    <Box key={s.key} sx={{ mb: 2.5 }}>
                      <Typography sx={{ ...labelText, mb: 1 }}>
                        {s.label}
                        <Box component="span" sx={{ ...monoText, color: ink.faint, ml: 1 }}>
                          {diff.counts.before[s.key]} → {diff.counts.after[s.key]}
                        </Box>
                      </Typography>
                      {d.added.map((x) => <Line key={`a${x.label}${x.kind}`} kind="added" detail={[x.kind, x.comment].filter(Boolean).join(' · ')}>{x.label}</Line>)}
                      {d.removed.map((x) => <Line key={`r${x.label}${x.kind}`} kind="removed" detail={[x.kind, x.comment].filter(Boolean).join(' · ')}>{x.label}</Line>)}
                      {d.changed.map((x) => <Line key={`c${x.label}${x.kind}`} kind="changed" detail={fieldChanges(x)}>{x.label}</Line>)}
                    </Box>
                  );
                })}

                {diff.settings.length > 0 && (
                  <Box>
                    <Typography sx={{ ...labelText, mb: 1 }}>Settings (pihole.toml)</Typography>
                    {diff.settings.map((c) => (
                      <Line
                        key={c.key}
                        kind={c.change}
                        detail={c.change === 'changed' ? `${c.before} → ${c.after}` : c.after ?? c.before}
                      >
                        {c.key}
                      </Line>
                    ))}
                  </Box>
                )}
              </motion.div>
            )}
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default DiffDialog;
