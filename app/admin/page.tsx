'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { Background, ClickMark } from '@/components/Brand';
import ImportPanel from '@/components/admin/ImportPanel';
import ParticipantList from '@/components/admin/ParticipantList';
import { AdminGate, Setting, lockAdmin } from '@/components/admin/ui';
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
import { buildSnapshot, liveClose, liveCreateRoom, liveGet, liveHealth, livePublish, normalizeServer, viewerUrl } from '@/lib/live';
import { poolFingerprint } from '@/lib/fair';
import {
  type CompanyDisplay,
  type DisplayPhase,
  type RaffleState,
  activeWinners,
  canDrawPrize,
  defaultState,
  eligible,
  nameGradient,
  nextPrize,
  prizeLeft,
  prizeQty,
  sendCommand,
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
  const [display, setDisplay] = useState<{ phase: DisplayPhase; at: number } | null>(null);
  const [now, setNow] = useState(Date.now());

  useCommands((cmd) => {
    if (cmd.type === 'status') setDisplay({ phase: cmd.phase, at: cmd.at });
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
        <div className="kpi">
          <b>{won}</b>
          <span>Winners</span>
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

      <p className="note" style={{ margin: '0 0 8px' }}>
        Prize for the next draw
      </p>
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
            {nextPrize(state, state.settings.currentPrize) ? 'Pick the next prize above.' : 'Every prize has been drawn — press Show all winners for the finale.'}
          </span>
        </div>
      )}

      <button
        className="btn primary big"
        disabled={!online || !pool.length || busy || !prizeOk}
        onClick={() => sendCommand({ type: 'draw', requestId: uid() })}
      >
        <IconSparkle /> {busy ? 'Drawing…' : `Draw a winner for “${state.settings.currentPrize}”`}
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
      setLive({ server, room: r });
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
    if (!room || !confirm('Stop the online live view? People watching will see "The live draw has ended" and this link stops working.')) return;
    setBusy(true);
    try {
      await liveClose(server, room);
    } catch {
      /* server gone or room already closed: forget it anyway */
    }
    setLive({ room: undefined, showQr: false });
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
      prompt('Copy this link:', link);
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

/* ---------------------------------------------------------- winners */
function WinnersCard({ state, update }: CardProps) {
  const undo = (id: string, name: string) => {
    if (!confirm(`Remove ${name} from the winners? They go back into the draw (if they're not excluded).`)) return;
    update((s) => ({ ...s, winners: s.winners.filter((w) => w.id !== id) }));
  };
  /** Winner isn't here to collect: keep the record (marked), keep them out of later draws, redraw the prize. */
  const forfeit = (id: string, name: string, prize: string) => {
    if (!confirm(`${name} is not present?\n\nThey stay in the record as "Not present", can't be drawn again, and "${prize}" goes back up so you can draw again.`)) return;
    update((s) => ({
      ...s,
      winners: s.winners.map((w) => (w.id === id ? { ...w, forfeited: true } : w)),
      settings: { ...s.settings, currentPrize: prize },
    }));
    sendCommand({ type: 'reset-view' });
  };
  const clear = () => {
    if (!confirm('Clear all winners? Everyone becomes eligible again. Export the winners first if you need a record.')) return;
    update((s) => ({ ...s, winners: [] }));
  };

  return (
    <div className="card">
      <div className="card-head">
        <h2>🏆 Winners</h2>
        <div className="row">
          <button className="btn sm" disabled={!state.winners.length} onClick={() => void downloadWinners(state.winners)}>
            <IconDownload /> Excel
          </button>
          <button className="btn sm danger" disabled={!state.winners.length} onClick={clear}>
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
          {[...state.winners].reverse().map((w) => (
            <li key={w.id} className={w.forfeited ? 'forfeited' : ''}>
              <span className="no">{w.drawNo}</span>
              <div className="who">
                <span className="name">{w.name}</span>
                {w.forfeited && <span className="badge out" style={{ marginLeft: 8 }}>Not present</span>}
                <div className="what">
                  {w.prize}
                  {w.ticket ? ` · ${w.ticket}` : ''} · {new Date(w.at).toLocaleTimeString()} · 1 of {w.pool}
                </div>
              </div>
              {!w.forfeited && (
                <button className="btn sm" title="Winner is not here: keep the record, redraw this prize" onClick={() => forfeit(w.id, w.name, w.prize)}>
                  Not present
                </button>
              )}
              <button className="icon-btn" style={{ width: 32, height: 32 }} title="Undo this win" aria-label={`Undo win for ${w.name}`} onClick={() => undo(w.id, w.name)}>
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
    if (!p || state.settings.prizes.includes(p)) return;
    update((s) => ({
      ...s,
      settings: { ...s.settings, prizes: [...s.settings.prizes, p], prizeQty: { ...s.settings.prizeQty, [p]: clampQty(qty) } },
    }));
    setName('');
    setQty(1);
  };
  const remove = (p: string) =>
    update((s) => {
      const prizes = s.settings.prizes.filter((x) => x !== p);
      return { ...s, settings: { ...s.settings, prizes, currentPrize: s.settings.currentPrize === p ? prizes[0] ?? 'Lucky Draw' : s.settings.currentPrize } };
    });
  const setCount = (p: string, n: number) =>
    update((s) => ({ ...s, settings: { ...s.settings, prizeQty: { ...s.settings.prizeQty, [p]: clampQty(n) } } }));
  const moveUp = (i: number) =>
    update((s) => {
      const prizes = [...s.settings.prizes];
      [prizes[i - 1], prizes[i]] = [prizes[i], prizes[i - 1]];
      return { ...s, settings: { ...s.settings, prizes } };
    });

  return (
    <div className="card">
      <div className="card-head">
        <h2>🎁 Prizes</h2>
      </div>
      <p className="help">
        Set how many of each prize there are. When the last one is drawn, the next prize in this order is selected automatically. The prize name
        appears on the big screen above the reel and on the winner card.
      </p>
      <ul className="prize-list">
        {state.settings.prizes.map((p, i) => {
          const left = prizeLeft(state, p);
          return (
            <li key={p}>
              <button className="icon-btn" style={{ width: 28, height: 28 }} disabled={i === 0} onClick={() => moveUp(i)} aria-label={`Move ${p} up`} title="Move up">
                ↑
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
              <button className="icon-btn" style={{ width: 28, height: 28 }} aria-label={`Remove ${p}`} title="Remove" onClick={() => remove(p)}>
                ×
              </button>
            </li>
          );
        })}
      </ul>
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

/** Shrink an uploaded logo to at most 320×160 so it stays small in browser storage. */
async function logoToDataUrl(file: File): Promise<string> {
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
    const k = Math.min(1, 320 / w, 160 / h);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * k));
    c.height = Math.max(1, Math.round(h * k));
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* --------------------------------------------------------- settings */
function SettingsCard({ state, update }: CardProps) {
  const s = state.settings;
  const logoRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof RaffleState['settings']>(k: K, v: RaffleState['settings'][K]) =>
    update((st) => ({ ...st, settings: { ...st.settings, [k]: v } }));

  const uploadLogo = async (f?: File) => {
    if (!f) return;
    try {
      const logo = await logoToDataUrl(f);
      // First logo: show it next to the name straight away.
      update((st) => ({
        ...st,
        settings: { ...st.settings, logo, companyDisplay: st.settings.companyDisplay === 'name' ? 'both' : st.settings.companyDisplay },
      }));
    } catch {
      alert('That image could not be read. Use a PNG, JPG or SVG file.');
    } finally {
      if (logoRef.current) logoRef.current.value = '';
    }
  };

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
        <b>Company</b>
        <span style={{ display: 'block', marginBottom: 10 }}>Top-left of the display: the logo replaces the cursor icon, the name sits above the event title</span>
        <div className="col" style={{ gap: 10 }}>
          <label className="field">
            Company name
            <input className="input" value={s.companyName} placeholder="e.g. Guardian" onChange={(e) => set('companyName', e.target.value)} />
          </label>
          <div className="row" style={{ alignItems: 'center' }}>
            {s.logo && <img src={s.logo} alt="Current company logo" className="logo-preview" />}
            <button className="btn sm" onClick={() => logoRef.current?.click()}>
              <IconUpload /> {s.logo ? 'Change logo' : 'Upload logo'}
            </button>
            {s.logo && (
              <button className="btn sm" onClick={() => update((st) => ({ ...st, settings: { ...st.settings, logo: undefined, companyDisplay: 'name' } }))}>
                Remove logo
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
      <Setting title="Name bubbles" desc="Float every participant's name on the welcome screen" checked={s.showBubbles} onChange={(v) => set('showBubbles', v)} />
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

/* ----------------------------------------------------------- backup */
function BackupCard({ state, update }: CardProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `click2026-raffle-backup-${new Date().toISOString().slice(0, 16).replace(':', '')}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = async (f?: File) => {
    if (!f) return;
    try {
      const data = JSON.parse(await f.text()) as RaffleState;
      if (!Array.isArray(data.participants) || !data.settings) throw new Error();
      if (!confirm(`Restore backup with ${data.participants.length} participants and ${data.winners?.length ?? 0} winners? This replaces everything here.`)) return;
      update(() => ({ ...defaultState(), ...data, settings: { ...defaultState().settings, ...data.settings }, winners: data.winners ?? [] }));
    } catch {
      alert('That file is not a valid raffle backup.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const reset = () => {
    if (prompt('Type RESET to delete all participants, winners and settings on this computer.') !== 'RESET') return;
    update(() => defaultState());
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
        <button className="btn danger" onClick={reset}>
          <IconTrash /> Reset all
        </button>
      </div>
    </div>
  );
}
