'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { Background, ClickMark } from '@/components/Brand';
import ImportPanel from '@/components/admin/ImportPanel';
import ParticipantList from '@/components/admin/ParticipantList';
import { AdminGate, Setting, lockAdmin } from '@/components/admin/ui';
import { DialogHost, confirmDialog, messageDialog, promptDialog } from '@/components/admin/Dialog';
import {
  IconDownload,
  IconHome,
  IconLogout,
  IconPlay,
  IconSparkle,
  IconTrash,
  IconTv,
  IconUndo,
  IconUpload,
  IconWarn,
} from '@/components/Icons';
import { BRAND, DEFAULT_LIVE_SERVER, NAME_COLOR_PRESETS, asset } from '@/lib/config';
import { downloadWinners } from '@/lib/excel';
import QrCode from '@/components/QrCode';
import { byPrizeRank } from '@/components/Stage';
import { buildSnapshot, liveClose, liveCreateRoom, liveGet, liveHealth, livePublish, normalizeServer, deleteRegistration, regConfigure, regNumber, registerUrl, useRegistrationSync, viewerUrl } from '@/lib/live';
import { poolFingerprint } from '@/lib/fair';
import {
  type CompanyDisplay,
  type TitleDisplay,
  type DisplayPhase,
  type RaffleState,
  type ScreenSettings,
  type WinInfo,
  activeWinners,
  canDrawPrize,
  defaultScreen,
  defaultState,
  eligible,
  migrate,
  nameGradient,
  nextPrize,
  prizeLeft,
  prizeQty,
  prizeTotals,
  sendCommand,
  settlePrize,
  uid,
  useCommands,
  useRaffle,
} from '@/lib/store';

export default function AdminPage() {
  return (
    <AdminGate>
      <Admin />
    </AdminGate>
  );
}

function Admin() {
  const { state, update } = useRaffle();
  // Registration by QR code: people who register on their phones join the draw (also when the display is closed).
  useRegistrationSync(state, update);
  const [display, setDisplay] = useState<{ phase: DisplayPhase; at: number; win?: WinInfo } | null>(null);
  const [now, setNow] = useState(Date.now());

  useCommands((cmd) => {
    if (cmd.type === 'status') setDisplay({ phase: cmd.phase, at: cmd.at, win: cmd.win });
  });

  useEffect(() => {
    sendCommand({ type: 'ping' });
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!state) return <div className="admin"><Background /></div>;

  const online = !!display && now - display.at < 4500;
  const phase = online ? display!.phase : null;

  const openDisplay = () => window.open(asset('/'), 'click2026-display');

  return (
    <div className="admin">
      <Background />
      <DialogHost />
      <header className="admin-top">
        <div className="admin-title">
          <ClickMark />
          <div>
            <h1>Admin console</h1>
            <small>
              {state.settings.companyName ? `${state.settings.companyName} · ` : ''}
              {state.settings.eventTitle}
            </small>
          </div>
        </div>
        <div className="row">
          <span className={`pill status${online ? ' on' : ''}`} title="The live display must be open in this same browser">
            <span className="dot" />
            {online ? `Display connected · ${PHASE_LABEL[phase ?? 'idle']}` : 'Display not open'}
          </span>
          <button className="btn primary" onClick={openDisplay}>
            <IconTv /> Open live display
          </button>
          <button className="btn" onClick={lockAdmin} title="Lock admin">
            <IconLogout /> <span className="hide-sm">Lock</span>
          </button>
        </div>
      </header>

      <div className="admin-grid">
        <div className="col">
          <DrawControl state={state} update={update} online={online} phase={phase} openDisplay={openDisplay} />
          <ImportPanel state={state} update={update} />
          <ParticipantList state={state} update={update} />
        </div>
        <div className="col">
          <LiveCard state={state} update={update} online={online} />
          <WinnersCard state={state} update={update} />
          <PrizesCard state={state} update={update} />
          <ScreenCard state={state} update={update} win={online ? display?.win : undefined} />
          <SettingsCard state={state} update={update} />
          <BackupCard state={state} update={update} />
        </div>
      </div>
    </div>
  );
}

const PHASE_LABEL: Record<DisplayPhase, string> = {
  idle: 'ready',
  countdown: 'counting down…',
  spinning: 'drawing…',
  winner: 'showing winner',
  showcase: 'showing all winners',
};

type CardProps = { state: RaffleState; update: (fn: (s: RaffleState) => RaffleState) => void };

/* ------------------------------------------------------------- draw */
function DrawControl({
  state,
  update,
  online,
  phase,
  openDisplay,
}: CardProps & { online: boolean; phase: DisplayPhase | null; openDisplay: () => void }) {
  const pool = eligible(state);
  const excluded = state.participants.filter((p) => p.excluded).length;
  const setPrize = (p: string) => update((s) => ({ ...s, settings: { ...s.settings, currentPrize: p } }));
  const busy = phase === 'spinning' || phase === 'countdown';
  const prizeOk = canDrawPrize(state);
  const won = activeWinners(state).length;
  const totals = prizeTotals(state);
  const listed = state.settings.prizes.includes(state.settings.currentPrize);
  const qty = listed ? prizeQty(state, state.settings.currentPrize) : 1;
  const left = listed ? prizeLeft(state, state.settings.currentPrize) : 1;
  const label = busy
    ? 'Drawing…'
    : totals.total > 0 && totals.left === 0
      ? `All ${totals.total} prizes drawn`
      : `Draw a winner for “${state.settings.currentPrize}”${prizeOk && qty > 1 ? ` (${qty - left + 1} of ${qty})` : ''}`;

  return (
    <div className="card" style={{ borderColor: 'rgba(139,92,246,.45)' }}>
      <div className="card-head">
        <h2>
          <IconPlay style={{ width: 18, height: 18, color: 'var(--pink)' }} /> Run the draw
        </h2>
      </div>

      <div className="kpis">
        <div className="kpi">
          <b>{state.participants.length.toLocaleString()}</b>
          <span>Entries</span>
        </div>
        <div className="kpi accent">
          <b>{pool.length.toLocaleString()}</b>
          <span>Eligible</span>
        </div>
        <div className="kpi">
          <b>{excluded.toLocaleString()}</b>
          <span>Excluded</span>
        </div>
        <div className="kpi" title={`${won} winner${won === 1 ? '' : 's'} so far`}>
          <b>
            {totals.left}
            <small style={{ fontSize: 14, color: 'var(--muted)' }}> / {totals.total}</small>
          </b>
          <span>Prizes left</span>
        </div>
      </div>

      {!online && (
        <div className="alert">
          <IconWarn />
          <span>
            The live display isn&apos;t open. Click <b>Open live display</b>, drag that window to the projector/LED screen and press <kbd>F</kbd> for full screen. Keep both windows in this same browser.
          </span>
        </div>
      )}

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="note">Prize for the next draw — tap one to jump to it</span>
        <span className="note">
          {totals.drawn} of {totals.total} drawn
        </span>
      </div>
      <div className="bar">
        <span style={{ width: `${totals.total ? (totals.drawn / totals.total) * 100 : 0}%` }} />
      </div>
      <div className="chips" style={{ marginBottom: 16 }}>
        {state.settings.prizes.map((p) => {
          const left = prizeLeft(state, p);
          const qty = prizeQty(state, p);
          return (
            <button
              key={p}
              className={`chip${state.settings.currentPrize === p ? ' active' : ''}${left <= 0 ? ' done' : ''}`}
              onClick={() => setPrize(p)}
              title={left <= 0 ? 'All drawn' : `${left} of ${qty} left`}
            >
              {p}
              <span className="chip-count">{left <= 0 ? '✓' : qty > 1 ? `${left}/${qty}` : ''}</span>
            </button>
          );
        })}
      </div>
      {!prizeOk && (
        <div className="alert">
          <IconWarn />
          <span>
            All “{state.settings.currentPrize}” prizes have been drawn.{' '}
            {nextPrize(state)
              ? 'Pick the next prize above.'
              : 'Every prize has its winner — press Show all winners for the finale. To draw more, add a prize or raise a quantity in Prizes.'}
          </span>
        </div>
      )}

      <button
        className="btn primary big"
        disabled={!online || !pool.length || busy || !prizeOk}
        onClick={() => sendCommand({ type: 'draw', requestId: uid() })}
      >
        <IconSparkle /> {label}
      </button>
      {!online && (
        <button className="btn" style={{ width: '100%', marginTop: 10 }} onClick={openDisplay}>
          <IconTv /> Open live display
        </button>
      )}
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn sm" disabled={!online} onClick={() => sendCommand({ type: 'reset-view' })}>
          <IconHome /> Back to welcome screen
        </button>
        <button className="btn sm" disabled={!online} onClick={() => sendCommand({ type: 'confetti' })}>
          🎉 Confetti
        </button>
        <button className="btn sm" disabled={!online || !won || busy} onClick={() => sendCommand({ type: 'showcase' })} title="Full-screen list of all winners (W on the display)">
          🏆 Show all winners
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------- online live view */
function LiveCard({ state, update, online }: CardProps & { online: boolean }) {
  const live = state.settings.live;
  const server = normalizeServer(live.server);
  const room = live.room;
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState<{ viewers: number; updatedAt: number; seen: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const setLive = (patch: Partial<RaffleState['settings']['live']>) =>
    update((s) => ({ ...s, settings: { ...s.settings, live: { ...s.settings.live, ...patch } } }));

  // While live: how many people are watching, and when the screen was last sent.
  useEffect(() => {
    if (!room || !server) return;
    let alive = true;
    const go = async () => {
      try {
        const r = await liveGet(server, room.code);
        if (alive) setStats({ viewers: r.viewers, updatedAt: r.updatedAt, seen: Date.now() });
      } catch {
        if (alive) setStats(null);
      }
    };
    void go();
    const t = setInterval(go, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [server, room]);

  const test = async () => {
    setBusy(true);
    try {
      const h = await liveHealth(server);
      setMsg({ ok: true, text: h.needsToken ? 'Connected. This server needs a password to go live.' : 'Connected to the live server.' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const goLive = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await liveCreateRoom(server, live.password);
      setLive({ server, room: r, register: false });
      // Show something straight away if the display window isn't open yet (it takes over once open).
      if (!online) {
        const fingerprint = await poolFingerprint(eligible(state));
        await livePublish(server, r, buildSnapshot(state, { phase: 'idle', current: null, show: null, fingerprint }));
      }
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    if (!room) return;
    if (!(await confirmDialog({ title: 'Stop the online live view?', message: 'People watching will see "The live draw has ended" and this link stops working.', okLabel: 'Stop live view', danger: true }))) return;
    setBusy(true);
    try {
      await liveClose(server, room);
    } catch {
      /* server gone or room already closed: forget it anyway */
    }
    setLive({ room: undefined, showQr: false, register: false });
    setStats(null);
    setBusy(false);
  };

  const link = room ? viewerUrl(server, room.code) : '';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      void promptDialog({ title: 'Copy this link', input: { value: link, readOnly: true }, okLabel: 'Done', cancelLabel: null });
    }
  };
  const ago = stats ? Math.max(0, Math.round((stats.seen - stats.updatedAt) / 1000)) : null;

  return (
    <div className="card">
      <div className="card-head">
        <h2>📡 Online live view</h2>
        {room && <span className={`pill status${stats ? ' on' : ''}`}><span className="dot" />{stats ? 'Live' : 'Server not reachable'}</span>}
      </div>
      {!room ? (
        <>
          <p className="help">
            Let people watch the draw live on their own phones. The live server is ready to use — just press <b>Go live</b>. (To use another server, e.g. <code>npm run live</code>, change the address; see the README.)
          </p>
          <div className="col" style={{ gap: 10 }}>
            <label className="field">
              Live server address
              <input className="input" value={live.server} placeholder={DEFAULT_LIVE_SERVER} onChange={(e) => setLive({ server: e.target.value })} />
            </label>
            {server !== normalizeServer(DEFAULT_LIVE_SERVER) && (
              <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setLive({ server: DEFAULT_LIVE_SERVER })}>
                Use default server
              </button>
            )}
            <label className="field">
              Server password <span className="note" style={{ margin: 0 }}>(only if the server has one)</span>
              <input className="input" type="password" value={live.password ?? ''} onChange={(e) => setLive({ password: e.target.value || undefined })} />
            </label>
            <div className="row">
              <button className="btn" onClick={() => void test()} disabled={!server || busy}>
                Test connection
              </button>
              <button className="btn primary" onClick={() => void goLive()} disabled={!server || busy}>
                📡 Go live
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="col" style={{ gap: 12 }}>
          <div className="live-share">
            <QrCode value={link} label="QR code for the live view link" />
            <div className="col" style={{ gap: 8, minWidth: 0 }}>
              <span className="note" style={{ margin: 0 }}>
                Share this link or QR code — viewers watch on their own devices:
              </span>
              <code className="live-link">{link}</code>
              <div className="row">
                <button className="btn sm" onClick={() => void copy()}>
                  {copied ? '✓ Copied' : 'Copy link'}
                </button>
                <a className="btn sm" href={link} target="_blank" rel="noreferrer">
                  Open viewer
                </a>
              </div>
              <span className="note" style={{ margin: 0 }}>
                {stats ? `👀 ${stats.viewers} watching · screen sent ${ago! < 2 ? 'just now' : `${ago}s ago`}` : 'Checking the live server…'}
              </span>
            </div>
          </div>
          {!online && (
            <div className="alert">
              <IconWarn />
              <span>The live display sends the screen to viewers — keep it open while you are live.</span>
            </div>
          )}
          <Setting title="QR code on the big screen" desc="Show the join code in a corner of the display (hidden while the reel spins)" checked={live.showQr} onChange={(v) => setLive({ showQr: v })} />
          <div className="row">
            <button className="btn sm" disabled={!online} onClick={() => sendCommand({ type: 'qr' })} title="Big QR code in the middle of the display (Q on the display) — press again to close">
              ⛶ QR full screen
            </button>
            <span className="note" style={{ margin: 0 }}>
              Big, centred code for the audience to scan. Press again (or <kbd>Q</kbd> / <kbd>Esc</kbd> on the display) to close.
            </span>
          </div>
          <RegistrationBox state={state} update={update} online={online} server={server} room={room} />
          <div className="row">
            <button className="btn danger" onClick={() => void stop()} disabled={busy}>
              Stop live view
            </button>
          </div>
        </div>
      )}
      {msg && (
        <p className="note" style={{ color: msg.ok ? 'var(--green)' : 'var(--red)', marginBottom: 0 }}>
          {msg.text}
        </p>
      )}
    </div>
  );
}

/** Registration by QR code: people scan, fill in first name, last name and organization, and join the draw. */
function RegistrationBox({ state, update, online, server, room }: CardProps & { online: boolean; server: string; room: { code: string; key: string } }) {
  const live = state.settings.live;
  const open = !!live.register;
  const onePerDevice = live.onePerDevice !== false;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  const link = registerUrl(server, room.code);
  const registered = state.participants.filter((p) => regNumber(p.id, room.code) !== null).reverse(); // newest first
  const count = registered.length;
  const [showList, setShowList] = useState(false);

  const remove = async (id: string, name: string) => {
    if (!(await confirmDialog({ title: `Delete ${name}'s registration?`, message: 'They leave the participant list and their phone can register again.', okLabel: 'Delete', danger: true }))) return;
    setErr('');
    try {
      await deleteRegistration(live, id);
      update((s) => ({ ...s, participants: s.participants.filter((p) => p.id !== id) }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  const configure = async (patch: { register?: boolean; onePerDevice?: boolean }) => {
    setBusy(true);
    setErr('');
    try {
      // The server keeps "one per phone" per room: send it with every change so a new room gets it too.
      await regConfigure(server, room, { open: patch.register ?? open, onePerDevice: patch.onePerDevice ?? onePerDevice });
      update((s) => ({ ...s, settings: { ...s.settings, live: { ...s.settings.live, ...patch } } }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      void promptDialog({ title: 'Copy this link', input: { value: link, readOnly: true }, okLabel: 'Done', cancelLabel: null });
    }
  };

  return (
    <div className="reg-box">
      <Setting
        title="Registration by QR code"
        desc="People scan a QR code and fill in their first name, last name and organization — they join the draw straight away"
        checked={open}
        onChange={(v) => !busy && void configure({ register: v })}
      />
      <Setting
        title="One registration per phone"
        desc="A phone that has registered once can't register anyone else — it just shows its own Code again"
        checked={onePerDevice}
        onChange={(v) => !busy && void configure({ onePerDevice: v })}
      />
      {open && (
        <div className="live-share">
          <QrCode value={link} label="QR code for the registration form" />
          <div className="col" style={{ gap: 8, minWidth: 0 }}>
            <code className="live-link reg-link">{link}</code>
            <div className="row">
              <button className="btn sm" onClick={() => void copy()}>
                {copied ? '✓ Copied' : 'Copy link'}
              </button>
              <a className="btn sm" href={link} target="_blank" rel="noreferrer">
                Open form
              </a>
              <button className="btn sm" disabled={!online} onClick={() => sendCommand({ type: 'qr', kind: 'register' })} title="Big registration QR code in the middle of the display (R on the display)">
                ⛶ Registration QR full screen
              </button>
            </div>
            <span className="note" style={{ margin: 0 }}>
              📝 <b className="reg-count">{count}</b> registered so far · they appear in Participants within a few seconds. Close registration before the draw starts.
            </span>
          </div>
        </div>
      )}
      {!open && count > 0 && <span className="note" style={{ margin: 0 }}>📝 {count} people registered by QR code (registration closed).</span>}
      {count > 0 && (
        <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setShowList((v) => !v)} aria-expanded={showList}>
          {showList ? 'Hide registrations' : `Show registrations (${count})`}
        </button>
      )}
      {showList && count > 0 && (
        <ul className="reg-list">
          {registered.map((p) => (
            <li key={p.id}>
              <div className="who">
                <span className="name">{p.name}</span>
                <div className="what">
                  {p.group}
                  {p.ticket ? ` · ${p.ticket}` : ''}
                </div>
              </div>
              <button className="btn sm danger" title="Delete this registration — the phone can register again" aria-label={`Delete registration of ${p.name}`} onClick={() => void remove(p.id, p.name)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
      {err && <p className="note" style={{ color: 'var(--red)', margin: 0 }}>{err}</p>}
    </div>
  );
}

/* ---------------------------------------------------------- winners */
function WinnersCard({ state, update }: CardProps) {
  const undo = async (id: string, name: string) => {
    if (!(await confirmDialog({ title: `Undo ${name}'s win?`, message: "They go back into the draw (if they're not excluded) and that prize can be drawn again.", okLabel: 'Undo win', danger: true }))) return;
    update((s) => {
      const w = s.winners.find((x) => x.id === id);
      const reopen = w && !w.forfeited && s.settings.prizes.includes(w.prize);
      return {
        ...s,
        winners: s.winners.filter((x) => x.id !== id),
        settings: { ...s.settings, currentPrize: reopen ? w.prize : s.settings.currentPrize },
      };
    });
  };
  /** Winner isn't here to collect: keep the record (marked), keep them out of later draws, redraw the prize. */
  const forfeit = async (id: string, name: string, prize: string) => {
    if (!(await confirmDialog({ title: `${name} is not present?`, message: `They stay in the record as "Not present", can't be drawn again, and "${prize}" goes back up so you can draw again.`, okLabel: 'Not present' }))) return;
    update((s) => ({
      ...s,
      winners: s.winners.map((w) => (w.id === id ? { ...w, forfeited: true } : w)),
      settings: { ...s.settings, currentPrize: prize },
    }));
    sendCommand({ type: 'reset-view' });
  };
  const clear = async () => {
    if (!(await confirmDialog({ title: `Delete all ${state.winners.length} winners?`, message: 'Everyone becomes eligible again and the prizes can be drawn again. Export the winners first (Excel) if you need a record.', okLabel: 'Delete all winners', danger: true }))) return;
    // Back to the first prize that has places again, and the big screen back to the welcome view.
    update((s) => settlePrize({ ...s, winners: [], settings: { ...s.settings, currentPrize: s.settings.prizes[0] ?? s.settings.currentPrize } }));
    sendCommand({ type: 'reset-view' });
  };

  return (
    <div className="card">
      <div className="card-head">
        <h2>🏆 Winners</h2>
        <div className="row">
          <button className="btn sm" disabled={!state.winners.length} onClick={() => void downloadWinners(byPrizeRank(state.winners, state.settings.prizes))}>
            <IconDownload /> Excel
          </button>
          <button className="btn sm danger" disabled={!state.winners.length} onClick={() => void clear()} title="Delete all winners" aria-label="Delete all winners">
            <IconTrash />
          </button>
        </div>
      </div>
      {state.winners.length === 0 ? (
        <p className="note" style={{ margin: 0 }}>
          No winners yet. Each result is saved here the moment it&apos;s drawn, with the time and pool fingerprint.
        </p>
      ) : (
        <ol className="win-list">
          {byPrizeRank(state.winners, state.settings.prizes).map((w) => (
            <li key={w.id} className={w.forfeited ? 'forfeited' : ''}>
              <div className="who">
                <span className="name">{w.name}</span>
                {w.forfeited && <span className="badge out" style={{ marginLeft: 8 }}>Not present</span>}
                <div className="what">
                  {w.prize}
                  {w.group ? ` · ${w.group}` : ''}
                  {w.ticket ? ` · ${w.ticket}` : ''} · {new Date(w.at).toLocaleTimeString()} · 1 of {w.pool}
                </div>
              </div>
              {!w.forfeited && (
                <button className="btn sm" title="Winner is not here: keep the record, redraw this prize" onClick={() => void forfeit(w.id, w.name, w.prize)}>
                  Not present
                </button>
              )}
              <button className="icon-btn" style={{ width: 32, height: 32 }} title="Undo this win" aria-label={`Undo win for ${w.name}`} onClick={() => void undo(w.id, w.name)}>
                <IconUndo style={{ width: 15, height: 15 }} />
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/* ----------------------------------------------------------- prizes */
function PrizesCard({ state, update }: CardProps) {
  const [name, setName] = useState('');
  const [qty, setQty] = useState(1);
  const add = (e: FormEvent) => {
    e.preventDefault();
    const p = name.trim();
    if (!p) return;
    if (state.settings.prizes.some((x) => x.toLowerCase() === p.toLowerCase())) {
      void messageDialog(`There is already a prize called “${p}”. Raise its quantity instead.`);
      return;
    }
    update((s) =>
      settlePrize({
        ...s,
        settings: { ...s.settings, prizes: [...s.settings.prizes, p], prizeQty: { ...s.settings.prizeQty, [p]: clampQty(qty) } },
      }),
    );
    setName('');
    setQty(1);
  };
  const remove = (p: string) =>
    update((s) => {
      const prizes = s.settings.prizes.filter((x) => x !== p);
      if (!prizes.length) return { ...s, settings: { ...s.settings, prizes, currentPrize: 'Lucky Draw' } };
      return settlePrize({ ...s, settings: { ...s.settings, prizes } });
    });
  const setCount = (p: string, n: number) =>
    update((s) => settlePrize({ ...s, settings: { ...s.settings, prizeQty: { ...s.settings.prizeQty, [p]: clampQty(n) } } }));
  const move = (i: number, d: -1 | 1) =>
    update((s) => {
      const prizes = [...s.settings.prizes];
      const j = i + d;
      if (j < 0 || j >= prizes.length) return s;
      [prizes[i], prizes[j]] = [prizes[j], prizes[i]];
      // The list order is the draw order: the next draw is for the top prize that still has places.
      const next = { ...s, settings: { ...s.settings, prizes } };
      return { ...next, settings: { ...next.settings, currentPrize: nextPrize(next) ?? next.settings.currentPrize } };
    });
  /** Renames the prize everywhere: the list, its quantity, the next draw and the winners who won it. */
  const rename = async (p: string) => {
    const n = (await promptDialog({ title: 'Rename prize', input: { value: p, label: 'Prize name' }, okLabel: 'Rename' }))?.trim();
    if (!n || n === p) return;
    if (state.settings.prizes.some((x) => x !== p && x.toLowerCase() === n.toLowerCase())) {
      void messageDialog(`There is already a prize called “${n}”.`);
      return;
    }
    update((s) => {
      const { [p]: q, ...rest } = s.settings.prizeQty;
      return {
        ...s,
        settings: {
          ...s.settings,
          prizes: s.settings.prizes.map((x) => (x === p ? n : x)),
          prizeQty: q === undefined ? rest : { ...rest, [n]: q },
          currentPrize: s.settings.currentPrize === p ? n : s.settings.currentPrize,
        },
        winners: s.winners.map((w) => (w.prize === p ? { ...w, prize: n } : w)),
      };
    });
  };
  const totals = prizeTotals(state);

  return (
    <div className="card">
      <div className="card-head">
        <h2>🎁 Prizes</h2>
        <span className="badge in">
          {totals.total} winner{totals.total === 1 ? '' : 's'} in total
        </span>
      </div>
      <p className="help">
        Set how many of each prize there are. Prizes are drawn from top to bottom: when the last one is drawn, the next prize in this order is
        selected automatically, and when every prize has its winners the draw stops. The prize name appears on the big screen above the reel and on
        the winner card.
      </p>
      <ul className="prize-list">
        {state.settings.prizes.map((p, i) => {
          const left = prizeLeft(state, p);
          return (
            <li key={p}>
              <button className="icon-btn" style={{ width: 28, height: 28 }} disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${p} up`} title="Move up">
                ↑
              </button>
              <button
                className="icon-btn"
                style={{ width: 28, height: 28 }}
                disabled={i === state.settings.prizes.length - 1}
                onClick={() => move(i, 1)}
                aria-label={`Move ${p} down`}
                title="Move down"
              >
                ↓
              </button>
              <span className="prize-name">{p}</span>
              <span className={`badge ${left <= 0 ? 'win' : 'in'}`}>{left <= 0 ? 'All drawn' : `${left} left`}</span>
              <input
                className="input qty"
                type="number"
                min={1}
                max={999}
                value={prizeQty(state, p)}
                onChange={(e) => setCount(p, Number(e.target.value))}
                aria-label={`How many ${p}`}
                title="How many of this prize"
              />
              <button className="icon-btn" style={{ width: 28, height: 28 }} aria-label={`Rename ${p}`} title="Rename" onClick={() => void rename(p)}>
                ✎
              </button>
              <button className="icon-btn" style={{ width: 28, height: 28 }} aria-label={`Remove ${p}`} title="Remove" onClick={() => remove(p)}>
                ×
              </button>
            </li>
          );
        })}
      </ul>
      {!state.settings.prizes.length && (
        <p className="note" style={{ marginTop: 0 }}>
          No prizes yet — draws use “{state.settings.currentPrize}” with no limit until you add one.
        </p>
      )}
      <form className="row" onSubmit={add}>
        <input className="input" style={{ flex: 1, width: 'auto' }} placeholder="e.g. Smart TV, Gift voucher" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input qty" type="number" min={1} max={999} value={qty} onChange={(e) => setQty(Number(e.target.value))} aria-label="How many" title="How many" />
        <button className="btn" type="submit" disabled={!name.trim()}>
          Add
        </button>
      </form>
    </div>
  );
}

const clampQty = (n: number) => Math.min(999, Math.max(1, Math.round(n) || 1));

/** Shrink an uploaded logo (by default to at most 320×160) so it stays small in browser storage. */
async function logoToDataUrl(file: File, maxW = 320, maxH = 160): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const w = img.naturalWidth || 320;
    const h = img.naturalHeight || 160;
    const k = Math.min(1, maxW / w, maxH / h);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * k));
    c.height = Math.max(1, Math.round(h * k));
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ------------------------------------------------------ LED / screen */
const PRESETS: { label: string; w: number; h: number }[] = [
  { label: 'Full HD', w: 1920, h: 1080 },
  { label: '4K', w: 3840, h: 2160 },
  { label: 'HD', w: 1280, h: 720 },
  { label: 'Ultra-wide', w: 2560, h: 1080 },
  { label: 'Wide strip', w: 1920, h: 480 },
  { label: 'Square', w: 1080, h: 1080 },
  { label: 'Portrait', w: 1080, h: 1920 },
];

const MAX_PX = 16384;

/**
 * A pixel box you can type into freely: what you type stays as typed (you can clear it, or start
 * with "-"), valid numbers apply to the display straight away, and the value is tidied up
 * (rounded, kept in range) when you leave the box or press Enter. Esc undoes, ↑/↓ step 1 (Shift 10).
 */
function PixelField({ label, value, min, max, onCommit }: { label: string; value: number; min: number; max: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null); // null = not editing, show the saved value
  const before = useRef(value); // value when editing started (Esc goes back to it)
  const cancelled = useRef(false);
  const parse = (t: string) => {
    const v = Number(t.trim());
    return t.trim() !== '' && Number.isFinite(v) ? Math.round(v) : null;
  };
  const inRange = (v: number) => v >= min && v <= max;
  const finish = () => {
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    if (draft === null) return;
    const v = parse(draft);
    if (v !== null) onCommit(Math.min(max, Math.max(min, v)));
    setDraft(null);
  };
  return (
    <label className="field">
      {label}
      <input
        className="input"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={draft ?? String(value)}
        onFocus={() => (before.current = value)}
        onChange={(e) => {
          const t = e.target.value.replace(/[^\d-]/g, '');
          setDraft(t);
          const v = parse(t);
          if (v !== null && inRange(v)) onCommit(v);
        }}
        onBlur={finish}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            finish();
            e.currentTarget.blur();
          } else if (e.key === 'Escape') {
            if (before.current !== value) onCommit(before.current);
            cancelled.current = true;
            setDraft(null);
            e.currentTarget.blur();
          } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const base = parse(draft ?? String(value)) ?? value;
            const v = Math.min(max, Math.max(min, base + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1)));
            setDraft(String(v));
            onCommit(v);
          }
        }}
      />
    </label>
  );
}

function ScreenCard({ state, update, win }: CardProps & { win?: WinInfo }) {
  const sc = state.settings.screen;
  const set = (patch: Partial<ScreenSettings>) =>
    update((s) => ({ ...s, settings: { ...s.settings, screen: { ...s.settings.screen, ...patch } } }));
  const pct = Math.round(sc.scale * 100);

  return (
    <div className="card">
      <div className="card-head">
        <h2>🖥️ LED wall / screen</h2>
        {win && (
          <span className="badge in" title="Size of the live display window, in device pixels">
            Display window {win.w}×{win.h}
            {win.dpr !== 1 ? ` · ${Math.round(win.dpr * 100)}%` : ''}
          </span>
        )}
      </div>
      <p className="help">Match the live display to your LED wall. Changes apply instantly on the display.</p>

      <div className="seg" role="group" aria-label="Screen mode" style={{ marginBottom: 6 }}>
        <button className={sc.mode === 'fit' ? 'active' : ''} onClick={() => set({ mode: 'fit' })}>
          Fit window
        </button>
        <button className={sc.mode === 'custom' ? 'active' : ''} onClick={() => set({ mode: 'custom' })}>
          Custom size &amp; position
        </button>
      </div>
      <p className="note" style={{ margin: '4px 0 0' }}>
        {sc.mode === 'fit'
          ? 'Fills the whole display window. Best when the LED wall is its own monitor in Windows.'
          : 'Draws the show in an exact pixel area — for LED processors that take one region of the output (e.g. 1920×480 at the top-left). Everything outside stays black.'}
      </p>

      {sc.mode === 'custom' && (
        <>
          <div className="sub-label">Size presets</div>
          <div className="chips">
            {PRESETS.map((p) => (
              <button key={p.label} className={`chip${sc.width === p.w && sc.height === p.h ? ' active' : ''}`} onClick={() => set({ width: p.w, height: p.h })}>
                {p.label} <small>{p.w}×{p.h}</small>
              </button>
            ))}
            {win && (
              <button className="chip" onClick={() => set({ width: win.w, height: win.h, x: 0, y: 0 })}>
                Use display window <small>{win.w}×{win.h}</small>
              </button>
            )}
          </div>

          <div className="sub-label">Exact pixels</div>
          <div className="num-grid">
            <PixelField label="Width" value={sc.width} min={100} max={MAX_PX} onCommit={(v) => set({ width: v })} />
            <PixelField label="Height" value={sc.height} min={100} max={MAX_PX} onCommit={(v) => set({ height: v })} />
            <PixelField label="Left (X)" value={sc.x} min={-MAX_PX} max={MAX_PX} onCommit={(v) => set({ x: v })} />
            <PixelField label="Top (Y)" value={sc.y} min={-MAX_PX} max={MAX_PX} onCommit={(v) => set({ y: v })} />
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn sm" onClick={() => set({ x: 0, y: 0 })}>
              Top-left
            </button>
            {win && (
              <button className="btn sm" onClick={() => set({ x: Math.round((win.w - sc.width) / 2), y: Math.round((win.h - sc.height) / 2) })}>
                Centre in window
              </button>
            )}
            <span className="note">On the display: arrow keys nudge 1 px, Shift+arrows 10 px.</span>
          </div>
        </>
      )}

      <div className="sub-label">Content zoom</div>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <button className="btn sm" onClick={() => set({ scale: Math.max(0.25, Math.round((sc.scale - 0.05) * 100) / 100) })} aria-label="Zoom out">
          −
        </button>
        <input type="range" min={25} max={300} step={5} value={pct} onChange={(e) => set({ scale: Number(e.target.value) / 100 })} aria-label="Content zoom" />
        <button className="btn sm" onClick={() => set({ scale: Math.min(4, Math.round((sc.scale + 0.05) * 100) / 100) })} aria-label="Zoom in">
          +
        </button>
        <span className="badge in" style={{ minWidth: 52, textAlign: 'center' }}>
          {pct}%
        </span>
      </div>
      <p className="note" style={{ margin: '6px 0 0' }}>
        Bigger text for a far-away audience, smaller to fit more. On the display: <kbd>+</kbd> <kbd>−</kbd> <kbd>0</kbd>.
      </p>

      <div className="sub-label">Rotation</div>
      <div className="seg" role="group" aria-label="Rotation">
        {([0, 90, 180, 270] as const).map((r) => (
          <button key={r} className={sc.rotate === r ? 'active' : ''} onClick={() => set({ rotate: r })}>
            {r}°
          </button>
        ))}
      </div>
      <p className="note" style={{ margin: '6px 0 0' }}>For walls mounted sideways or upside down when the PC output can&apos;t be rotated.</p>

      <div style={{ marginTop: 8 }}>
        <Setting title="Alignment guides" desc="Corner marks, centre cross and pixel size on the display (key G)" checked={sc.guides} onChange={(v) => set({ guides: v })} />
      </div>
      <button className="btn sm" style={{ marginTop: 6 }} onClick={() => set(defaultScreen())}>
        <IconUndo /> Reset screen layout
      </button>
    </div>
  );
}


/* --------------------------------------------------------- settings */
function SettingsCard({ state, update }: CardProps) {
  const s = state.settings;
  const logoRef = useRef<HTMLInputElement>(null);
  const eventLogoRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof RaffleState['settings']>(k: K, v: RaffleState['settings'][K]) =>
    update((st) => ({ ...st, settings: { ...st.settings, [k]: v } }));

  const uploadLogo = async (f?: File) => {
    if (!f) return;
    try {
      const logo = await logoToDataUrl(f);
      // Show the new logo straight away.
      update((st) => ({
        ...st,
        settings: { ...st.settings, logo, companyDisplay: st.settings.companyDisplay === 'name' ? 'logo' : st.settings.companyDisplay },
      }));
    } catch {
      void messageDialog('That image could not be read. Use a PNG, JPG or SVG file.');
    } finally {
      if (logoRef.current) logoRef.current.value = '';
    }
  };

  const uploadEventLogo = async (f?: File) => {
    if (!f) return;
    try {
      // Bigger than the organization logo: it is shown large on the welcome screen.
      const eventLogo = await logoToDataUrl(f, 1000, 320);
      update((st) => ({ ...st, settings: { ...st.settings, eventLogo, titleDisplay: 'logo' } }));
    } catch {
      void messageDialog('That image could not be read. Use a PNG, JPG or SVG file.');
    } finally {
      if (eventLogoRef.current) eventLogoRef.current.value = '';
    }
  };
  const orgLogo = s.logo || (BRAND.logo ? asset(BRAND.logo) : undefined);
  const eventLogo = s.eventLogo || (BRAND.eventLogo ? asset(BRAND.eventLogo) : undefined);

  return (
    <div className="card">
      <div className="card-head">
        <h2>⚙️ Display settings</h2>
      </div>
      <div className="col" style={{ gap: 10, marginBottom: 6 }}>
        <label className="field">
          Event title
          <input className="input" value={s.eventTitle} onChange={(e) => set('eventTitle', e.target.value)} />
        </label>
        <label className="field">
          Subtitle
          <input className="input" value={s.eventSubtitle} onChange={(e) => set('eventSubtitle', e.target.value)} />
        </label>
      </div>
      <div className="setting" style={{ display: 'block' }}>
        <b>Event title on the welcome screen</b>
        <span style={{ display: 'block', marginBottom: 10 }}>The event logo, or the event title above as text</span>
        <div className="col" style={{ gap: 10 }}>
          <div className="seg" role="group" aria-label="Show the event title as">
            {(
              [
                ['logo', 'Event logo'],
                ['text', 'Title text'],
              ] as [TitleDisplay, string][]
            ).map(([k, label]) => (
              <button key={k} className={s.titleDisplay === k ? 'active' : ''} disabled={k === 'logo' && !eventLogo} onClick={() => set('titleDisplay', k)}>
                {label}
              </button>
            ))}
          </div>
          <div className="row" style={{ alignItems: 'center' }}>
            {eventLogo && <img src={eventLogo} alt="Current event logo" className="logo-preview wide" />}
            <button className="btn sm" onClick={() => eventLogoRef.current?.click()}>
              <IconUpload /> {s.eventLogo ? 'Change event logo' : 'Upload another event logo'}
            </button>
            {s.eventLogo && (
              <button className="btn sm" onClick={() => update((st) => ({ ...st, settings: { ...st.settings, eventLogo: undefined } }))}>
                {BRAND.eventLogo ? 'Use the built-in logo' : 'Remove event logo'}
              </button>
            )}
            <input ref={eventLogoRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" hidden onChange={(e) => void uploadEventLogo(e.target.files?.[0])} />
          </div>
        </div>
      </div>
      <div className="setting" style={{ display: 'block' }}>
        <b>Organization</b>
        <span style={{ display: 'block', marginBottom: 10 }}>Top-left of the display: a wide logo (like EGUARDIAN) sits above the event title, a square one replaces the icon</span>
        <div className="col" style={{ gap: 10 }}>
          <label className="field">
            Organization name
            <input className="input" value={s.companyName} placeholder="e.g. eGuardian" onChange={(e) => set('companyName', e.target.value)} />
          </label>
          <div className="row" style={{ alignItems: 'center' }}>
            {orgLogo && <img src={orgLogo} alt="Current organization logo" className="logo-preview wide" />}
            <button className="btn sm" onClick={() => logoRef.current?.click()}>
              <IconUpload /> {s.logo ? 'Change logo' : 'Upload another logo'}
            </button>
            {s.logo && (
              <button
                className="btn sm"
                onClick={() => update((st) => ({ ...st, settings: { ...st.settings, logo: undefined, companyDisplay: BRAND.logo ? st.settings.companyDisplay : 'name' } }))}
              >
                {BRAND.logo ? 'Use the built-in logo' : 'Remove logo'}
              </button>
            )}
            <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" hidden onChange={(e) => void uploadLogo(e.target.files?.[0])} />
          </div>
          <div className="seg" role="group" aria-label="Show company as">
            {(
              [
                ['name', 'Name'],
                ['logo', 'Logo'],
                ['both', 'Logo + name'],
              ] as [CompanyDisplay, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                className={s.companyDisplay === k ? 'active' : ''}
                disabled={k !== 'name' && !s.logo && !BRAND.logo}
                title={k !== 'name' && !s.logo && !BRAND.logo ? 'Upload a logo first' : undefined}
                onClick={() => set('companyDisplay', k)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="setting" style={{ display: 'block' }}>
        <b>Winner name colours</b>
        <span style={{ display: 'block', marginBottom: 10 }}>The big name on the winner card, left to right. Pick a preset or your own colours.</span>
        <div className="name-preview-box" aria-hidden>
          <div className="name-preview" style={{ '--name-grad': nameGradient(s.nameColors) } as React.CSSProperties}>
            Winner Name
          </div>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          {NAME_COLOR_PRESETS.map((p) => {
            const active = p.colors.join() === s.nameColors.join();
            return (
              <button
                key={p.name}
                className={`swatch${active ? ' active' : ''}`}
                style={{ background: nameGradient(p.colors) }}
                onClick={() => set('nameColors', p.colors)}
                title={p.name}
                aria-label={`${p.name} colours`}
                aria-pressed={active}
              >
                <span>{p.name}</span>
              </button>
            );
          })}
        </div>
        <div className="row" style={{ marginTop: 10, alignItems: 'center' }}>
          {[0, 1, 2].map((i) => (
            <label key={i} className="color-pick" title={['Left', 'Middle', 'Right'][i]}>
              <input
                type="color"
                value={s.nameColors[i] ?? s.nameColors[s.nameColors.length - 1]}
                onChange={(e) => {
                  const next = [0, 1, 2].map((j) => s.nameColors[j] ?? s.nameColors[s.nameColors.length - 1]);
                  next[i] = e.target.value;
                  set('nameColors', next);
                }}
                aria-label={`${['Left', 'Middle', 'Right'][i]} colour`}
              />
              {['Left', 'Middle', 'Right'][i]}
            </label>
          ))}
        </div>
      </div>
      <Setting
        title="Logo in the top-left corner"
        desc="The company logo and event name in the corner of the big screen and the phones"
        checked={s.showBrand}
        onChange={(v) => set('showBrand', v)}
      />
      <Setting title="“LIVE DRAW” badge" desc="The LIVE DRAW pill in the top-right corner of the big screen" checked={s.showLiveBadge} onChange={(v) => set('showLiveBadge', v)} />
      <Setting
        title="Prize on the welcome screen"
        desc="“Now drawing”, the prize name and “Prize 1 of 3” above the event title (the prize always shows during the draw)"
        checked={s.showPrize}
        onChange={(v) => set('showPrize', v)}
      />
      <Setting title="Name bubbles" desc="Float every participant's name on the welcome screen" checked={s.showBubbles} onChange={(v) => set('showBubbles', v)} />
      {s.showBubbles && <BubbleSets state={state} set={set} />}
      <Setting title="One prize per person" desc="Winners are removed from later draws" checked={s.removeWinners} onChange={(v) => set('removeWinners', v)} />
      <Setting title="Next prize automatically" desc="When a prize runs out, select the next one that has some left" checked={s.autoAdvance} onChange={(v) => set('autoAdvance', v)} />
      <Setting title="3-2-1 countdown" desc="A countdown before the reel starts spinning" checked={s.countdown} onChange={(v) => set('countdown', v)} />
      <Setting title="Winners board" desc="Show past winners beside the draw" checked={s.showWinnersBoard} onChange={(v) => set('showWinnersBoard', v)} />
      <Setting title="Sound effects" desc="Reel ticks and a fanfare on the display (M on the display)" checked={s.sound} onChange={(v) => set('sound', v)} />
      <div className="setting" style={{ display: 'block' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <b>Reel spin time</b>
          <span className="badge in">{s.spinSeconds}s</span>
        </div>
        <input type="range" min={3} max={15} step={1} value={s.spinSeconds} onChange={(e) => set('spinSeconds', Number(e.target.value))} aria-label="Reel spin time in seconds" />
      </div>
    </div>
  );
}

/** How the name bubbles are split into sets and how long each set stays on screen. */
function BubbleSets({
  state,
  set,
}: {
  state: RaffleState;
  set: <K extends keyof RaffleState['settings']>(k: K, v: RaffleState['settings'][K]) => void;
}) {
  const s = state.settings;
  const total = eligible(state).length;
  const sets = Math.max(1, Math.min(s.bubbleSets, total || 1));
  const per = total ? Math.ceil(total / sets) : 0;
  const round = (total ? sets : s.bubbleSets) * s.bubbleSeconds;
  return (
    <div className="setting" style={{ display: 'block' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <b>Name sets</b>
        <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
          <button className="icon-btn" style={{ width: 30, height: 30 }} disabled={s.bubbleSets <= 1} onClick={() => set('bubbleSets', s.bubbleSets - 1)} aria-label="Fewer sets">
            −
          </button>
          <span className="badge in" style={{ minWidth: 34, textAlign: 'center' }} aria-live="polite">
            {s.bubbleSets}
          </span>
          <button className="icon-btn" style={{ width: 30, height: 30 }} disabled={s.bubbleSets >= 20} onClick={() => set('bubbleSets', s.bubbleSets + 1)} aria-label="More sets">
            +
          </button>
        </span>
      </div>
      <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)' }}>
        {total
          ? `All ${total.toLocaleString()} names in the draw are split evenly into ${sets} set${sets === 1 ? '' : 's'} of about ${per}, shown in turn so every name appears once a round.`
          : `The names in the draw are split evenly into ${s.bubbleSets} sets, shown in turn so every name appears once a round.`}
        {per > 70 ? ' That is a lot per set — the bubbles get small; add more sets.' : ''}
      </span>
      <div style={{ display: 'flex', justifyContent: 'space-between', margin: '12px 0 8px' }}>
        <b>Each set on screen</b>
        <span className="badge in">
          {s.bubbleSeconds}s · full round {round >= 60 ? `${Math.floor(round / 60)}m ${round % 60}s` : `${round}s`}
        </span>
      </div>
      <input
        type="range"
        min={3}
        max={30}
        step={1}
        value={s.bubbleSeconds}
        onChange={(e) => set('bubbleSeconds', Number(e.target.value))}
        aria-label="Seconds each set of names stays on screen"
      />
    </div>
  );
}

/* ----------------------------------------------------------- backup */
function BackupCard({ state, update }: CardProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `click2026-raffle-backup-${new Date().toISOString().slice(0, 16).replace(':', '')}.json`;
    // In the page and released a bit later: Safari and Firefox cancel a download whose link is gone at once.
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  };

  const importJson = async (f?: File) => {
    if (!f) return;
    let data: RaffleState;
    try {
      data = JSON.parse(await f.text()) as RaffleState;
      if (!Array.isArray(data.participants) || !data.settings) throw new Error();
    } catch {
      void messageDialog('That file is not a valid raffle backup.');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    try {
      const ok = await confirmDialog({
        title: 'Restore this backup?',
        message: `${data.participants.length} participants and ${data.winners?.length ?? 0} winners. This replaces everything on this computer.`,
        okLabel: 'Restore',
        danger: true,
      });
      if (!ok) return;
      update(() => migrate(data));
      sendCommand({ type: 'reset-view' });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const reset = async () => {
    const ok = await confirmDialog({
      title: 'Reset everything?',
      message: 'This deletes all participants, winners and settings on this computer and stops the online live view. Export a backup first if you may need it.',
      typeToConfirm: 'RESET',
      okLabel: 'Reset all',
      danger: true,
    });
    if (!ok) return;
    const live = state.settings.live;
    if (live.room) {
      try {
        await liveClose(normalizeServer(live.server), live.room); // viewers see "The live draw has ended"
      } catch {
        /* server gone or room already closed */
      }
    }
    // Keep the live server address (and its password): it belongs to this setup, not to the draw.
    update(() => {
      const d = defaultState();
      return { ...d, settings: { ...d.settings, live: { ...d.settings.live, server: live.server || d.settings.live.server, password: live.password } } };
    });
    sendCommand({ type: 'reset-view' });
  };

  return (
    <div className="card">
      <div className="card-head">
        <h2>💾 Backup &amp; reset</h2>
      </div>
      <p className="help">Everything is saved in this browser automatically. Export a backup before the event, or to move the draw to another laptop.</p>
      <div className="row">
        <button className="btn" onClick={exportJson}>
          <IconDownload /> Export backup
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()}>
          <IconUpload /> Restore
        </button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => void importJson(e.target.files?.[0])} />
        <button className="btn danger" onClick={() => void reset()}>
          <IconTrash /> Reset all
        </button>
      </div>
    </div>
  );
}
