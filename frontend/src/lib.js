export const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
export const TIMES = ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'];

const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MO = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const parse = (d) => new Date(`${d}T00:00:00`);

export function dayParts(d) {
  const x = parse(d);
  const weekday = WD[x.getDay()];
  return { weekday, wd: weekday.slice(0, 3), day: x.getDate(), month: MO[x.getMonth()] };
}
export const fmtTab = (d) => {
  const p = dayParts(d);
  return `${p.wd} ${p.day}`;
};
export const fmtWhen = (d, t) => `${fmtTab(d)}, ${t}`;
export const fmtPhone = (n) => String(n || '').replace(/^(\d{5})(\d{5})$/, '$1 $2');
export const fmtClock = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

let ctx;
function audio() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
function tone(freq, at, dur, gain = 0.06) {
  const c = audio();
  const o = c.createOscillator();
  const g = c.createGain();
  const t = c.currentTime + at;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export function startRing() {
  const pair = () => {
    for (const at of [0, 0.5]) {
      tone(440, at, 0.38);
      tone(480, at, 0.38);
    }
  };
  pair();
  const id = setInterval(pair, 2400);
  return () => clearInterval(id);
}
export function connectedChime() {
  tone(660, 0, 0.14);
  tone(880, 0.1, 0.24);
}
export function endTone() {
  tone(480, 0, 0.16, 0.07);
  tone(380, 0.18, 0.16, 0.07);
  tone(300, 0.36, 0.3, 0.07);
}
export function bookedChime() {
  tone(784, 0, 0.12, 0.05);
  tone(1047, 0.1, 0.32, 0.05);
}


