'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { Background, BrandBlock, EventTitle } from '@/components/Brand';
import Bubbles from '@/components/Bubbles';
import Reel, { buildReel } from '@/components/Reel';
import Screen from '@/components/Screen';
import { Countdown, WinnerMeta, WinnerName, bindConfetti, byPrizeRank, celebrate, groupByPrize, metaLine } from '@/components/Stage';
import QrCode from '@/components/QrCode';
import { type DrawShow, normalizeServer, useLivePublisher, viewerUrl } from '@/lib/live';
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
  type ScreenSettings,
  type WinInfo,
  type Winner,
  activeWinners,
  canDrawPrize,
  eligible,
  loadState,
  nextPrize,
  prizeLeft,
  prizeQty,
  prizeTotals,
  sendCommand,
  uid,
  useCommands,
  useRaffle,
} from '@/lib/store';
import { poolFingerprint, secureRandomInt } from '@/lib/fair';
import { audioReady, fanfare, unlockAudio, whoosh } from '@/lib/sound';

export default function DisplayPage() {
  const { state, update } = useRaffle();
  const [phase, setPhase] = useState<DisplayPhase>('idle');
  const [current, setCurrent] = useState<Winner | null>(null);
  // The show for the current draw: the exact reel sequence and when each part started
  // (also sent to the online live view, so phones show the same names in sync).
  const [show, setShow] = useState<DrawShow | null>(null);
  const [fp, setFp] = useState('');
  const [toast, setToast] = useState('');
  const [soundOk, setSoundOk] = useState(true);
  const [help, setHelp] = useState(false);
  const boardRef = useRef<HTMLOListElement>(null);
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

  // Online live view: send what is on this screen to viewers' own devices.
  useLivePublisher(state, { phase, current, show, fingerprint: fp });

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3200);
  }, []);

  const setScreen = useCallback(
    (fn: (sc: ScreenSettings) => Partial<ScreenSettings>) =>
      update((st) => ({ ...st, settings: { ...st.settings, screen: { ...st.settings.screen, ...fn(st.settings.screen) } } })),
    [update],
  );

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
        first: chosen.first,
        last: chosen.last,
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
          const np = nextPrize(next);
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
            : prizeTotals(s).left === 0
              ? `All ${prizeTotals(s).total} prizes have been drawn. 🎉`
              : `All “${s.settings.currentPrize}” prizes have been drawn. Pick another prize in the admin panel.`,
      );
      return;
    }

    const names = p.length ? p : s.participants;
    const sample = names.length > 400 ? Array.from({ length: 400 }, () => names[Math.floor(Math.random() * names.length)].name) : names.map((x) => x.name);
    const spinMs = s.settings.spinSeconds * 1000;
    // countdownAt / spinAt are filled in when the countdown and the reel actually appear.
    setShow({ ...buildReel(sample, record.name, spinMs), spinMs, countdown: s.settings.countdown });
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
    else if (cmd.type === 'ping') sendCommand({ type: 'status', phase: phaseRef.current, at: Date.now(), win: winInfo() });
  });

  useEffect(() => {
    const beat = () => sendCommand({ type: 'status', phase, at: Date.now(), win: winInfo() });
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
      else if (e.key.toLowerCase() === 'g') setScreen((sc) => ({ guides: !sc.guides }));
      else if (e.key === '+' || e.key === '=') setScreen((sc) => ({ scale: round2(Math.min(4, sc.scale + 0.05)) }));
      else if (e.key === '-' || e.key === '_') setScreen((sc) => ({ scale: round2(Math.max(0.25, sc.scale - 0.05)) }));
      else if (e.key === '0') setScreen(() => ({ scale: 1 }));
      else if (e.key.startsWith('Arrow')) {
        // Nudge the canvas position (custom size only): 1 px, or 10 px with Shift
        if (loadState().settings.screen.mode !== 'custom') return;
        e.preventDefault();
        const d = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0;
        const dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0;
        setScreen((sc) => ({ x: sc.x + dx, y: sc.y + dy }));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [startDraw, resetView, toggleShowcase, update, setScreen]);

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

  // Keep the newest winner in view when the board is longer than the screen (the board is in prize
  // order, so the newest winner is not always at the bottom).
  const boardCount = state ? activeWinners(state).length : 0;
  useEffect(() => {
    const ol = boardRef.current;
    if (!ol) return;
    const toBottom = () => {
      const newest = ol.querySelector<HTMLElement>('li[data-newest]');
      if (!newest) return;
      const top = newest.offsetTop - ol.offsetTop;
      if (top < ol.scrollTop || top + newest.offsetHeight > ol.scrollTop + ol.clientHeight)
        ol.scrollTo({ top: Math.max(0, top + newest.offsetHeight - ol.clientHeight), behavior: 'smooth' });
    };
    // Again once the new row has animated in and the web fonts have settled the layout.
    const raf = requestAnimationFrame(toBottom);
    const t = setTimeout(toBottom, 500);
    void document.fonts?.ready.then(toBottom);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [boardCount, phase]);

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
  // Prize order: 1st, 2nd, 3rd … (the same everywhere winners are listed).
  const shownWinners = byPrizeRank(
    activeWinners(state).filter((w) => !(drawing && current && w.id === current.id)),
    settings.prizes,
  );
  const newestId = shownWinners.reduce<Winner | null>((a, w) => (!a || w.drawNo > a.drawNo ? w : a), null)?.id;
  const showBoard = settings.showWinnersBoard && shownWinners.length > 0 && phase !== 'showcase';
  const total = state.participants.length;
  const prizeOk = canDrawPrize(state);
  const listed = settings.prizes.includes(settings.currentPrize);
  const qty = listed ? prizeQty(state, settings.currentPrize) : 1;
  const left = listed ? prizeLeft(state, settings.currentPrize) : 1;
  const prizes = prizeTotals(state);
  const finished = prizes.total > 0 && prizes.left === 0;

  return (
    <Screen cfg={settings.screen}>
    <main className="stage">
      <Background />
      {settings.showBubbles && names.length > 0 && !finished && (
        <Bubbles names={names} visible={phase === 'idle'} sets={settings.bubbleSets} seconds={settings.bubbleSeconds} />
      )}

      <header className="topbar">
        <BrandBlock eventTitle={settings.eventTitle} company={settings.companyName} logo={settings.logo} display={settings.companyDisplay} />
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
                exit={{ opacity: 0, y: -20, scale: 0.97, transition: { duration: 0.3 } }}
                transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
              >
                {finished ? (
                  <>
                    <span className="kicker">The draw is complete</span>
                    <span className="prize-pill">
                      <IconTrophy /> All {prizes.total} prizes drawn
                    </span>
                  </>
                ) : settings.showPrize ? (
                  <>
                    <span className="kicker">{prizeOk ? 'Now drawing' : 'Draw complete'}</span>
                    <span className="prize-pill">
                      <IconGift /> {settings.currentPrize}
                      {qty > 1 && prizeOk && <span className="prize-left">{left} of {qty} left</span>}
                    </span>
                    {prizes.total > 1 && prizeOk && listed && (
                      <span className="prize-count">
                        Prize {prizes.drawn + 1} of {prizes.total}
                      </span>
                    )}
                  </>
                ) : null}
                <EventTitle title={settings.eventTitle} logo={settings.eventLogo} show={settings.titleDisplay} />
                <p className="subtitle">{finished ? 'Thank you for joining us — congratulations to all our winners!' : settings.eventSubtitle}</p>

                {finished ? (
                  <div className="finale-list">
                    {byPrizeRank(activeWinners(state), settings.prizes)
                      .slice(0, 12)
                      .map((w) => (
                        <span key={w.id} className="meta-chip">
                          🏆 {w.name} <span className="note">· {w.prize}</span>
                        </span>
                      ))}
                  </div>
                ) : total === 0 ? (
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
                        <b>{prizes.total ? prizes.left : activeWinners(state).length}</b>
                        <span>{prizes.total ? 'Prizes left' : 'Winners'}</span>
                      </div>
                    </div>
                    {prizes.total > 0 && (
                      <div className="progress" aria-label={`${prizes.drawn} of ${prizes.total} prizes drawn`}>
                        <span style={{ width: `${(prizes.drawn / prizes.total) * 100}%` }} />
                      </div>
                    )}
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
                <Countdown
                  sound={settings.sound}
                  onDone={onCountdownDone}
                  onStart={(t) => setShow((sh) => (sh ? { ...sh, countdownAt: t } : sh))}
                />
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
                            {metaLine(w) && <span className="what">{metaLine(w)}</span>}
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
                {show && (
                  <Reel
                    items={show.items}
                    winIndex={show.winIndex}
                    durationMs={show.spinMs}
                    sound={settings.sound}
                    onDone={onReelDone}
                    onStart={(t) => setShow((sh) => (sh ? { ...sh, spinAt: t } : sh))}
                  />
                )}
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
                exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.25, ease: 'easeIn' } }}
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
                <WinnerName name={current.name} colors={settings.nameColors} />
                <WinnerMeta code={current.ticket} org={current.group} />
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
            <ol ref={boardRef}>
              <AnimatePresence initial={false}>
                {shownWinners.map((w) => (
                  <motion.li
                    key={w.id}
                    data-newest={w.id === newestId ? '' : undefined}
                    layout
                    initial={{ opacity: 0, x: 40 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div className="who">{w.name}</div>
                      <div className="what">
                        {w.prize}
                        {w.group ? ` · ${w.group}` : ''}
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
        <span className="hide-sm opt">
          <IconShield /> Each result is locked before the reel spins
        </span>
      </footer>

      {settings.sound && !soundOk && (
        <button className="pill sound-chip" onClick={() => { unlockAudio(); setTimeout(() => setSoundOk(audioReady()), 100); }}>
          <IconVolumeOff style={{ width: 14, height: 14 }} /> Click to enable sound
        </button>
      )}

      {settings.live.showQr && settings.live.room && phase !== 'countdown' && phase !== 'spinning' && (
        <div className="join-qr">
          <QrCode value={viewerUrl(normalizeServer(settings.live.server), settings.live.room.code)} />
          <span>
            <b>Watch live</b> on your phone
            <small>Scan the code</small>
          </span>
        </div>
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
              <dt><kbd>G</kbd></dt><dd>LED alignment guides</dd>
              <dt><kbd>+</kbd> <kbd>−</kbd> <kbd>0</kbd></dt><dd>Zoom in / out / reset</dd>
              {settings.screen.mode === 'custom' && (
                <>
                  <dt><kbd>←</kbd> <kbd>↑</kbd> <kbd>→</kbd> <kbd>↓</kbd></dt><dd>Move the canvas 1 px (Shift: 10 px)</dd>
                </>
              )}
              <dt><kbd>?</kbd></dt><dd>Show / hide this list</dd>
            </dl>
          </motion.div>
        )}
      </AnimatePresence>

    </main>

      <canvas ref={bindConfetti} className="confetti-canvas" aria-hidden />

      <div className="toast-wrap">
        <AnimatePresence>
          {toast && (
            <motion.div className="toast" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}>
              {toast}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Screen>
  );
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** The display window's size in device pixels — the admin offers it as an LED canvas preset. */
function winInfo(): WinInfo {
  const dpr = window.devicePixelRatio || 1;
  return { w: Math.round(window.innerWidth * dpr), h: Math.round(window.innerHeight * dpr), dpr };
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
