'use client';

import { useMemo, useState } from 'react';
import { IconBan, IconDownload, IconSearch, IconTrash } from '@/components/Icons';
import { Switch } from './ui';
import { downloadParticipants } from '@/lib/excel';
import { type RaffleState, eligible, normalize } from '@/lib/store';

type Filter = 'all' | 'in' | 'out' | 'won';
const PAGE = 250;

export default function ParticipantList({
  state,
  update,
}: {
  state: RaffleState;
  update: (fn: (s: RaffleState) => RaffleState) => void;
}) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [limit, setLimit] = useState(PAGE);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulk, setBulk] = useState('');
  const [bulkResult, setBulkResult] = useState('');

  const wonIds = useMemo(() => new Set(state.winners.filter((w) => !w.forfeited).map((w) => w.participantId)), [state.winners]);
  const forfeitIds = useMemo(() => new Set(state.winners.filter((w) => w.forfeited).map((w) => w.participantId)), [state.winners]);
  const inDraw = useMemo(() => new Set(eligible(state).map((p) => p.id)), [state]);

  const list = useMemo(() => {
    const nq = normalize(q);
    return state.participants.filter((p) => {
      if (filter === 'in' && !inDraw.has(p.id)) return false;
      if (filter === 'out' && !p.excluded) return false;
      if (filter === 'won' && !wonIds.has(p.id)) return false;
      if (!nq) return true;
      return normalize(`${p.name} ${p.ticket ?? ''} ${p.group ?? ''}`).includes(nq);
    });
  }, [state.participants, filter, q, wonIds, inDraw]);

  const setExcluded = (id: string, excluded: boolean) =>
    update((s) => ({ ...s, participants: s.participants.map((p) => (p.id === id ? { ...p, excluded } : p)) }));

  const remove = (id: string, name: string) => {
    if (!confirm(`Remove ${name} from the participant list?`)) return;
    update((s) => ({ ...s, participants: s.participants.filter((p) => p.id !== id) }));
  };

  const setAllShown = (excluded: boolean) => {
    const ids = new Set(list.map((p) => p.id));
    update((s) => ({ ...s, participants: s.participants.map((p) => (ids.has(p.id) ? { ...p, excluded } : p)) }));
  };

  const applyBulk = () => {
    const wanted = bulk
      .split(/\r?\n|,/)
      .map((l) => normalize(l))
      .filter(Boolean);
    if (!wanted.length) return;
    const hit = new Set<string>();
    const ids = new Set<string>();
    for (const p of state.participants) {
      const n = normalize(p.name);
      const t = p.ticket ? normalize(p.ticket) : '';
      for (const w of wanted) {
        if (w === n || (t && w === t)) {
          ids.add(p.id);
          hit.add(w);
        }
      }
    }
    update((s) => ({ ...s, participants: s.participants.map((p) => (ids.has(p.id) ? { ...p, excluded: true } : p)) }));
    const missing = wanted.filter((w) => !hit.has(w));
    setBulkResult(
      `Excluded ${ids.size} participant${ids.size === 1 ? '' : 's'}.` + (missing.length ? ` Not found: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? '…' : ''}` : ''),
    );
    setBulk('');
  };

  const clearAll = () => {
    if (!state.participants.length) return;
    if (!confirm(`Delete all ${state.participants.length} participants? Winner records stay in the winners list.`)) return;
    update((s) => ({ ...s, participants: [] }));
  };

  const counts = {
    all: state.participants.length,
    out: state.participants.filter((p) => p.excluded).length,
    won: state.participants.filter((p) => wonIds.has(p.id)).length,
  };

  return (
    <div className="card">
      <div className="card-head">
        <h2>
          <span className="num">2</span> Participants
        </h2>
        <div className="row">
          <button className="btn sm" onClick={() => setBulkOpen((v) => !v)}>
            <IconBan /> Exclude by list
          </button>
          <button className="btn sm" onClick={() => void downloadParticipants(state.participants)} disabled={!state.participants.length}>
            <IconDownload /> Export
          </button>
          <button className="btn sm danger" onClick={clearAll} disabled={!state.participants.length}>
            <IconTrash /> Clear
          </button>
        </div>
      </div>
      <p className="help">Switch someone off to keep them out of the draw (staff, previous winners, no-shows). They stay on the list and can be switched back on any time.</p>

      {bulkOpen && (
        <div className="preview" style={{ marginTop: 0, marginBottom: 14 }}>
          <h3>Exclude several people at once</h3>
          <p className="sub">Paste names or ticket IDs — one per line. Exact matches (ignoring capitals and extra spaces) are switched off.</p>
          <textarea className="textarea" style={{ minHeight: 110 }} value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={'Nimal Perera\nC26-0042'} />
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn primary" onClick={applyBulk} disabled={!bulk.trim()}>
              Exclude matches
            </button>
            <button className="btn" onClick={() => { setBulkOpen(false); setBulkResult(''); }}>
              Close
            </button>
          </div>
          {bulkResult && <p className="note" style={{ marginBottom: 0 }}>{bulkResult}</p>}
        </div>
      )}

      <div className="toolbar">
        <div style={{ position: 'relative', flex: '1 1 220px' }}>
          <IconSearch style={{ position: 'absolute', left: 12, top: 13, width: 16, height: 16, color: 'var(--dim)' }} />
          <input className="input" style={{ paddingLeft: 36 }} placeholder="Search name, ticket or branch" value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} />
        </div>
        <div className="seg" role="group" aria-label="Filter">
          {(
            [
              ['all', `All ${counts.all}`],
              ['in', 'In draw'],
              ['out', `Excluded ${counts.out}`],
              ['won', `Won ${counts.won}`],
            ] as [Filter, string][]
          ).map(([k, label]) => (
            <button key={k} className={filter === k ? 'active' : ''} onClick={() => { setFilter(k); setLimit(PAGE); }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {state.participants.length === 0 ? (
        <div className="empty-card" style={{ maxWidth: 'none', textAlign: 'center' }}>No participants yet. Upload an Excel file, paste a list or type names above.</div>
      ) : (
        <>
          <div className="row" style={{ marginBottom: 10, justifyContent: 'space-between' }}>
            <span className="note">
              {list.length.toLocaleString()} shown{list.length > limit ? ` (first ${limit})` : ''}
            </span>
            <div className="row">
              <button className="btn sm" onClick={() => setAllShown(false)} disabled={!list.length}>
                Include all shown
              </button>
              <button className="btn sm" onClick={() => setAllShown(true)} disabled={!list.length}>
                Exclude all shown
              </button>
            </div>
          </div>
          <div className="table-wrap people">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 70 }}>In draw</th>
                  <th>Name</th>
                  <th>Ticket / ID</th>
                  <th className="hide-sm">Branch</th>
                  <th>Status</th>
                  <th style={{ width: 44 }} />
                </tr>
              </thead>
              <tbody>
                {list.slice(0, limit).map((p) => {
                  const won = wonIds.has(p.id);
                  return (
                    <tr key={p.id} className={p.excluded ? 'off' : ''}>
                      <td>
                        <Switch label={`Include ${p.name}`} checked={!p.excluded} onChange={(v) => setExcluded(p.id, !v)} />
                      </td>
                      <td className="name">{p.name}</td>
                      <td>{p.ticket ?? '—'}</td>
                      <td className="hide-sm">{p.group ?? '—'}</td>
                      <td>
                        {won ? <span className="badge win">Winner</span> : forfeitIds.has(p.id) ? <span className="badge out">Not present</span> : p.excluded ? <span className="badge out">Excluded</span> : <span className="badge in">Eligible</span>}
                      </td>
                      <td>
                        <button className="icon-btn" style={{ width: 32, height: 32 }} onClick={() => remove(p.id, p.name)} aria-label={`Remove ${p.name}`} title="Remove">
                          <IconTrash style={{ width: 15, height: 15 }} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {list.length > limit && (
            <button className="btn" style={{ marginTop: 10, width: '100%' }} onClick={() => setLimit((l) => l + PAGE)}>
              Show more
            </button>
          )}
        </>
      )}
    </div>
  );
}
