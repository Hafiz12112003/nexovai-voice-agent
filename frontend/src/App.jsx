import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCall, useClinic } from './hooks.js';
import { TIMES, dayParts, fmtTab, fmtWhen, fmtPhone, fmtClock, bookedChime } from './lib.js';

const Logo = () => (
  <span className="logo" aria-hidden="true">
    <span /><span /><span /><span /><span />
  </span>
);

const BASE = [36, 70, 100, 58, 28];

function LiveLogo({ levels, active }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    const bars = el.children;
    const reset = () => {
      for (const b of bars) b.style.height = '';
      el.style.color = '';
    };
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!active || reduce) {
      reset();
      return undefined;
    }
    const t0 = performance.now();
    let raf;
    let cur = 0;
    const tick = (now) => {
      const { mic, bot } = levels.current;
      const target = Math.min(1, Math.max(mic, bot) * 2.2);
      cur += (target - cur) * 0.25;
      const t = (now - t0) / 1000;
      for (let i = 0; i < bars.length; i++) {
        const wob = 0.4 + 0.6 * Math.abs(Math.sin(t * 5 + i * 1.3));
        bars[i].style.height = `${BASE[i] * (1 - cur) + (22 + 78 * wob) * cur}%`;
      }
      el.style.color = mic > bot ? 'var(--live)' : '';
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      reset();
    };
  }, [active, levels]);
  return (
    <span className="logo live" ref={ref} aria-hidden="true">
      <span /><span /><span /><span /><span />
    </span>
  );
}

function Halo({ levels, active }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!active) {
      el.style.setProperty('--on', '0');
      el.style.setProperty('--lvl', '0');
      return undefined;
    }
    el.style.setProperty('--on', '1');
    let raf;
    let cur = 0;
    const tick = () => {
      const { mic, bot } = levels.current;
      const target = Math.min(1, Math.max(mic, bot) * 2.2);
      cur += (target - cur) * 0.12;
      el.style.setProperty('--lvl', cur.toFixed(3));
      el.style.setProperty('--hc', mic > bot ? '#f6b93b' : '#2e3bff');
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, levels]);
  return <div className="halo" ref={ref} aria-hidden="true" />;
}

const Svg = ({ children }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
const PhoneIcon = () => (
  <Svg><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></Svg>
);
const EndIcon = () => (
  <span style={{ display: 'grid', transform: 'rotate(135deg)' }}><PhoneIcon /></span>
);
const MicIcon = () => (
  <Svg><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></Svg>
);
const MicOffIcon = () => (
  <Svg><line x1="1" y1="1" x2="23" y2="23" /><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" /><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></Svg>
);

function Wave({ levels }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    const g = cv.getContext('2d');
    const BARS = 30;
    const t0 = performance.now();
    let raf;
    let cur = 0;
    const draw = (now) => {
      const dpr = window.devicePixelRatio || 1;
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const { mic, bot } = levels.current;
      const target = Math.min(1, Math.max(mic, bot) * 2.2);
      cur += (target - cur) * 0.22;
      const t = (now - t0) / 1000;
      const gap = w / BARS;
      const bw = Math.max(3, gap * 0.42);
      g.fillStyle = bot >= mic ? '#dde7e3' : '#f6b93b';
      for (let i = 0; i < BARS; i++) {
        const wobble = 0.35 + 0.65 * Math.abs(Math.sin(t * 4.2 + i * 0.55) * Math.cos(t * 2.1 + i * 0.31));
        const env = Math.sin(((i + 0.5) / BARS) * Math.PI);
        const bh = 6 + (h - 6) * cur * wobble * (0.35 + 0.65 * env);
        g.beginPath();
        g.roundRect(i * gap + (gap - bw) / 2, (h - bh) / 2, bw, bh, bw / 2);
        g.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [levels]);
  return <canvas ref={ref} className="wave" aria-hidden="true" />;
}

function Ticket({ ticket }) {
  const a = ticket?.appt;
  return (
    <div className={`ticket ${ticket ? 'show' : ''} ${ticket?.type === 'cancelled' ? 'cancelled' : ''}`} aria-live="polite">
      {a && (
        <>
          <div className="tk-state"><i />{ticket.type === 'cancelled' ? 'Cancelled' : 'Booked'}</div>
          <div className="tk-doc">{a.doctor}</div>
          <div className="tk-sp">{a.speciality}</div>
          <div className="tk-perf" />
          <div className="tk-when">{fmtWhen(a.date, a.time)}</div>
          <div className="tk-num">{fmtPhone(a.phone)}</div>
        </>
      )}
    </div>
  );
}

function Phone({ call, ticket, act }) {
  const { state, transcript, muted, seconds, error, levels, start, end, toggleMute } = call;
  const linesRef = useRef(null);
  useEffect(() => {
    linesRef.current?.scrollTo({ top: 1e6, behavior: 'smooth' });
  }, [transcript]);
  const it = act?.it;

  return (
    <div className={`phone s-${state}`}>
      <div className="screen">
        <div className="notch" />

        {state === 'connected' ? (
          <>
            <div className="callhead">
              <div className="avatar sm"><Logo /></div>
              <div>
                <h3>Aster Clinic</h3>
                <div className="sub">{fmtClock(seconds)}{muted ? '  Muted' : ''}</div>
              </div>
            </div>
            <Wave levels={levels} />
            <div className={`act ${act?.on ? 'on' : ''} ${it && !it.ok ? 'bad' : ''}`} aria-live="polite">
              {it && (
                <>
                  <i />
                  <b>{it.title}</b>
                  <span>{it.detail}</span>
                </>
              )}
            </div>
            <div className="lines" ref={linesRef}>
              {transcript.length === 0 && <p className="line live">Say hello.</p>}
              {transcript.map((l) => (
                <p key={l.id} className={`line ${l.role} ${l.live ? 'live' : ''}`}>{l.text}</p>
              ))}
            </div>
          </>
        ) : (
          <div className="stage">
            <div className={`avatar ${state === 'ringing' ? 'ring' : ''}`}><Logo /></div>
            <h3>{state === 'ended' ? 'Call ended' : 'Aster Clinic'}</h3>
            <p>
              {state === 'idle' && 'Book by voice'}
              {state === 'ringing' && 'Calling'}
              {state === 'ended' && (seconds > 0 ? fmtClock(seconds) : 'Not connected')}
            </p>
            {error && <p className="err">{error}</p>}
          </div>
        )}

        <div className="controls">
          {(state === 'idle' || state === 'ended') && (
            <button className="pill" onClick={start}>{state === 'ended' ? 'Call again' : 'Try call'}</button>
          )}
          {state === 'ringing' && (
            <button className="ctl end" onClick={end} aria-label="Cancel call"><EndIcon /></button>
          )}
          {state === 'connected' && (
            <>
              <button className={`ctl mute ${muted ? 'on' : ''}`} onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'} aria-pressed={muted}>
                {muted ? <MicOffIcon /> : <MicIcon />}
              </button>
              <button className="ctl end" onClick={end} aria-label="End call"><EndIcon /></button>
            </>
          )}
        </div>

        {state === 'connected' && <Ticket ticket={ticket} />}
      </div>
    </div>
  );
}

export default function App() {
  const call = useCall();
  const active = call.state === 'ringing' || call.state === 'connected';

  const [day, setDay] = useState(null);
  const [flash, setFlash] = useState({});
  const [fresh, setFresh] = useState({});
  const [ticket, setTicket] = useState(null);
  const [act, setAct] = useState(null);
  const [boot, setBoot] = useState(true);
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'light');
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('aster-theme', theme); } catch { /* storage unavailable */ }
  }, [theme]);
  const ticketTimer = useRef(null);
  const actTimer = useRef(null);

  useEffect(() => {
    document.title = 'Aster';
  }, []);

  const onEvent = useCallback((ev) => {
    const a = ev.appointment;
    const key = `${a.doctor}|${a.date}|${a.time}`;
    setDay(a.date);
    setFlash((f) => ({ ...f, [key]: ev.type }));
    setTimeout(() => setFlash((f) => { const n = { ...f }; delete n[key]; return n; }), 3000);
    if (ev.type === 'booked') {
      setFresh((f) => ({ ...f, [a.id]: true }));
      setTimeout(() => setFresh((f) => { const n = { ...f }; delete n[a.id]; return n; }), 3600);
      bookedChime();
    }
    setTicket({ type: ev.type, appt: a });
    clearTimeout(ticketTimer.current);
    ticketTimer.current = setTimeout(() => setTicket(null), 10000);
  }, []);

  const onActivity = useCallback((it) => {
    setAct({ it, on: true });
    clearTimeout(actTimer.current);
    actTimer.current = setTimeout(() => setAct((a) => (a ? { ...a, on: false } : a)), 6000);
  }, []);

  const { doctors, appointments, online } = useClinic(active, onEvent, onActivity);

  useEffect(() => {
    if (call.state === 'idle') {
      setTicket(null);
      setAct(null);
    }
  }, [call.state]);

  useEffect(() => {
    if (!doctors.length) return undefined;
    const t = setTimeout(() => setBoot(false), 2200);
    return () => clearTimeout(t);
  }, [doctors.length]);

  const days = useMemo(() => {
    const s = new Set();
    doctors.forEach((d) => d.slots.forEach((x) => s.add(x.date)));
    appointments.forEach((a) => s.add(a.date));
    return [...s].sort();
  }, [doctors, appointments]);
  const current = day && days.includes(day) ? day : days[0];

  const openByDay = useMemo(() => {
    const total = Math.max(1, doctors.length * TIMES.length);
    const m = {};
    days.forEach((d) => {
      const free = doctors.reduce((n, doc) => n + doc.slots.filter((s) => s.date === d).length, 0);
      m[d] = free / total;
    });
    return m;
  }, [days, doctors]);

  const idOf = useMemo(() => Object.fromEntries(doctors.map((d) => [d.name, d.id])), [doctors]);
  const next = useMemo(() => { let best = null; doctors.forEach((d) => d.slots.forEach((s) => { const k = s.date + s.time; if (!best || k < best.k) best = { k, date: s.date, time: s.time, doc: d.name }; })); return best; }, [doctors]); const open = doctors.reduce((n, d) => n + d.slots.filter((s) => s.date === current).length, 0);

  return (
    <div className={`app ${boot ? 'boot' : ''}`}>
      <header className="top">
        <div className="brand">
          <LiveLogo levels={call.levels} active={call.state === 'connected'} />
          <h1>Aster</h1>
        </div>
        <button className="theme-btn" onClick={() => setTheme((x) => (x === 'dark' ? 'light' : 'dark'))} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>
          {theme === 'dark' ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
          )}
        </button>
        <div className={`status ${online ? '' : 'off'}`}>
          <i />{online ? 'Agent online' : 'Server offline'}{next && <em className="next">Next opening <b>{fmtTab(next.date)}, {next.time}</b> {next.doc}</em>}
        </div>
      </header>

      <main className="board">
        <div className="left">
          <section>
            <div className="head">
              <h2>Schedule</h2>
              <div className="tabs" role="tablist">
                {days.map((d) => (
                  <button key={d} role="tab" aria-selected={d === current} className={`tab ${d === current ? 'on' : ''}`} onClick={() => setDay(d)}>
                    {fmtTab(d)}
                    <span className="meter" style={{ '--p': openByDay[d] ?? 1 }} />
                  </button>
                ))}
              </div>
            </div>
            {current ? (
              <div className="grid-wrap">
                <div className="grid" style={{ '--cols': TIMES.length }}>
                  <div />
                  {TIMES.map((t) => <div className="th" key={t}>{t}</div>)}
                  {doctors.map((d, ri) => {
                    const free = new Set(d.slots.filter((s) => s.date === current).map((s) => s.time));
                    return (
                      <Fragment key={d.id}>
                        <div className={`doc dc-${d.id}`}><b>{d.name}</b><span>{d.speciality}</span></div>
                        {TIMES.map((t, ci) => {
                          const booked = !free.has(t);
                          const f = flash[`${d.name}|${current}|${t}`];
                          return (
                            <div
                              key={t}
                              className={`cell dc-${d.id} ${booked ? 'booked' : ''} ${f ? `flash-${f}` : ''}`}
                              style={{ '--i': ri + ci }}
                              title={`${d.name}, ${fmtTab(current)} ${t}, ${booked ? 'taken' : 'open'}`}
                            />
                          );
                        })}
                      </Fragment>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="empty">{online ? 'No slots yet.' : 'Start the backend server to load the schedule.'}</p>
            )}
            {current && <p className="count" style={{ marginTop: -40, marginBottom: 56 }}>{open} open on {fmtTab(current)}</p>}
          </section>

          <section>
            <div className="head">
              <h2>Appointments</h2>
              <span className="count">{appointments.length}</span>
            </div>
            {appointments.length === 0 ? (
              <p className="empty">Nothing booked. Start a call.</p>
            ) : (
              <ul className="ledger">
                {[...appointments].reverse().map((a) => {
                  const p = dayParts(a.date);
                  return (
                    <li key={a.id} className={`row dc-${idOf[a.doctor] || ''} ${fresh[a.id] ? 'new' : ''}`} style={{ gridTemplateColumns: 'clamp(52px, 6vw, 64px) minmax(0, 1fr) auto' }}>
                      <div className="when"><strong>{p.day}</strong><span>{p.wd} {p.month.slice(0, 3)}</span></div>
                      <div className="who"><b>{a.doctor}</b><span>{a.speciality}</span></div>
                      <div className="at">{a.time}<span className="num" style={{ display: 'block', fontWeight: 400 }}>{fmtPhone(a.phone)}</span></div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <aside className="right">
          <Halo levels={call.levels} active={active} />
          <Phone call={call} ticket={ticket} act={act} />
        </aside>
      </main>
    </div>
  );
}



