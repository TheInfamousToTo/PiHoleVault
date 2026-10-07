const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const pad = (n) => String(n).padStart(2, '0');

// Turns the common cron shapes into a sentence; anything unusual is left to
// the raw expression, which is always shown alongside.
export const describeCron = (expr) => {
  if (!expr) return null;
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [min, hour, dom, mon, dow] = parts;
  const isNum = (v) => /^\d+$/.test(v);
  const at = isNum(min) && isNum(hour) ? `${pad(hour)}:${pad(min)}` : null;

  if (at && dom === '*' && mon === '*' && dow === '*') return `Daily at ${at}`;
  if (at && dom === '*' && mon === '*' && isNum(dow) && DAYS[Number(dow) % 7]) return `Every ${DAYS[Number(dow) % 7]} at ${at}`;
  if (at && isNum(dom) && mon === '*' && dow === '*') return `Monthly on day ${dom} at ${at}`;
  const everyHours = hour.match(/^\*\/(\d+)$/);
  if (isNum(min) && everyHours && dom === '*' && mon === '*' && dow === '*') return `Every ${everyHours[1]} hours`;
  if (isNum(min) && hour === '*' && dom === '*' && mon === '*' && dow === '*') return 'Every hour';
  return null;
};
