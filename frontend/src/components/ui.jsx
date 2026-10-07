import React, { useEffect, useRef, useState } from 'react';
import { Box } from '@mui/material';
import { animate, motion, useReducedMotion } from 'framer-motion';
import { ink, gradient, glass, ease } from '../theme';

// Shared motion primitives. Everything that moves in the app moves through
// here, so durations and easing stay consistent and reduced-motion is honoured
// in one place (MotionConfig in App.jsx handles framer; CSS keyframes are
// neutralised by the media query in the theme).

export const MotionBox = motion.create(Box);

// Parent/child variants for staggered entrances.
export const stagger = (delayChildren = 0.05, staggerChildren = 0.06) => ({
  hidden: {},
  show: { transition: { delayChildren, staggerChildren } }
});

export const rise = {
  hidden: { opacity: 0, y: 16, filter: 'blur(4px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.55, ease } }
};

// Slow-drifting glow behind the whole app. Transform-only keyframes, so it
// stays on the compositor and costs next to nothing.
export const AmbientBackground = () => (
  <Box
    aria-hidden
    sx={{
      position: 'fixed',
      inset: 0,
      zIndex: 0,
      pointerEvents: 'none',
      overflow: 'hidden',
      backgroundColor: ink.ground
    }}
  >
    <Box
      sx={{
        position: 'absolute',
        width: '60vw',
        height: '60vw',
        top: '-25vw',
        left: '-15vw',
        borderRadius: '50%',
        background: 'radial-gradient(closest-side, rgba(91,140,255,0.22), transparent)',
        filter: 'blur(20px)',
        animation: 'pv-drift-a 22s ease-in-out infinite'
      }}
    />
    <Box
      sx={{
        position: 'absolute',
        width: '50vw',
        height: '50vw',
        bottom: '-25vw',
        right: '-10vw',
        borderRadius: '50%',
        background: 'radial-gradient(closest-side, rgba(34,211,238,0.14), transparent)',
        filter: 'blur(20px)',
        animation: 'pv-drift-b 28s ease-in-out infinite'
      }}
    />
    {/* Dot grid, faded out towards the edges. */}
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        backgroundImage: 'radial-gradient(rgba(148,170,205,0.13) 1px, transparent 1px)',
        backgroundSize: '22px 22px',
        maskImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, #000 30%, transparent 100%)',
        WebkitMaskImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, #000 30%, transparent 100%)'
      }}
    />
  </Box>
);

// A glass panel with a soft spotlight that follows the pointer. The highlight
// is a CSS variable update, so moving the mouse never re-renders React.
export const GlowCard = React.forwardRef(({ children, sx, glow = true, ...rest }, forwardedRef) => {
  const localRef = useRef(null);
  const ref = forwardedRef || localRef;

  const onMove = (event) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${event.clientX - rect.left}px`);
    el.style.setProperty('--my', `${event.clientY - rect.top}px`);
  };

  return (
    <MotionBox
      ref={ref}
      variants={rise}
      onMouseMove={glow ? onMove : undefined}
      sx={{
        ...glass,
        position: 'relative',
        borderRadius: '16px',
        overflow: 'hidden',
        isolation: 'isolate',
        transition: 'border-color 250ms',
        '&::before': glow
          ? {
              content: '""',
              position: 'absolute',
              inset: 0,
              zIndex: -1,
              opacity: 0,
              transition: 'opacity 300ms',
              background:
                'radial-gradient(420px circle at var(--mx, 50%) var(--my, 0%), rgba(91,140,255,0.10), transparent 60%)'
            }
          : undefined,
        '&:hover': glow ? { borderColor: ink.lineStrong, '&::before': { opacity: 1 } } : undefined,
        ...sx
      }}
      {...rest}
    >
      {children}
    </MotionBox>
  );
});
GlowCard.displayName = 'GlowCard';

// Animates a number from its previous value to the new one.
export const CountUp = ({ value, format = (v) => Math.round(v).toLocaleString(), duration = 1.1 }) => {
  const reduce = useReducedMotion();
  const target = Number.isFinite(Number(value)) ? Number(value) : 0;
  const [display, setDisplay] = useState(reduce ? target : 0);
  const from = useRef(reduce ? target : 0);

  useEffect(() => {
    if (reduce) {
      setDisplay(target);
      from.current = target;
      return undefined;
    }
    const controls = animate(from.current, target, {
      duration,
      ease,
      onUpdate: (v) => setDisplay(v)
    });
    from.current = target;
    return () => controls.stop();
  }, [target, duration, reduce]);

  return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{format(display)}</span>;
};

// A status dot that radiates when the thing it reports is live.
export const LiveDot = ({ color = ink.ok, pulse = true, size = 8 }) => (
  <Box component="span" sx={{ position: 'relative', display: 'inline-flex', width: size, height: size, flexShrink: 0 }}>
    {pulse && (
      <Box
        component="span"
        sx={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          backgroundColor: color,
          animation: 'pv-ping 1.8s cubic-bezier(0, 0, 0.2, 1) infinite'
        }}
      />
    )}
    <Box
      component="span"
      sx={{
        position: 'relative',
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: color,
        boxShadow: `0 0 10px ${color}`
      }}
    />
  </Box>
);

// Rounded tile holding a section icon.
export const IconTile = ({ children, size = 40, tone = ink.accent }) => (
  <Box
    sx={{
      width: size,
      height: size,
      flexShrink: 0,
      display: 'grid',
      placeItems: 'center',
      borderRadius: '12px',
      color: tone,
      background: `linear-gradient(135deg, ${tone}2E, ${tone}0D)`,
      border: `1px solid ${tone}33`,
      '& svg': { fontSize: size * 0.5 }
    }}
  >
    {children}
  </Box>
);

// Text painted with the accent gradient. Used sparingly, for one headline.
export const GradientText = ({ children, sx, component = 'span' }) => (
  <Box
    component={component}
    sx={{
      background: gradient.text,
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      ...sx
    }}
  >
    {children}
  </Box>
);

// Circular gauge drawn in SVG; the arc animates to its value.
export const Ring = ({ value = 0, size = 148, stroke = 10, color, children }) => {
  const radius = (size - stroke) / 2;
  const clamped = Math.max(0, Math.min(1, value));
  const id = React.useId();

  return (
    <Box sx={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <defs>
          <linearGradient id={`ring-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={color || ink.accent} />
            <stop offset="100%" stopColor={color ? color : ink.accent2} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={ink.line} strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#ring-${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: clamped }}
          transition={{ duration: 1.4, ease, delay: 0.2 }}
          style={{ filter: `drop-shadow(0 0 6px ${(color || ink.accent)}88)` }}
        />
      </svg>
      <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        {children}
      </Box>
    </Box>
  );
};

// A light sweep across a button while it is busy.
export const Shimmer = () => (
  <Box
    component="span"
    aria-hidden
    sx={{
      position: 'absolute',
      inset: 0,
      overflow: 'hidden',
      borderRadius: 'inherit',
      pointerEvents: 'none',
      '&::after': {
        content: '""',
        position: 'absolute',
        inset: 0,
        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)',
        animation: 'pv-shimmer 1.3s ease-in-out infinite'
      }
    }}
  />
);
