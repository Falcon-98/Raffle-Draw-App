'use client';

/**
 * Online live view — what the audience opens on their own phones/laptops.
 * Read-only: it follows the big screen through the live server (server/live-server.mjs).
 *   /live/?r=ROOMCODE[&s=https://live-server-address]
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Background, BrandBlock, EventTitle } from '@/components/Brand';
import Bubbles from '@/components/Bubbles';
import Reel from '@/components/Reel';
import { COUNTDOWN_MS, Countdown, WinnerMeta, WinnerName, byPrizeRank, celebrate, groupByPrize, metaLine } from '@/components/Stage';
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
  // Server → phone clock offsets seen recently. The smallest is the real offset: a message that
  // arrives late (iPhone Safari hands over everything it received while the phone was locked or the
  // app was in the background, all at once) has a bigger one and must not look brand new.
  const offsets = useRef<{ at: number; v: number }[]>([]);
  const catchUp = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // When the countdown / reel running on this phone should be over (phone clock).
  const animEnd = useRef(0);

  /** Bring the local screen in line with the big screen (outside of a running animation). */
  const follow = useCallback((s: LiveSnapshot, quiet = false) => {
    const { phase: p, draw: d } = s.view;
    const isFirst = first.current || quiet;
    first.current = false;

    // An animation that should have finished long ago (the phone was asleep) never holds the screen.
    if (animating.current && Date.now() > animEnd.current + 2500) {
      animating.current = false;
      clearTimeout(syncTimer.current);
    }
    // The winner being drawn here was removed in the admin (undo / clear all): the big screen has left
    // that draw and it is not among the winners any more — stop and follow the big screen.
    const removed =
      !!shownDraw.current && (!d || d.id !== shownDraw.current) && !s.winners.some((w) => w.id === shownDraw.current);
    if (removed && (animating.current || phaseRef.current === 'winner')) {
      animating.current = false;
      clearTimeout(syncTimer.current);
      shownDraw.current = null;
      if (p !== 'countdown' && p !== 'spinning') {
        setDraw(null);
        setPhase(p === 'showcase' ? 'showcase' : 'idle');
      }
    }

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
      animEnd.current = (at ?? now) + (mode === 'countdown' ? COUNTDOWN_MS : 0) + d.spinMs;
      setStartAt(at);
      setPhase(mode);
      if (mode === 'spinning' && soundRef.current && !quiet && (at === null || now - at < 500)) whoosh();
      return;
    }
    // Same draw, still running here: line the reel up with the big screen's start time once known.
    if (animating.current && d && d.id === shownDraw.current && conv && phaseRef.current === 'spinning' && d.spinAt) {
      setStartAt(conv(d.spinAt));
      animEnd.current = Math.max(animEnd.current, conv(d.spinAt) + d.spinMs);
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

  /** Jump straight to what the big screen shows now: no replay of anything missed, no confetti. */
  const resync = useCallback(() => {
    clearTimeout(catchUp.current);
    const s = latest.current;
    if (!s) return;
    const d = s.view.draw;
    // Only drop an animation that is really out of date (well past its end, or another draw is under
    // way). The big screen landing a moment earlier is normal: the phone finishes its own spin first,
    // so it never shows the winner before its reel has stopped.
    const otherDraw = !!d && d.id !== shownDraw.current && (s.view.phase === 'countdown' || s.view.phase === 'spinning');
    if (animating.current && (otherDraw || Date.now() > animEnd.current + 2500)) {
      animating.current = false;
      clearTimeout(syncTimer.current);
    }
    follow(s, true);
  }, [follow]);

  const receive = useCallback(
    (state: LiveState, count?: number, timing?: Timing) => {
      if (typeof count === 'number') setViewers(count);
      let late = 0;
      if (timing?.now) {
        const now = Date.now();
        offsets.current = [...offsets.current.filter((o) => now - o.at < 10 * 60_000).slice(-49), { at: now, v: now - timing.now }];
        const serverToLocal = Math.min(...offsets.current.map((o) => o.v));
        late = now - timing.now - serverToLocal; // how long this message was on its way (beyond normal)
        // updatedAt (server) − sentAt (big screen) = big screen → server; server → us from the offset above.
        if (state && state.live && state.sentAt && timing.updatedAt) {
          const screenToServer = timing.updatedAt - state.sentAt;
          toLocal.current = (t) => t + screenToServer + serverToLocal;
        }
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
      if (late > 1500) {
        // A backlog delivered after the phone woke up: let it finish arriving, then show only the
        // newest state — never start a countdown or reel from old news.
        clearTimeout(catchUp.current);
        catchUp.current = setTimeout(resync, 400);
        return;
      }
      follow(state);
    },
    [follow, resync],
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

    // Back from a locked phone / another app / a restored tab: drop anything stale, ask for the
    // current screen straight away instead of waiting for the stream to catch up.
    const wake = () => {
      if (document.visibilityState !== 'visible' || closed) return;
      resync();
      void pollOnce();
    };
    const onShow = (e: PageTransitionEvent) => e.persisted && wake();
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('pageshow', onShow);
    window.addEventListener('focus', wake);
    window.addEventListener('online', wake);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('pageshow', onShow);
      window.removeEventListener('focus', wake);
      window.removeEventListener('online', wake);
    };
  }, [receive, resync]);

  useEffect(
    () => () => {
      clearTimeout(syncTimer.current);
      clearTimeout(catchUp.current);
    },
    [],
  );

  /* --------------------------------------------------------- the show */
  // (Both ignore a countdown / reel that is only still on screen while it fades out.)
  const onCountdownDone = useCallback(() => {
    if (phaseRef.current !== 'countdown') return;
    // Spin in step with the big screen if its reel start is already known, else start now (re-synced later).
    const d = latest.current?.view.draw;
    const conv = toLocal.current;
    const at = d && d.id === shownDraw.current && d.spinAt && conv ? conv(d.spinAt) : null;
    animEnd.current = (at ?? Date.now()) + (d?.spinMs ?? 15000);
    setStartAt(at);
    setPhase('spinning');
    if (soundRef.current) whoosh();
  }, []);

  const onReelDone = useCallback(() => {
    if (phaseRef.current !== 'spinning' || !animating.current) return;
    animating.current = false;
    phaseRef.current = 'winner';
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
  // Prize order (1st, 2nd, 3rd …), as on the big screen.
  const boardWinners = byPrizeRank(hiddenId ? snap.winners.filter((w) => w.id !== hiddenId) : snap.winners, snap.prizes);
  const showBoard = boardWinners.length > 0 && phase !== 'showcase';
  const statusLabel = conn === 'live' ? 'LIVE' : conn === 'ended' || conn === 'notfound' ? 'ENDED' : 'RECONNECTING…';
  const totals = snap.prize.totals; // missing from older display versions
  const finished = !!totals && totals.total > 0 && totals.left === 0;

  return (
    <main className="stage live-view">
      <Background />
      {snap.names.length > 0 && <Bubbles names={snap.names} visible={phase === 'idle'} seconds={6} />}

      <header className="topbar">
        {b.showBrand !== false ? <BrandBlock eventTitle={b.eventTitle} company={b.company} logo={b.logo} display={b.display} /> : <span />}
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
                {/* Same as the big screen: the prize block can be hidden in the admin (end-of-draw messages always show). */}
                {(conn === 'ended' || finished || b.showPrize !== false) && (
                  <>
                    <span className="kicker">{conn === 'ended' ? 'The draw has ended' : finished ? 'The draw is complete' : snap.prize.ok ? 'Now drawing' : 'Draw complete'}</span>
                    {finished ? (
                      <span className="prize-pill">
                        <IconTrophy /> All {totals.total} prizes drawn
                      </span>
                    ) : (
                      <span className="prize-pill">
                        <IconGift /> {snap.prize.current}
                        {snap.prize.qty > 1 && snap.prize.ok && (
                          <span className="prize-left">
                            {snap.prize.left} of {snap.prize.qty} left
                          </span>
                        )}
                      </span>
                    )}
                    {totals && totals.total > 1 && !finished && snap.prize.ok && snap.prizes.includes(snap.prize.current) && (
                      <span className="prize-count">
                        Prize {totals.drawn + 1} of {totals.total}
                      </span>
                    )}
                  </>
                )}
                <EventTitle title={b.eventTitle} logo={b.eventLogo} show={b.titleDisplay ?? 'text'} />
                <p className="subtitle">{finished ? 'Thank you for joining us — congratulations to all our winners!' : b.eventSubtitle}</p>
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
                    <b>{totals?.total ? totals.left : snap.counts.winners}</b>
                    <span>{totals?.total ? 'Prizes left' : 'Winners'}</span>
                  </div>
                </div>
                {!!totals?.total && (
                  <div className="progress" aria-label={`${totals.drawn} of ${totals.total} prizes drawn`}>
                    <span style={{ width: `${(totals.drawn / totals.total) * 100}%` }} />
                  </div>
                )}
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
                <WinnerMeta code={draw.ticket} org={draw.group} />
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
                            {metaLine(w) && <span className="what">{metaLine(w)}</span>}
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
                  <div style={{ minWidth: 0 }}>
                    <div className="who">{w.name}</div>
                    <div className="what">
                      {w.prize}
                      {w.group ? ` · ${w.group}` : ''}
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
