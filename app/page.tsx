'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import confetti from 'canvas-confetti';
import { AnimatePresence, motion } from 'framer-motion';
import { Background, BrandBlock } from '@/components/Brand';
import Bubbles from '@/components/Bubbles';
import Reel from '@/components/Reel';
import {
  IconExpand,
  IconFinger,
  IconGift,
  IconLock,
  IconSettings,
  IconShield,
  IconTrophy,
  IconVolumeOff,
  Trophy,
} from '@/components/Icons';
import {
  type DisplayPhase,
  type RaffleState,
  type Winner,
  activeWinners,
  canDrawPrize,
  eligible,
  loadState,
  nextPrize,
  prizeLeft,
  prizeQty,
  sendCommand,
  uid,
  useCommands,
  useRaffle,
} from '@/lib/store';
import { poolFingerprint, secureRandomInt } from '@/lib/fair';
import { audioReady, fanfare, tick, unlockAudio, whoosh } from '@/lib/sound';

const COLORS = ['#ff3d8b', '#8b5cf6', '#22d3ee', '#ffc542', '#34d399', '#ffffff'];

function celebrate() {
  const end = Date.now() + 2600;
  confetti({ particleCount: 160, spread: 100, startVelocity: 55, origin: { y: 0.55 }, colors: COLORS, zIndex: 60 });
  (function frame() {
    confetti({ particleCount: 5, angle: 60, spread: 60, origin: { x: 0, y: 0.75 }, colors: COLORS, zIndex: 60 });
    confetti({ particleCount: 5, angle: 120, spread: 60, origin: { x: 1, y: 0.75 }, colors: COLORS, zIndex: 60 });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
  setTimeout(() => {
    confetti({ particleCount: 90, spread: 360, startVelocity: 30, ticks: 120, origin: { x: 0.3, y: 0.3 }, shapes: ['star'], colors: ['#ffc542', '#fff3b0'], zIndex: 60 });
    confetti({ particleCount: 90, spread: 360, startVelocity: 30, ticks: 120, origin: { x: 0.7, y: 0.3 }, shapes: ['star'], colors: ['#ffc542', '#fff3b0'], zIndex: 60 });
  }, 700);
}

export default function DisplayPage() {
  const { state, update } = useRaffle();
  const [phase, setPhase] = useState<DisplayPhase>('idle');
  const [current, setCurrent] = useState<Winner | null>(null);
  const [reelPool, setReelPool] = useState<string[]>([]);
  const [fp, setFp] = useState('');
  const [toast, setToast] = useState('');
  const [soundOk, setSoundOk] = useState(true);
  const [help, setHelp] = useState(false);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const pool = useMemo(() => (state ? eligible(state) : []), [state]);
  const names = useMemo(() => pool.map((p) => p.name), [pool]);
  const settings = state?.settings;

  useEffect(() => {
    let alive = true;
    poolFingerprint(pool).then((v) => alive && setFp(v));
    return () => {
      alive = false;
    };
  }, [pool]);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3200);
  }, []);

  /* ---------------------------------------------------------- the draw */
  const startDraw = useCallback(async (requestId: string = uid()) => {
    if (phaseRef.current === 'spinning' || phaseRef.current === 'countdown') return;
    const prev = phaseRef.current;
    phaseRef.current = 'spinning';

    // Pick and save the winner. If more than one display window is open, they all receive the
    // admin's draw command: the lock makes them take turns, and the second one finds the record
    // the first one saved for the same request and shows that instead of drawing again.
    const pick = async () => {
      const s = loadState(); // always draw from the freshest saved list
      const p = eligible(s);
      const existing = s.winners.find((w) => w.requestId === requestId);
      if (existing) return { s, p, record: existing };
      if (!p.length || !canDrawPrize(s)) return { s, p, record: null };
      const fingerprint = await poolFingerprint(p);
      const chosen = p[secureRandomInt(p.length)];
      const record: Winner = {
        id: uid(),
        participantId: chosen.id,
        name: chosen.name,
        ticket: chosen.ticket,
        group: chosen.group,
        prize: s.settings.currentPrize,
        at: new Date().toISOString(),
        drawNo: s.winners.reduce((m, w) => Math.max(m, w.drawNo), 0) + 1,
        pool: p.length,
        fingerprint,
        requestId,
      };
      // Lock the result in BEFORE the animation, so it can't be re-rolled.
      update((st) => {
        const next: RaffleState = { ...st, winners: [...st.winners, record] };
        // That was the last of this prize: line up the next prize that has some left.
        if (next.settings.autoAdvance && next.settings.prizes.includes(record.prize) && prizeLeft(next, record.prize) <= 0) {
          const np = nextPrize(next, record.prize);
          if (np) next.settings = { ...next.settings, currentPrize: np };
        }
        return next;
      });
      return { s, p, record };
    };
    const { s, p, record } = navigator.locks
      ? await navigator.locks.request('click2026:draw', pick)
      : await pick();

    if (!record) {
      phaseRef.current = prev;
      flash(
        !s.participants.length
          ? 'No participants yet — add names in the admin panel.'
          : !p.length
            ? 'Everyone has already won or is excluded.'
            : `All “${s.settings.currentPrize}” prizes have been drawn. Pick another prize in the admin panel.`,
      );
      return;
    }

    const names = p.length ? p : s.participants;
    const sample = names.length > 400 ? Array.from({ length: 400 }, () => names[Math.floor(Math.random() * names.length)].name) : names.map((x) => x.name);
    setReelPool(sample);
    setCurrent(record);
    if (s.settings.countdown) {
      phaseRef.current = 'countdown';
      setPhase('countdown');
    } else {
      setPhase('spinning');
      if (s.settings.sound) whoosh();
    }
  }, [flash, update]);

  const onCountdownDone = useCallback(() => {
    phaseRef.current = 'spinning';
    setPhase('spinning');
    if (loadState().settings.sound) whoosh();
  }, []);

  const onReelDone = useCallback(() => {
    setPhase('winner');
    celebrate();
    if (loadState().settings.sound) fanfare();
  }, []);

  const resetView = useCallback(() => {
    if (phaseRef.current === 'spinning' || phaseRef.current === 'countdown') return;
    setPhase('idle');
    setCurrent(null);
  }, []);

  /** Full-screen list of every winner — for the end of the event. */
  const toggleShowcase = useCallback((force?: boolean) => {
    if (phaseRef.current === 'spinning' || phaseRef.current === 'countdown') return;
    const open = force ?? phaseRef.current !== 'showcase';
    if (open && !activeWinners(loadState()).length) return;
    setCurrent(null);
    setPhase(open ? 'showcase' : 'idle');
    if (open) celebrate();
  }, []);

  /* ----------------------------------------------- admin ↔ display link */
  useCommands((cmd) => {
    if (cmd.type === 'draw') void startDraw(cmd.requestId);
    else if (cmd.type === 'reset-view') resetView();
    else if (cmd.type === 'confetti') celebrate();
    else if (cmd.type === 'showcase') toggleShowcase(true);
    else if (cmd.type === 'ping') sendCommand({ type: 'status', phase: phaseRef.current, at: Date.now() });
  });

  useEffect(() => {
    const beat = () => sendCommand({ type: 'status', phase, at: Date.now() });
    beat();
    const t = setInterval(beat, 1500);
    return () => clearInterval(t);
  }, [phase]);

  /* --------------------------------------------------------- keyboard */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,textarea,select')) return;
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        unlockAudio();
        void startDraw();
      } else if (e.key === 'Escape') {
        setHelp(false);
        resetView();
      } else if (e.key.toLowerCase() === 'f') toggleFullscreen();
      else if (e.key.toLowerCase() === 'w') toggleShowcase();
      else if (e.key.toLowerCase() === 'm') update((st) => ({ ...st, settings: { ...st.settings, sound: !st.settings.sound } }));
      else if (e.key === '?' || e.key.toLowerCase() === 'h') setHelp((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [startDraw, resetView, toggleShowcase, update]);

  // Audio needs one interaction with this window.
  useEffect(() => {
    const check = () => setSoundOk(audioReady());
    const unlock = () => {
      unlockAudio();
      setTimeout(check, 100);
    };
    window.addEventListener('pointerdown', unlock);
    const t = setTimeout(check, 800);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      clearTimeout(t);
    };
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  };

  /* ------------------------------------------------------------ render */
  if (!state || !settings) {
    return (
      <main className="stage">
        <Background />
      </main>
    );
  }

  const drawing = phase === 'countdown' || phase === 'spinning';
  // Keep the winner being drawn off the board until it is revealed.
  const shownWinners = activeWinners(state).filter((w) => !(drawing && current && w.id === current.id));
  const showBoard = settings.showWinnersBoard && shownWinners.length > 0 && phase !== 'showcase';
  const total = state.participants.length;
  const prizeOk = canDrawPrize(state);
  const listed = settings.prizes.includes(settings.currentPrize);
  const qty = listed ? prizeQty(state, settings.currentPrize) : 1;
  const left = listed ? prizeLeft(state, settings.currentPrize) : 1;

  return (
    <main className="stage">
      <Background />
      {settings.showBubbles && names.length > 0 && <Bubbles names={names} visible={phase === 'idle'} />}

      <header className="topbar">
        <BrandBlock eventTitle={settings.eventTitle} logo={settings.logo} />
        <div className="top-actions">
          <span className="pill hide-sm">
            <span className="live-dot" /> LIVE DRAW
          </span>
          <span className="pill">
            <IconUsersSmall /> {pool.length.toLocaleString()} <span className="hide-sm">in the draw</span>
          </span>
          <button className="icon-btn hide-sm" onClick={toggleFullscreen} title="Full screen (F)" aria-label="Full screen">
            <IconExpand />
          </button>
          <Link className="icon-btn ghost" href="/admin/" title="Admin panel" aria-label="Admin panel">
            <IconSettings />
          </Link>
        </div>
      </header>

      <div className={`stage-body${showBoard ? ' with-board' : ''}`}>
        <section className="center">
          <AnimatePresence mode="wait">
            {phase === 'idle' && (
              <motion.div
                key="idle"
                className="hero"
                initial={{ opacity: 0, y: 30, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20, scale: 0.97 }}
                transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
              >
                <span className="kicker">{prizeOk ? 'Now drawing' : 'Draw complete'}</span>
                <span className="prize-pill">
                  <IconGift /> {settings.currentPrize}
                  {qty > 1 && prizeOk && <span className="prize-left">{left} of {qty} left</span>}
                </span>
                <h1 className="title">
                  <span className="grad-text">{settings.eventTitle}</span>
                </h1>
                <p className="subtitle">{settings.eventSubtitle}</p>

                {total === 0 ? (
                  <div className="empty-card">Waiting for participants… The draw opens as soon as names are added in the admin panel.</div>
                ) : (
                  <>
                    <div className="stats">
                      <div className="stat">
                        <b>{total.toLocaleString()}</b>
                        <span>Entries</span>
                      </div>
                      <div className="stat">
                        <b>{pool.length.toLocaleString()}</b>
                        <span>In the draw</span>
                      </div>
                      <div className="stat">
                        <b>{activeWinners(state).length}</b>
                        <span>Winners</span>
                      </div>
                    </div>
                    <button
                      className="draw-btn"
                      disabled={!pool.length || !prizeOk}
                      onClick={() => {
                        unlockAudio();
                        void startDraw();
                      }}
                    >
                      {prizeOk ? 'Start the draw' : 'All prizes drawn'}
                    </button>
                    <span className="hint hide-sm">
                      or press <kbd>Space</kbd>
                    </span>
                  </>
                )}
              </motion.div>
            )}

            {phase === 'countdown' && current && (
              <motion.div
                key={`count-${current.id}`}
                className="spin-wrap"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                <span className="prize-pill">
                  <IconGift /> {current.prize}
                </span>
                <Countdown sound={settings.sound} onDone={onCountdownDone} />
                <span className="picking">Get ready…</span>
              </motion.div>
            )}

            {phase === 'showcase' && (
              <motion.div
                key="showcase"
                className="showcase"
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.5 }}
              >
                <Trophy className="trophy" />
                <h1 className="title">
                  <span className="grad-text">Our winners</span>
                </h1>
                <div className="showcase-grid">
                  {groupByPrize(activeWinners(state), settings.prizes).map(([prize, ws]) => (
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
                <span className="hint hide-sm">
                  Press <kbd>Esc</kbd> to go back
                </span>
              </motion.div>
            )}

            {phase === 'spinning' && current && (
              <motion.div
                key={`spin-${current.id}`}
                className="spin-wrap"
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.05 }}
                transition={{ duration: 0.4 }}
              >
                <span className="prize-pill">
                  <IconGift /> {current.prize}
                </span>
                <Reel
                  pool={reelPool}
                  winnerName={current.name}
                  durationMs={settings.spinSeconds * 1000}
                  sound={settings.sound}
                  onDone={onReelDone}
                />
                <span className="picking">
                  Picking <b>1</b> lucky winner from <b>{current.pool.toLocaleString()}</b> participants…
                </span>
              </motion.div>
            )}

            {phase === 'winner' && current && (
              <motion.div
                key={`win-${current.id}`}
                className="winner-card"
                initial={{ opacity: 0, scale: 0.6, rotateX: 25 }}
                animate={{ opacity: 1, scale: 1, rotateX: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 160, damping: 16 }}
              >
                <div className="rays" />
                <motion.div initial={{ y: -40, opacity: 0, rotate: -20 }} animate={{ y: 0, opacity: 1, rotate: 0 }} transition={{ delay: 0.15, type: 'spring' }}>
                  <Trophy className="trophy" />
                </motion.div>
                <span className="prize-pill">
                  <IconGift /> {current.prize}
                </span>
                <div className="congrats">🎉 Congratulations!</div>
                <WinnerName name={current.name} />
                {(current.ticket || current.group) && (
                  <div className="winner-meta">
                    {current.ticket && <span className="meta-chip">🎟️ {current.ticket}</span>}
                    {current.group && <span className="meta-chip">📍 {current.group}</span>}
                  </div>
                )}
                <div className="verify">
                  Draw #{current.drawNo} · {new Date(current.at).toLocaleTimeString()} · 1 of {current.pool.toLocaleString()} · Pool {current.fingerprint}
                </div>
                <button className="next-btn" onClick={resetView}>
                  Continue
                </button>
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
              <AnimatePresence initial={false}>
                {[...shownWinners].reverse().map((w) => (
                  <motion.li key={w.id} layout initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
                    <span className="no">{w.drawNo}</span>
                    <div style={{ minWidth: 0 }}>
                      <div className="who">{w.name}</div>
                      <div className="what">
                        {w.prize}
                        {w.ticket ? ` · ${w.ticket}` : ''}
                      </div>
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ol>
          </aside>
        )}
      </div>

      <footer className="trust">
        <span>
          <IconShield /> Fair &amp; transparent draw
        </span>
        <span>
          <IconLock /> Certified random (Web Crypto)
        </span>
        <span title="A fingerprint of the current eligible list. It only changes if someone is added or removed.">
          <IconFinger /> Pool fingerprint <code>{fp || '····-····-····'}</code>
        </span>
        <span className="hide-sm">
          <IconShield /> Each result is locked before the reel spins
        </span>
      </footer>

      {settings.sound && !soundOk && (
        <button className="pill sound-chip" onClick={() => { unlockAudio(); setTimeout(() => setSoundOk(audioReady()), 100); }}>
          <IconVolumeOff style={{ width: 14, height: 14 }} /> Click to enable sound
        </button>
      )}

      <button className="pill help-chip hide-sm" onClick={() => setHelp((v) => !v)} aria-label="Keyboard shortcuts">
        <kbd>?</kbd> Shortcuts
      </button>

      <AnimatePresence>
        {help && (
          <motion.div className="help-panel" role="dialog" aria-label="Keyboard shortcuts" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}>
            <h3>Keyboard shortcuts</h3>
            <dl>
              <dt><kbd>Space</kbd> / <kbd>Enter</kbd></dt><dd>Draw a winner</dd>
              <dt><kbd>Esc</kbd></dt><dd>Back to the welcome screen</dd>
              <dt><kbd>F</kbd></dt><dd>Full screen</dd>
              <dt><kbd>W</kbd></dt><dd>Show all winners</dd>
              <dt><kbd>M</kbd></dt><dd>Sound {settings.sound ? 'off' : 'on'}</dd>
              <dt><kbd>?</kbd></dt><dd>Show / hide this list</dd>
            </dl>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div className="toast" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}>
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

/** Letters spring in one by one; words never break mid-word; long names shrink to fit. */
function WinnerName({ name }: { name: string }) {
  const chars = Array.from(name);
  const n = chars.length;
  // Aim for one line inside the card; very long names wrap between words.
  const vw = Math.min(8, 96 / Math.max(n, 1));
  let idx = 0;
  return (
    <h2 className="winner-name" aria-label={name} style={{ fontSize: `clamp(34px, ${vw.toFixed(2)}vw, 104px)` }}>
      {name.split(' ').map((word, wi, words) => (
        <span key={wi} className="word">
          {Array.from(word + (wi < words.length - 1 ? ' ' : '')).map((ch) => {
            const i = idx++;
            return (
              <motion.span
                key={i}
                className="ch"
                style={{
                  backgroundSize: `${n * 100}% 100%`,
                  backgroundPosition: `${n > 1 ? (i / (n - 1)) * 100 : 0}% 0`,
                }}
                initial={{ opacity: 0, y: 40, scale: 0.5 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: 0.3 + i * 0.035, type: 'spring', stiffness: 260, damping: 14 }}
              >
                {ch}
              </motion.span>
            );
          })}
        </span>
      ))}
    </h2>
  );
}

function IconUsersSmall() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 4.5a3.5 3.5 0 0 1 0 7" />
      <path d="M18.5 14a6.5 6.5 0 0 1 3 6" />
    </svg>
  );
}

/** Winners grouped by prize, in the order of the prize list (other prizes after). */
function groupByPrize(ws: Winner[], order: string[]): [string, Winner[]][] {
  const map = new Map<string, Winner[]>();
  for (const p of order) map.set(p, []);
  for (const w of [...ws].sort((a, b) => a.drawNo - b.drawNo)) {
    if (!map.has(w.prize)) map.set(w.prize, []);
    map.get(w.prize)!.push(w);
  }
  return [...map].filter(([, list]) => list.length > 0);
}

/** Big 3-2-1 before the reel. The winner is already locked in; this is only suspense. */
function Countdown({ sound, onDone }: { sound: boolean; onDone: () => void }) {
  const [n, setN] = useState(3);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    if (sound) tick(0.2);
    if (n === 0) {
      doneRef.current();
      return;
    }
    const t = setTimeout(() => setN((v) => v - 1), 900);
    return () => clearTimeout(t);
  }, [n, sound]);
  return (
    <div className="countdown" aria-live="assertive">
      <AnimatePresence mode="popLayout">
        {n > 0 && (
          <motion.span
            key={n}
            className="grad-text"
            initial={{ scale: 2.2, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.4, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 220, damping: 16 }}
          >
            {n}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}
