'use client';

/**
 * Online live view — what the audience opens on their own phones/laptops.
 * Read-only: it follows the big screen through the live server (server/live-server.mjs).
 *   /live/?r=ROOMCODE[&s=https://live-server-address]
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Background, BrandBlock } from '@/components/Brand';
import Bubbles from '@/components/Bubbles';
import Reel from '@/components/Reel';
import { COUNTDOWN_MS, Countdown, WinnerName, celebrate, groupByPrize } from '@/components/Stage';
import { IconFinger, IconGift, IconShield, IconTrophy, Trophy } from '@/components/Icons';
import { type LiveDraw, type LiveSnapshot, type LiveState, liveGet, normalizeServer } from '@/lib/live';
import { fanfare, unlockAudio, whoosh } from '@/lib/sound';
import { DEFAULT_LIVE_SERVER } from '@/lib/config';

type Conn = 'connecting' | 'live' | 'reconnecting' | 'ended' | 'notfound' | 'nolink' | 'waiting';
type Phase = 'idle' | 'countdown' | 'spinning' | 'winner' | 'showcase';
/** Server timing that comes with every message (lets a phone line its clock up with the big screen). */
type Timing = { updatedAt?: number; now?: number };

export default function LivePage() {
  const [conn, setConn] = useState<Conn>('connecting');
  const [snap, setSnap] = useState<LiveSnapshot | null>(null);
  const [viewers, setViewers] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [draw, setDraw] = useState<LiveDraw | null>(null);
  // When the current countdown / reel started on the big screen, in this phone's clock (null = unknown yet).
  const [startAt, setStartAt] = useState<number | null>(null);
  const phaseRef = useRef<Phase>('idle');
  phaseRef.current = phase;
  const [sound, setSound] = useState(false);
  const soundRef = useRef(sound);
  soundRef.current = sound;

  const latest = useRef<LiveSnapshot | null>(null);
  const shownDraw = useRef<string | null>(null);
  const animating = useRef(false);
  const first = useRef(true);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Big-screen clock → this phone's clock (null until a message with timing arrives).
  const toLocal = useRef<((t: number) => number) | null>(null);

  /** Bring the local screen in line with the big screen (outside of a running animation). */
  const follow = useCallback((s: LiveSnapshot) => {
    const { phase: p, draw: d } = s.view;
    const isFirst = first.current;
    first.current = false;

    // A draw is under way that this phone hasn't shown yet: join it at the same point as the big
    // screen (same names, same timing) — also after a refresh — instead of starting over.
    const conv = toLocal.current;
    if (d && d.id !== shownDraw.current && (p === 'countdown' || p === 'spinning')) {
      clearTimeout(syncTimer.current);
      shownDraw.current = d.id;
      setDraw(d);
      const now = Date.now();
      let mode: 'countdown' | 'spinning' = d.countdown && p === 'countdown' ? 'countdown' : 'spinning';
      let at: number | null = null;
      if (conv && p === 'spinning' && d.spinAt) at = conv(d.spinAt);
      else if (conv && mode === 'countdown' && d.countdownAt) {
        at = conv(d.countdownAt);
        if (now - at >= COUNTDOWN_MS) {
          mode = 'spinning';
          at += COUNTDOWN_MS; // close enough; corrected as soon as the reel's own start time arrives
        }
      }
      if (mode === 'spinning' && at !== null && now - at >= d.spinMs) {
        // The reel has already landed on the big screen: just show the result.
        animating.current = false;
        setPhase('winner');
        if (!isFirst) celebrate();
        return;
      }
      animating.current = true;
      setStartAt(at);
      setPhase(mode);
      if (mode === 'spinning' && soundRef.current && (at === null || now - at < 500)) whoosh();
      return;
    }
    // Same draw, still running here: line the reel up with the big screen's start time once known.
    if (animating.current && d && d.id === shownDraw.current && conv && phaseRef.current === 'spinning' && d.spinAt) {
      setStartAt(conv(d.spinAt));
    }
    if (animating.current) return; // let the reel finish; it re-syncs when done

    if (p === 'winner' && d) {
      if (d.id !== shownDraw.current) {
        shownDraw.current = d.id;
        if (!isFirst) celebrate();
      }
      setDraw(d);
      setPhase('winner');
    } else if (p === 'showcase') {
      setPhase('showcase');
    } else if (p === 'idle') {
      setPhase('idle');
      setDraw(null);
    }
  }, []);

  const receive = useCallback(
    (state: LiveState, count?: number, timing?: Timing) => {
      if (typeof count === 'number') setViewers(count);
      // updatedAt (server) − sentAt (big screen) = big screen → server; now (server) vs. our clock = server → us.
      if (state && state.live && state.sentAt && timing?.updatedAt && timing.now) {
        const screenToServer = timing.updatedAt - state.sentAt;
        const serverToLocal = Date.now() - timing.now;
        toLocal.current = (t) => t + screenToServer + serverToLocal;
      }
      if (!state) {
        setConn('waiting');
        return;
      }
      if (!state.live) {
        setConn('ended');
        return;
      }
      setConn('live');
      latest.current = state;
      setSnap(state);
      follow(state);
    },
    [follow],
  );

  /* ------------------------------------------------------- connection */
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const code = (q.get('r') || '').trim().toUpperCase();
    const server = normalizeServer(q.get('s') || DEFAULT_LIVE_SERVER);
    if (!code) {
      setConn('nolink');
      return;
    }

    let es: EventSource | null = null;
    let poll: ReturnType<typeof setInterval> | undefined;
    let fallback: ReturnType<typeof setTimeout> | undefined;
    let closed = false;
    let streaming = false;

    const pollOnce = async () => {
      try {
        const r = await liveGet(server, code);
        receive(r.state, r.viewers, r);
      } catch (e) {
        if (e instanceof Error && /No live draw/.test(e.message)) {
          setConn((c) => (c === 'ended' || c === 'live' || c === 'reconnecting' ? 'ended' : 'notfound'));
          stop();
        } else setConn((c) => (c === 'live' ? 'reconnecting' : c));
      }
    };
    const startPolling = () => {
      if (poll || closed) return;
      void pollOnce();
      poll = setInterval(pollOnce, 3000);
    };
    const stop = () => {
      closed = true;
      es?.close();
      clearInterval(poll);
      clearTimeout(fallback);
    };

    if ('EventSource' in window) {
      es = new EventSource(`${server}/api/rooms/${code}/events`);
      es.onopen = () => {
        streaming = true;
        clearInterval(poll);
        poll = undefined;
      };
      es.onmessage = (ev) => {
        try {
          const m = JSON.parse(ev.data) as { state: LiveState; viewers: number } & Timing;
          receive(m.state, m.viewers, m);
        } catch {
          /* ignore */
        }
      };
      es.onerror = () => {
        if (closed) return;
        streaming = false;
        setConn((c) => (c === 'ended' || c === 'notfound' ? c : c === 'live' ? 'reconnecting' : c));
        // If the stream is blocked (some networks/proxies), fall back to asking every few seconds.
        // (Start the timer once — the browser retries the stream every 2 s and must not keep resetting it.)
        if (!fallback && !poll) {
          fallback = setTimeout(() => {
            fallback = undefined;
            if (!streaming) startPolling();
          }, 4000);
        }
        if (es?.readyState === EventSource.CLOSED) void pollOnce();
      };
    } else startPolling();

    return stop;
  }, [receive]);

  useEffect(() => () => clearTimeout(syncTimer.current), []);

  /* --------------------------------------------------------- the show */
  const onCountdownDone = useCallback(() => {
    // Spin in step with the big screen if its reel start is already known, else start now (re-synced later).
    const d = latest.current?.view.draw;
    const conv = toLocal.current;
    setStartAt(d && d.id === shownDraw.current && d.spinAt && conv ? conv(d.spinAt) : null);
    setPhase('spinning');
    if (soundRef.current) whoosh();
  }, []);

  const onReelDone = useCallback(() => {
    animating.current = false;
    setPhase('winner');
    celebrate();
    if (soundRef.current) fanfare();
    // If the host already moved on, follow after the winner has had its moment.
    syncTimer.current = setTimeout(() => {
      const s = latest.current;
      if (s && !animating.current && s.view.phase !== 'winner') follow(s);
    }, 5000);
  }, [follow]);

  const toggleSound = () => {
    unlockAudio();
    setSound((v) => !v);
  };

  /* ------------------------------------------------------------ render */
  if (!snap) {
    return (
      <main className="stage">
        <Background />
        <div className="live-msg">
          <Trophy className="trophy" />
          <h1>{MESSAGES[conn].title}</h1>
          <p>{MESSAGES[conn].text}</p>
        </div>
      </main>
    );
  }

  const b = snap.brand;
  // While this phone is still counting down / spinning, its winner stays a secret here too —
  // even if the big screen (a moment ahead) has already revealed it.
  const hiddenId = (phase === 'countdown' || phase === 'spinning') && draw ? draw.id : null;
  const boardWinners = hiddenId ? snap.winners.filter((w) => w.id !== hiddenId) : snap.winners;
  const showBoard = boardWinners.length > 0 && phase !== 'showcase';
  const statusLabel = conn === 'live' ? 'LIVE' : conn === 'ended' || conn === 'notfound' ? 'ENDED' : 'RECONNECTING…';

  return (
    <main className="stage live-view">
      <Background />
      {snap.names.length > 0 && <Bubbles names={snap.names} visible={phase === 'idle'} />}

      <header className="topbar">
        <BrandBlock eventTitle={b.eventTitle} company={b.company} logo={b.logo} display={b.display} />
        <div className="top-actions">
          <span className={`pill live-status ${conn}`}>
            <span className="live-dot" /> {statusLabel}
          </span>
          {viewers > 1 && <span className="pill hide-sm">👀 {viewers.toLocaleString()} watching</span>}
          <button className="icon-btn" onClick={toggleSound} title={sound ? 'Sound on' : 'Sound off'} aria-label={sound ? 'Turn sound off' : 'Turn sound on'}>
            {sound ? '🔊' : '🔇'}
          </button>
        </div>
      </header>

      <div className={`stage-body${showBoard ? ' with-board' : ''}`}>
        <section className="center">
          <AnimatePresence mode="wait">
            {phase === 'idle' && (
              <motion.div key="idle" className="hero" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
                <span className="kicker">{conn === 'ended' ? 'The draw has ended' : snap.prize.ok ? 'Now drawing' : 'Draw complete'}</span>
                <span className="prize-pill">
                  <IconGift /> {snap.prize.current}
                  {snap.prize.qty > 1 && snap.prize.ok && (
                    <span className="prize-left">
                      {snap.prize.left} of {snap.prize.qty} left
                    </span>
                  )}
                </span>
                <h1 className="title">
                  <span className="grad-text">{b.eventTitle}</span>
                </h1>
                <p className="subtitle">{b.eventSubtitle}</p>
                <div className="stats">
                  <div className="stat">
                    <b>{snap.counts.entries.toLocaleString()}</b>
                    <span>Entries</span>
                  </div>
                  <div className="stat">
                    <b>{snap.counts.eligible.toLocaleString()}</b>
                    <span>In the draw</span>
                  </div>
                  <div className="stat">
                    <b>{snap.counts.winners}</b>
                    <span>Winners</span>
                  </div>
                </div>
                <span className="hint">You&apos;re watching live — the next draw appears here automatically.</span>
              </motion.div>
            )}

            {phase === 'countdown' && draw && (
              <motion.div key={`count-${draw.id}`} className="spin-wrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <span className="prize-pill">
                  <IconGift /> {draw.prize}
                </span>
                <Countdown sound={sound} onDone={onCountdownDone} startedAtMs={startAt} />
                <span className="picking">Get ready…</span>
              </motion.div>
            )}

            {phase === 'spinning' && draw && (
              <motion.div key={`spin-${draw.id}`} className="spin-wrap" initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }}>
                <span className="prize-pill">
                  <IconGift /> {draw.prize}
                </span>
                <Reel
                  items={draw.reel}
                  winIndex={draw.winIndex}
                  durationMs={draw.spinMs}
                  startedAtMs={startAt}
                  sound={sound}
                  onDone={onReelDone}
                />
                <span className="picking">
                  Picking <b>1</b> lucky winner from <b>{draw.pool.toLocaleString()}</b> participants…
                </span>
              </motion.div>
            )}

            {phase === 'winner' && draw && (
              <motion.div
                key={`win-${draw.id}`}
                className="winner-card"
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 160, damping: 16 }}
              >
                <div className="rays" />
                <Trophy className="trophy" />
                <span className="prize-pill">
                  <IconGift /> {draw.prize}
                </span>
                <div className="congrats">🎉 Congratulations!</div>
                <WinnerName name={draw.name} colors={b.nameColors} />
                {(draw.ticket || draw.group) && (
                  <div className="winner-meta">
                    {draw.ticket && <span className="meta-chip">🎟️ {draw.ticket}</span>}
                    {draw.group && <span className="meta-chip">📍 {draw.group}</span>}
                  </div>
                )}
                <div className="verify">
                  Draw #{draw.drawNo} · {new Date(draw.at).toLocaleTimeString()} · 1 of {draw.pool.toLocaleString()} · Pool {draw.fingerprint}
                </div>
              </motion.div>
            )}

            {phase === 'showcase' && (
              <motion.div key="showcase" className="showcase" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Trophy className="trophy" />
                <h1 className="title">
                  <span className="grad-text">Our winners</span>
                </h1>
                <div className="showcase-grid">
                  {groupByPrize(snap.winners, snap.prizes).map(([prize, ws]) => (
                    <section key={prize} className="showcase-group">
                      <h2>
                        <IconGift /> {prize}
                      </h2>
                      <ol>
                        {ws.map((w) => (
                          <li key={w.id}>
                            <span className="who">{w.name}</span>
                            {(w.ticket || w.group) && <span className="what">{[w.ticket, w.group].filter(Boolean).join(' · ')}</span>}
                          </li>
                        ))}
                      </ol>
                    </section>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {showBoard && (
          <aside className="board" aria-label="Winners">
            <h2>
              <IconTrophy /> Winners
            </h2>
            <ol>
              {boardWinners.map((w) => (
                <li key={w.id}>
                  <span className="no">{w.drawNo}</span>
                  <div style={{ minWidth: 0 }}>
                    <div className="who">{w.name}</div>
                    <div className="what">
                      {w.prize}
                      {w.ticket ? ` · ${w.ticket}` : ''}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </aside>
        )}
      </div>

      <footer className="trust">
        <span>
          <IconShield /> Live from the event — results are decided on the big screen
        </span>
        <span>
          <IconFinger /> Pool fingerprint <code>{snap.fingerprint || '····-····-····'}</code>
        </span>
      </footer>
    </main>
  );
}

const MESSAGES: Record<Conn, { title: string; text: string }> = {
  connecting: { title: 'Connecting…', text: 'Joining the live draw.' },
  live: { title: 'Connecting…', text: 'Joining the live draw.' },
  reconnecting: { title: 'Reconnecting…', text: 'Lost the connection for a moment — trying again.' },
  waiting: { title: 'Starting soon', text: 'The live draw hasn’t started yet. Keep this page open — it starts by itself.' },
  ended: { title: 'The live draw has ended', text: 'Thanks for watching!' },
  notfound: { title: 'Live draw not found', text: 'This link has expired or is mistyped. Ask the organisers for the current link or QR code.' },
  nolink: { title: 'Scan the QR code', text: 'Open the link or scan the QR code shown at the event to watch the draw live.' },
};
