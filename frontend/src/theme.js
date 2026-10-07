import { createTheme } from '@mui/material/styles';

// Design tokens.
//
// A deep blue-slate ground with a slow ambient glow behind it, translucent
// "glass" surfaces on top, and one accent expressed as a blue-to-cyan
// gradient. The gradient is reserved for what you can act on and what is live;
// the state colours only ever report state.
export const ink = {
  ground: '#0A0E15',
  surface: 'rgba(19, 25, 35, 0.72)',
  surfaceSolid: '#131923',
  raised: 'rgba(30, 38, 52, 0.8)',
  raisedSolid: '#1B2230',
  line: 'rgba(148, 170, 205, 0.10)',
  lineStrong: 'rgba(148, 170, 205, 0.18)',
  text: '#E6EAF2',
  muted: '#8D97A8',
  faint: '#5E6878',
  accent: '#5B8CFF',
  accent2: '#22D3EE',
  accentDim: 'rgba(91, 140, 255, 0.14)',
  ok: '#34D399',
  warn: '#F5B451',
  bad: '#F2706A'
};

export const gradient = {
  accent: `linear-gradient(135deg, ${ink.accent} 0%, ${ink.accent2} 100%)`,
  accentSoft: 'linear-gradient(135deg, rgba(91,140,255,0.18) 0%, rgba(34,211,238,0.12) 100%)',
  text: `linear-gradient(120deg, #FFFFFF 0%, #B9CCFF 45%, ${ink.accent2} 100%)`
};

// Translucent card surface. Used by Card, Paper and the hand-built panels.
export const glass = {
  backgroundColor: ink.surface,
  backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0) 40%)',
  backdropFilter: 'blur(14px) saturate(140%)',
  WebkitBackdropFilter: 'blur(14px) saturate(140%)',
  border: `1px solid ${ink.line}`,
  boxShadow: '0 1px 0 rgba(255,255,255,0.04) inset, 0 20px 40px -24px rgba(0,0,0,0.6)'
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

// Small descriptive labels. Sentence case, never capitals.
export const labelText = {
  fontSize: '0.8125rem',
  fontWeight: 500,
  color: ink.muted,
  lineHeight: 1.4
};

// Shared easing so every transition in the app moves the same way.
export const ease = [0.22, 1, 0.36, 1];

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: ink.accent, light: '#86A9FF', dark: '#3D6FE0', contrastText: '#06101F' },
    secondary: { main: ink.accent2, contrastText: '#06101F' },
    success: { main: ink.ok },
    warning: { main: ink.warn },
    error: { main: ink.bad },
    info: { main: ink.accent },
    background: { default: ink.ground, paper: ink.surfaceSolid },
    text: { primary: ink.text, secondary: ink.muted, disabled: ink.faint },
    divider: ink.line
  },
  typography: {
    fontFamily: sans,
    h1: { fontSize: '2.25rem', fontWeight: 650, letterSpacing: '-0.03em', lineHeight: 1.1 },
    h2: { fontSize: '1.75rem', fontWeight: 650, letterSpacing: '-0.025em', lineHeight: 1.15 },
    h3: { fontSize: '1.375rem', fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.25 },
    h4: { fontSize: '1.0625rem', fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.3 },
    h5: { fontSize: '1rem', fontWeight: 600, lineHeight: 1.4 },
    h6: { fontSize: '0.9375rem', fontWeight: 600, lineHeight: 1.4 },
    body1: { fontSize: '0.9375rem', lineHeight: 1.6 },
    body2: { fontSize: '0.875rem', lineHeight: 1.55, color: ink.muted },
    caption: { fontSize: '0.8125rem', lineHeight: 1.45, color: ink.muted },
    button: { textTransform: 'none', fontWeight: 550, fontSize: '0.875rem', letterSpacing: 0 }
  },
  shape: { borderRadius: 12 },
  transitions: {
    easing: { easeOut: 'cubic-bezier(0.22, 1, 0.36, 1)' }
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: ink.ground,
          minHeight: '100vh',
          WebkitFontSmoothing: 'antialiased',
          overflowX: 'hidden'
        },
        '::selection': { background: 'rgba(91, 140, 255, 0.35)' },
        '.tabular': { fontVariantNumeric: 'tabular-nums' },
        '*:focus-visible': { outline: `2px solid ${ink.accent}`, outlineOffset: '2px' },
        '@keyframes pv-spin': { to: { transform: 'rotate(360deg)' } },
        '@keyframes pv-ping': {
          '0%': { transform: 'scale(1)', opacity: 0.7 },
          '80%, 100%': { transform: 'scale(2.6)', opacity: 0 }
        },
        '@keyframes pv-shimmer': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' }
        },
        '@keyframes pv-drift-a': {
          '0%, 100%': { transform: 'translate3d(0, 0, 0) scale(1)' },
          '50%': { transform: 'translate3d(6vw, 4vh, 0) scale(1.12)' }
        },
        '@keyframes pv-drift-b': {
          '0%, 100%': { transform: 'translate3d(0, 0, 0) scale(1.05)' },
          '50%': { transform: 'translate3d(-5vw, -6vh, 0) scale(0.92)' }
        },
        '@media (prefers-reduced-motion: reduce)': {
          '*, *::before, *::after': {
            animationDuration: '0.01ms !important',
            animationIterationCount: '1 !important',
            transitionDuration: '0.01ms !important'
          }
        }
      }
    },
    MuiAppBar: {
      styleOverrides: {
        root: { backgroundColor: 'transparent', backgroundImage: 'none', boxShadow: 'none' }
      }
    },
    MuiCard: {
      styleOverrides: {
        root: { ...glass, borderRadius: 16 }
      }
    },
    MuiCardContent: {
      styleOverrides: { root: { padding: 24, '&:last-child': { paddingBottom: 24 } } }
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          padding: '8px 16px',
          boxShadow: 'none',
          transition: 'transform 160ms cubic-bezier(0.22,1,0.36,1), box-shadow 200ms, background-color 200ms, border-color 200ms, color 200ms',
          '&:active': { transform: 'scale(0.97)' }
        },
        containedPrimary: {
          background: gradient.accent,
          color: '#06101F',
          fontWeight: 650,
          boxShadow: '0 8px 24px -10px rgba(91, 140, 255, 0.7)',
          '&:hover': {
            background: gradient.accent,
            boxShadow: '0 10px 30px -8px rgba(34, 211, 238, 0.65)',
            filter: 'brightness(1.08)'
          },
          '&.Mui-disabled': {
            background: ink.raisedSolid,
            color: ink.faint,
            boxShadow: 'none'
          }
        },
        outlined: {
          borderColor: ink.lineStrong,
          color: ink.text,
          backgroundColor: 'rgba(255,255,255,0.02)',
          '&:hover': { borderColor: ink.accent, backgroundColor: ink.accentDim }
        },
        text: { color: ink.muted, '&:hover': { color: ink.text, backgroundColor: 'rgba(255,255,255,0.05)' } }
      }
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          color: ink.muted,
          borderRadius: 10,
          transition: 'color 160ms, background-color 160ms, transform 160ms',
          '&:hover': { color: ink.text, backgroundColor: 'rgba(255,255,255,0.06)' },
          '&:active': { transform: 'scale(0.92)' }
        }
      }
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 999, fontWeight: 550, fontSize: '0.75rem', height: 24 },
        outlined: { borderColor: ink.lineStrong }
      }
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 10,
            backgroundColor: 'rgba(6, 10, 16, 0.55)',
            transition: 'box-shadow 200ms',
            '& fieldset': { borderColor: ink.lineStrong, transition: 'border-color 200ms' },
            '&:hover fieldset': { borderColor: 'rgba(148, 170, 205, 0.35)' },
            '&.Mui-focused': { boxShadow: `0 0 0 4px ${ink.accentDim}` },
            '&.Mui-focused fieldset': { borderColor: ink.accent, borderWidth: 1 }
          },
          '& .MuiInputLabel-root': { color: ink.muted }
        }
      }
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          '& fieldset': { borderColor: ink.lineStrong }
        }
      }
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' }
      }
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          ...glass,
          backgroundColor: 'rgba(22, 28, 40, 0.92)',
          borderRadius: 14,
          minWidth: 220,
          marginTop: 6
        },
        list: { padding: 6 }
      }
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          fontSize: '0.875rem',
          minHeight: 38,
          '&:hover': { backgroundColor: 'rgba(255,255,255,0.06)' }
        }
      }
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          ...glass,
          backgroundColor: 'rgba(19, 25, 35, 0.92)',
          border: `1px solid ${ink.lineStrong}`,
          borderRadius: 18
        }
      }
    },
    MuiBackdrop: {
      styleOverrides: {
        root: {
          '&:not(.MuiBackdrop-invisible)': {
            backgroundColor: 'rgba(4, 7, 12, 0.6)',
            backdropFilter: 'blur(6px)'
          }
        }
      }
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: ink.raisedSolid,
          border: `1px solid ${ink.lineStrong}`,
          color: ink.text,
          fontSize: '0.75rem',
          borderRadius: 8,
          padding: '6px 10px'
        }
      }
    },
    MuiSwitch: {
      styleOverrides: {
        switchBase: {
          '&.Mui-checked + .MuiSwitch-track': { background: gradient.accent, opacity: 1 }
        },
        track: { backgroundColor: ink.lineStrong, opacity: 1 }
      }
    },
    MuiLinearProgress: {
      styleOverrides: { root: { backgroundColor: ink.line, borderRadius: 999 } }
    },
    MuiDivider: {
      styleOverrides: { root: { borderColor: ink.line } }
    },
    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: 12, border: `1px solid ${ink.line}`, alignItems: 'flex-start' },
        standardInfo: { backgroundColor: 'rgba(91, 140, 255, 0.08)', color: ink.text, borderColor: 'rgba(91,140,255,0.2)' },
        standardSuccess: { backgroundColor: 'rgba(52, 211, 153, 0.08)', color: ink.text, borderColor: 'rgba(52,211,153,0.2)' },
        standardWarning: { backgroundColor: 'rgba(245, 180, 81, 0.08)', color: ink.text, borderColor: 'rgba(245,180,81,0.22)' },
        standardError: { backgroundColor: 'rgba(242, 112, 106, 0.08)', color: ink.text, borderColor: 'rgba(242,112,106,0.22)' }
      }
    }
  }
});

export default theme;
