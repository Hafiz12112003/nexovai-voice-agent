import { useCallback, useEffect, useRef, useState } from 'react';
import { PipecatClient } from '@pipecat-ai/client-js';
import { SmallWebRTCTransport } from '@pipecat-ai/small-webrtc-transport';
import { API, startRing, connectedChime, endTone } from './lib.js';

const MIN_RING_MS = 2600;
const READY_TIMEOUT_MS = 20000;
let uid = 0;

export function useCall() {
  const [state, setState] = useState('idle'); // idle | ringing | connected | ended
  const [transcript, setTranscript] = useState([]);
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState(null);
  const [botSpeaking, setBotSpeaking] = useState(false);

  const levels = useRef({ mic: 0, bot: 0 });
  const clientRef = useRef(null);
  const stopRing = useRef(null);
  const audioEl = useRef(null);
  const attachTimer = useRef(null);
  const items = useRef([]);
  const pendingUser = useRef(null);
  const timer = useRef(null);
  const stateRef = useRef('idle');
  const mutedRef = useRef(false);

  const set = (s) => {
    stateRef.current = s;
    setState(s);
  };
  const pushItems = () => setTranscript([...items.current]);

  const ensureAudioEl = () => {
    if (!audioEl.current) {
      const a = document.createElement('audio');
      a.autoplay = true;
      a.playsInline = true;
      a.style.display = 'none';
      document.body.appendChild(a);
      audioEl.current = a;
    }
    return audioEl.current;
  };

  const attach = (track) => {
    const a = ensureAudioEl();
    const cur = a.srcObject && a.srcObject.getAudioTracks && a.srcObject.getAudioTracks()[0];
    if (cur === track) return;
    a.srcObject = new MediaStream([track]);
    a.muted = false;
    a.volume = 1;
    a.play().catch((e) => console.warn('audio play blocked', e));
  };

  const stopAttachWatch = () => {
    clearInterval(attachTimer.current);
    attachTimer.current = null;
  };

  const finish = useCallback(() => {
    const c = clientRef.current;
    if (!c) return;
    clientRef.current = null;
    stopRing.current?.();
    stopRing.current = null;
    stopAttachWatch();
    clearInterval(timer.current);
    levels.current = { mic: 0, bot: 0 };
    setBotSpeaking(false);
    if (stateRef.current !== 'ended') endTone();
    set('ended');
    try {
      c.disconnect();
    } catch {
      /* already closed */
    }
    if (audioEl.current) audioEl.current.srcObject = null;
  }, []);

  const start = useCallback(async () => {
    if (clientRef.current) return;
    items.current = [];
    pendingUser.current = null;
    mutedRef.current = false;
    setTranscript([]);
    setError(null);
    setMuted(false);
    setSeconds(0);
    setBotSpeaking(false);
    set('ringing');
    stopRing.current = startRing();
    ensureAudioEl().play?.().catch(() => {});

    const ringDone = new Promise((r) => setTimeout(r, MIN_RING_MS));
    let readyResolve;
    const botReady = new Promise((r) => {
      readyResolve = r;
    });

    const client = new PipecatClient({
      transport: new SmallWebRTCTransport(),
      enableMic: true,
      enableCam: false,
      callbacks: {
        onBotReady: () => {
          tryAttach();
          readyResolve();
        },
        onTrackStarted: (track, participant) => {
          if (track.kind === 'audio' && track !== client.tracks()?.local?.audio && !participant?.local) attach(track);
        },
        onUserStartedSpeaking: () => {
          const last = items.current[items.current.length - 1];
          if (last && last.role === 'bot') last.done = true;
        },
        onUserTranscript: (d) => {
          const text = (d.text || '').trim();
          if (!text) return;
          const id = pendingUser.current;
          const i = id ? items.current.findIndex((x) => x.id === id) : -1;
          if (i >= 0) {
            items.current[i] = { ...items.current[i], text, live: !d.final };
            if (d.final) pendingUser.current = null;
          } else {
            const item = { id: ++uid, role: 'user', text, live: !d.final };
            if (!d.final) pendingUser.current = item.id;
            items.current.push(item);
          }
          pushItems();
        },
        onBotTranscript: (d) => {
          const text = (d.text || '').trim();
          if (!text) return;
          const last = items.current[items.current.length - 1];
          if (last && last.role === 'bot' && !last.done) {
            items.current[items.current.length - 1] = { ...last, text: `${last.text} ${text}` };
          } else {
            items.current.push({ id: ++uid, role: 'bot', text });
          }
          pushItems();
        },
        onBotStartedSpeaking: () => { 
          tryAttach();
          setBotSpeaking(true);
        },
        onBotStoppedSpeaking: () => setBotSpeaking(false),
        onLocalAudioLevel: (l) => {
          levels.current.mic = l;
        },
        onRemoteAudioLevel: (l) => {
          levels.current.bot = l;
        },
        onDisconnected: () => {
          if (clientRef.current === client) finish();
        },
      },
    });
    clientRef.current = client;

    function tryAttach() {
      try {
        const t = client.tracks()?.bot?.audio;
        if (t) attach(t);
      } catch {
        /* not ready yet */
      }
    }
    stopAttachWatch();
    attachTimer.current = setInterval(tryAttach, 400);

    try {
      await client.connect({ webrtcRequestParams: { endpoint: `${API}/api/offer` } });
      await Promise.all([
        Promise.race([
          botReady,
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), READY_TIMEOUT_MS)),
        ]),
        ringDone,
      ]);
      if (clientRef.current !== client) return;
      tryAttach();
      stopRing.current?.();
      stopRing.current = null;
      connectedChime();
      set('connected');
      timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (e) {
      console.error(e);
      if (clientRef.current === client) {
        setError('Could not reach the agent. Check that the server is running.');
        finish();
      }
    }
  }, [finish]);

  const toggleMute = useCallback(() => {
    const c = clientRef.current;
    if (!c) return;
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    try {
      c.enableMic(!next);
    } catch {
      /* ignore */
    }
  }, []);

  const reset = useCallback(() => {
    if (stateRef.current === 'ended') {
      setError(null);
      set('idle');
    }
  }, []);

  useEffect(() => () => {
    stopRing.current?.();
    clearInterval(timer.current);
    clearInterval(attachTimer.current);
    try {
      clientRef.current?.disconnect();
    } catch {
      /* ignore */
    }
  }, []);

  return { state, transcript, muted, seconds, error, botSpeaking, levels, start, end: finish, toggleMute, reset };
}

export function useClinic(active, onEvent, onActivity) {
  const [doctors, setDoctors] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [online, setOnline] = useState(true);
  const since = useRef(null);
  const cb = useRef(onEvent); const cbA = useRef(onActivity); const sinceA = useRef(null);
  cb.current = onEvent; cbA.current = onActivity;

  useEffect(() => {
    let stop = false;
    let timer;
    const tick = async () => {
      try {
        const [d, a, e, act] = await Promise.all([
          fetch(`${API}/api/doctors`).then((r) => r.json()),
          fetch(`${API}/api/appointments`).then((r) => r.json()),
          fetch(`${API}/api/events?since=${since.current ?? 0}`).then((r) => r.json()), fetch(`${API}/api/activity?since=${sinceA.current ?? 0}`).then((r) => r.json()).catch(() => []),
        ]);
        if (stop) return;
        setDoctors(d);
        setAppointments(a);
        setOnline(true); if (sinceA.current === null) { sinceA.current = act.reduce((m, x) => Math.max(m, x.n), 0); } else { for (const it of act) { sinceA.current = Math.max(sinceA.current, it.n); cbA.current?.(it); } }
        if (since.current === null) {
          since.current = e.reduce((m, x) => Math.max(m, x.n), 0);
        } else {
          for (const ev of e) {
            since.current = Math.max(since.current, ev.n);
            cb.current?.(ev);
          }
        }
      } catch {
        if (!stop) setOnline(false);
      }
      if (!stop) timer = setTimeout(tick, active ? 900 : 3000);
    };
    tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [active]);

  return { doctors, appointments, online };
}





