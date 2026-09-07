import { createTheme } from '@mui/material/styles';

// Design tokens.
//
// The ground is a blue-slate rather than a tinted near-black, and there is a
// single accent. Blue marks what you can act on and what is live; the state
// colours only ever report state and are never used to decorate. Surfaces are
// separated by hairlines rather than shadows, so nothing floats.
export const ink = {
  ground: '#12161C',
  surface: '#171C24',
  raised: '#1C2029',
  line: '#232A34',
  lineStrong: '#2E3742',
  text: '#E4E8EE',
  muted: '#8A94A4',
  faint: '#5F6875',
  accent: '#4C8DFF',
  accentDim: 'rgba(76, 141, 255, 0.12)',
  ok: '#3FB984',
  warn: '#E0A34E',
  bad: '#E2685F'
};

// Interface text is Inter. Machine values -- addresses, ports, cron
// expressions, paths, filenames, sizes -- are set in JetBrains Mono, so the
// typeface itself says whether a value came from your network or from us, and
// columns of figures line up.
export const sans =
  '"Inter Variable", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
export const mono =
  '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

// Applied to any value the machine produced rather than a person wrote.
export const monoText = {
  fontFamily: mono,
  fontVariantNumeric: 'tabular-nums',
  letterSpacing: '-0.01em'
};

// Small descriptive labels. Sentence case, never capitals: tracked-out capitals
// are decoration, and at this size they cost legibility for nothing.
export const labelText = {
  fontSize: '0.8125rem',
  fontWeight: 500,
  color: ink.muted,
  lineHeight: 1.4
};

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: ink.accent, light: '#7BAAFF', dark: '#2C6BD6', contrastText: '#0B0E13' },
    secondary: { main: ink.muted, contrastText: '#0B0E13' },
    success: { main: ink.ok },
    warning: { main: ink.warn },
    error: { main: ink.bad },
    background: { default: ink.ground, paper: ink.surface },
    text: { primary: ink.text, secondary: ink.muted, disabled: ink.faint },
    divider: ink.line
  },
  typography: {
    fontFamily: sans,
    // Tightened at the display end so large numbers read as data rather than
    // as marketing.
    h1: { fontSize: '2rem', fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.15 },
    h2: { fontSize: '1.625rem', fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.2 },
    h3: { fontSize: '1.375rem', fontWeight: 600, letterSpacing: '-0.015em', lineHeight: 1.25 },
    h4: { fontSize: '1.125rem', fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.3 },
    h5: { fontSize: '1rem', fontWeight: 600, lineHeight: 1.4 },
    h6: { fontSize: '0.9375rem', fontWeight: 600, lineHeight: 1.4 },
    body1: { fontSize: '0.9375rem', lineHeight: 1.6 },
    body2: { fontSize: '0.875rem', lineHeight: 1.55, color: ink.muted },
    caption: { fontSize: '0.8125rem', lineHeight: 1.45, color: ink.muted },
    button: { textTransform: 'none', fontWeight: 500, fontSize: '0.875rem', letterSpacing: 0 }
  },
  shape: { borderRadius: 10 },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: ink.ground,
          minHeight: '100vh',
          WebkitFontSmoothing: 'antialiased'
        },
        // A value that updates in place must not make the layout jitter.
        '.tabular': { fontVariantNumeric: 'tabular-nums' },
        '*:focus-visible': { outline: `2px solid ${ink.accent}`, outlineOffset: '2px' },
        '@media (prefers-reduced-motion: reduce)': {
          '*': {
            animationDuration: '0.01ms !important',
            transitionDuration: '0.01ms !important'
          }
        }
      }
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: ink.ground,
          backgroundImage: 'none',
          borderBottom: `1px solid ${ink.line}`,
          boxShadow: 'none'
        }
      }
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: ink.surface,
          backgroundImage: 'none',
          border: `1px solid ${ink.line}`,
          borderRadius: 12,
          boxShadow: 'none'
        }
      }
    },
    MuiCardContent: {
      styleOverrides: { root: { padding: 20, '&:last-child': { paddingBottom: 20 } } }
    },
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: 8, padding: '8px 14px', boxShadow: 'none' },
        contained: {
          backgroundColor: ink.accent,
          color: '#0B0E13',
          fontWeight: 600,
          '&:hover': { backgroundColor: '#6BA0FF', boxShadow: 'none' }
        },
        outlined: {
          borderColor: ink.lineStrong,
          color: ink.text,
          '&:hover': { borderColor: ink.accent, backgroundColor: ink.accentDim }
        },
        text: { color: ink.muted, '&:hover': { color: ink.text, backgroundColor: ink.raised } }
      }
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          color: ink.muted,
          borderRadius: 8,
          '&:hover': { color: ink.text, backgroundColor: ink.raised }
        }
      }
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 6, fontWeight: 500, fontSize: '0.75rem', height: 24 },
        outlined: { borderColor: ink.line }
      }
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 8,
            backgroundColor: ink.ground,
            '& fieldset': { borderColor: ink.lineStrong },
            '&:hover fieldset': { borderColor: ink.muted },
            '&.Mui-focused fieldset': { borderColor: ink.accent, borderWidth: 1 }
          },
          '& .MuiInputLabel-root': { color: ink.muted }
        }
      }
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundColor: ink.surface,
          backgroundImage: 'none',
          border: `1px solid ${ink.line}`,
          borderRadius: 12
        }
      }
    },
    MuiDialog: {
      styleOverrides: {
        paper: { backgroundColor: ink.surface, border: `1px solid ${ink.lineStrong}`, borderRadius: 12 }
      }
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: ink.raised,
          border: `1px solid ${ink.lineStrong}`,
          color: ink.text,
          fontSize: '0.8125rem',
          borderRadius: 6
        }
      }
    },
    MuiLinearProgress: {
      styleOverrides: { root: { backgroundColor: ink.line, borderRadius: 999 } }
    },
    MuiStepIcon: {
      styleOverrides: {
        root: {
          color: ink.line,
          '&.Mui-active': { color: ink.accent },
          '&.Mui-completed': { color: ink.ok }
        }
      }
    },
    MuiListItem: {
      styleOverrides: { root: { borderRadius: 8 } }
    },
    MuiDivider: {
      styleOverrides: { root: { borderColor: ink.line } }
    },
    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: 10, border: `1px solid ${ink.line}` },
        standardInfo: { backgroundColor: ink.raised, color: ink.text },
        standardSuccess: { backgroundColor: 'rgba(63, 185, 132, 0.10)', color: ink.text },
        standardWarning: { backgroundColor: 'rgba(224, 163, 78, 0.10)', color: ink.text },
        standardError: { backgroundColor: 'rgba(226, 104, 95, 0.10)', color: ink.text }
      }
    }
  }
});

export default theme;
