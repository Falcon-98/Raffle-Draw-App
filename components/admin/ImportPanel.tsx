'use client';

import { DragEvent, FormEvent, useRef, useState } from 'react';
import { IconClipboard, IconDownload, IconPencil, IconUpload } from '@/components/Icons';
import { downloadTemplate, parseFile, parsePasted, type ImportRow } from '@/lib/excel';
import { type Participant, type RaffleState, participantKey, uid } from '@/lib/store';

type Tab = 'upload' | 'paste' | 'manual';

export default function ImportPanel({
  state,
  update,
}: {
  state: RaffleState;
  update: (fn: (s: RaffleState) => RaffleState) => void;
}) {
  const [tab, setTab] = useState<Tab>('upload');
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [source, setSource] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [paste, setPaste] = useState('');
  const [manual, setManual] = useState({ name: '', ticket: '', group: '' });
  const [done, setDone] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const flashDone = (msg: string) => {
    setDone(msg);
    setTimeout(() => setDone(''), 4000);
  };

  const handleFile = async (file?: File | null) => {
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      const r = await parseFile(file);
      if (!r.length) throw new Error('No names were found. Make sure the first sheet has a "Name" column.');
      setRows(r);
      setSource(file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that file.');
      setRows(null);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    void handleFile(e.dataTransfer.files?.[0]);
  };

  const readPaste = () => {
    setError('');
    const r = parsePasted(paste);
    if (!r.length) {
      setError('Paste at least one name — one person per line.');
      return;
    }
    setRows(r);
    setSource('pasted list');
  };

  // Work out what an import would actually add.
  const analysis = (() => {
    if (!rows) return null;
    const existing = new Set(state.participants.map(participantKey));
    const seen = new Set<string>();
    let dupInFile = 0;
    let dupExisting = 0;
    const fresh: ImportRow[] = [];
    for (const r of rows) {
      const k = participantKey(r);
      if (seen.has(k)) {
        dupInFile++;
        continue;
      }
      seen.add(k);
      if (existing.has(k)) dupExisting++;
      fresh.push(r);
    }
    return { unique: fresh, dupInFile, dupExisting, newOnes: fresh.filter((r) => !existing.has(participantKey(r))) };
  })();

  const commit = (mode: 'append' | 'replace') => {
    if (!analysis) return;
    if (mode === 'replace') {
      const msg = state.winners.length
        ? `Replace all ${state.participants.length} participants? The ${state.winners.length} winner record(s) are kept, but their names leave the participant list.`
        : `Replace all ${state.participants.length} participants with ${analysis.unique.length} new ones?`;
      if (state.participants.length && !confirm(msg)) return;
    }
    const toAdd: Participant[] = (mode === 'replace' ? analysis.unique : analysis.newOnes).map((r) => ({ ...r, id: uid() }));
    update((s) => ({ ...s, participants: mode === 'replace' ? toAdd : [...s.participants, ...toAdd] }));
    flashDone(`${mode === 'replace' ? 'Replaced list with' : 'Added'} ${toAdd.length.toLocaleString()} participant${toAdd.length === 1 ? '' : 's'}.`);
    setRows(null);
    setPaste('');
  };

  const addManual = (e: FormEvent) => {
    e.preventDefault();
    const name = manual.name.trim().replace(/\s+/g, ' ');
    if (!name) return;
    const p: Participant = { id: uid(), name, ticket: manual.ticket.trim() || undefined, group: manual.group.trim() || undefined };
    const k = participantKey(p);
    if (state.participants.some((x) => participantKey(x) === k)) {
      setError(`"${name}"${p.ticket ? ` (${p.ticket})` : ''} is already on the list.`);
      return;
    }
    setError('');
    update((s) => ({ ...s, participants: [...s.participants, p] }));
    setManual({ name: '', ticket: manual.ticket && /\d+$/.test(manual.ticket) ? bump(manual.ticket) : '', group: manual.group });
    flashDone(`Added ${name}.`);
    nameRef.current?.focus();
  };

  return (
    <div className="card">
      <div className="card-head">
        <h2>
          <span className="num">1</span> Add participants
        </h2>
        <button className="btn sm" onClick={() => void downloadTemplate()}>
          <IconDownload /> Excel template
        </button>
      </div>

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'upload'} className={`tab${tab === 'upload' ? ' active' : ''}`} onClick={() => setTab('upload')}>
          <IconUpload /> Upload Excel
        </button>
        <button role="tab" aria-selected={tab === 'paste'} className={`tab${tab === 'paste' ? ' active' : ''}`} onClick={() => setTab('paste')}>
          <IconClipboard /> Copy &amp; paste
        </button>
        <button role="tab" aria-selected={tab === 'manual'} className={`tab${tab === 'manual' ? ' active' : ''}`} onClick={() => setTab('manual')}>
          <IconPencil /> Type in
        </button>
      </div>

      {tab === 'upload' && (
        <>
          <label
            className={`drop${over ? ' over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={onDrop}
          >
            <IconUpload />
            <strong>{busy ? 'Reading file…' : 'Drop your Excel file here, or click to choose'}</strong>
            <span>.xlsx or .csv · columns: Name (required), Ticket / ID, Branch / Department</span>
            <input ref={fileRef} type="file" accept=".xlsx,.csv,.tsv,.txt,.xls" hidden onChange={(e) => void handleFile(e.target.files?.[0])} />
          </label>
          <p className="note" style={{ marginBottom: 0 }}>
            Not sure about the format? Download the <button className="btn sm" style={{ display: 'inline-flex', padding: '2px 8px', verticalAlign: 'middle' }} onClick={() => void downloadTemplate()}>Excel template</button>, fill it in and upload it here.
          </p>
        </>
      )}

      {tab === 'paste' && (
        <div className="col" style={{ gap: 10 }}>
          <textarea
            className="textarea"
            placeholder={'One person per line, e.g.\nNimal Perera\nSanduni Fernando\n\nYou can also copy rows straight from Excel (Name, Ticket, Branch).'}
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
          />
          <div className="row">
            <button className="btn primary" onClick={readPaste} disabled={!paste.trim()}>
              Check names
            </button>
            <span className="note">{paste.split(/\r?\n/).filter((l) => l.trim()).length} line(s)</span>
          </div>
        </div>
      )}

      {tab === 'manual' && (
        <form className="grid-3" onSubmit={addManual}>
          <label className="field">
            Name *
            <input ref={nameRef} className="input" value={manual.name} onChange={(e) => setManual({ ...manual, name: e.target.value })} placeholder="Full name" required />
          </label>
          <label className="field">
            Ticket / ID
            <input className="input" value={manual.ticket} onChange={(e) => setManual({ ...manual, ticket: e.target.value })} placeholder="Optional" />
          </label>
          <label className="field">
            Branch
            <input className="input" value={manual.group} onChange={(e) => setManual({ ...manual, group: e.target.value })} placeholder="Optional" />
          </label>
          <button className="btn primary" type="submit" style={{ height: 44 }}>
            Add
          </button>
        </form>
      )}

      {error && (
        <p className="note" style={{ color: 'var(--red)', marginBottom: 0 }}>
          {error}
        </p>
      )}
      {done && (
        <p className="note" style={{ color: 'var(--green)', marginBottom: 0 }}>
          ✓ {done}
        </p>
      )}

      {analysis && rows && (
        <div className="preview">
          <h3>
            {analysis.unique.length.toLocaleString()} participant{analysis.unique.length === 1 ? '' : 's'} found in {source}
          </h3>
          <p className="sub">
            {analysis.newOnes.length.toLocaleString()} new
            {analysis.dupExisting ? ` · ${analysis.dupExisting} already on the list` : ''}
            {analysis.dupInFile ? ` · ${analysis.dupInFile} duplicate row(s) skipped` : ''}
          </p>
          <div className="table-wrap" style={{ maxHeight: 240 }}>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Name</th>
                  <th>Ticket / ID</th>
                  <th>Branch</th>
                </tr>
              </thead>
              <tbody>
                {analysis.unique.slice(0, 50).map((r, i) => (
                  <tr key={i}>
                    <td className="note">{i + 1}</td>
                    <td>{r.name}</td>
                    <td>{r.ticket ?? '—'}</td>
                    <td>{r.group ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {analysis.unique.length > 50 && <p className="note">…and {(analysis.unique.length - 50).toLocaleString()} more</p>}
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn primary" onClick={() => commit('append')} disabled={!analysis.newOnes.length}>
              Add {analysis.newOnes.length.toLocaleString()} to the list
            </button>
            {state.participants.length > 0 && (
              <button className="btn" onClick={() => commit('replace')}>
                Replace current list
              </button>
            )}
            <button className="btn" onClick={() => setRows(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** "C26-0009" → "C26-0010", keeping zero padding — speeds up manual entry. */
function bump(t: string) {
  return t.replace(/(\d+)$/, (m) => String(Number(m) + 1).padStart(m.length, '0'));
}
