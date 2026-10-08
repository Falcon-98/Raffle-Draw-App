'use client';

import type { Participant, Winner } from './store';
import { BRAND } from './config';

export type ImportRow = Omit<Participant, 'id'>;

type Cell = string | number | boolean | Date | null | undefined;

const NAME_RE = /^(full\s*|participant\s*|customer\s*|attendee\s*)?name$/i; // best: "Name", "Full name"…
const NAME_LOOSE_RE = /name|participant|customer|attendee/i; // fallback, ignoring ID-like columns
const TICKET_RE = /ticket|id|no\.?$|number|code|reg/i;
const GROUP_RE = /branch|dept|department|group|team|company|region|city|outlet|organi[sz]ation/i;

const cellText = (c: Cell) =>
  c === null || c === undefined
    ? ''
    : c instanceof Date
      ? c.toISOString().slice(0, 10)
      : String(c).replace(/\s+/g, ' ').trim();

/** Turn a grid of cells into participants, auto-detecting a header row. */
export function rowsToParticipants(rows: Cell[][]): ImportRow[] {
  const clean = rows.map((r) => r.map(cellText)).filter((r) => r.some(Boolean));
  if (!clean.length) return [];

  let nameIdx = 0;
  let ticketIdx = -1;
  let groupIdx = -1;
  let start = 0;

  const header = clean[0];
  let hNameIdx = header.findIndex((h) => NAME_RE.test(h));
  if (hNameIdx === -1) hNameIdx = header.findIndex((h) => NAME_LOOSE_RE.test(h) && !/\b(id|no|number|code)\b/i.test(h));
  if (hNameIdx !== -1) {
    start = 1;
    nameIdx = hNameIdx;
    ticketIdx = header.findIndex((h, i) => i !== nameIdx && TICKET_RE.test(h));
    groupIdx = header.findIndex((h, i) => i !== nameIdx && i !== ticketIdx && GROUP_RE.test(h));
  } else if (header.length > 1) {
    // No header: column A = name, B = ticket, C = group
    ticketIdx = 1;
    groupIdx = header.length > 2 ? 2 : -1;
  }

  const out: ImportRow[] = [];
  for (const r of clean.slice(start)) {
    const name = r[nameIdx] ?? '';
    if (!name) continue;
    out.push({
      name,
      ticket: ticketIdx >= 0 ? r[ticketIdx] || undefined : undefined,
      group: groupIdx >= 0 ? r[groupIdx] || undefined : undefined,
    });
  }
  return out;
}

/** Minimal CSV parser that understands quoted fields. */
function parseCsv(text: string): string[][] {
  const delim = text.split('\n')[0].includes('\t') ? '\t' : text.split('\n')[0].includes(';') && !text.split('\n')[0].includes(',') ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') q = false;
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export async function parseFile(file: File): Promise<ImportRow[]> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'csv' || ext === 'txt' || ext === 'tsv') {
    return rowsToParticipants(parseCsv(await file.text()));
  }
  if (ext === 'xls') {
    throw new Error('Old .xls files are not supported. In Excel choose File → Save As → Excel Workbook (.xlsx), or save as CSV.');
  }
  const { readSheet } = await import('read-excel-file/browser');
  const rows = (await readSheet(file)) as Cell[][];
  return rowsToParticipants(rows);
}

/** Pasted text: one person per line. Tab-separated columns (copied from Excel) are understood. */
export function parsePasted(text: string): ImportRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const rows = lines.map((l) => (l.includes('\t') ? l.split('\t') : [l]));
  return rowsToParticipants(rows);
}

/* ---------------------------------------------------------------- export */

const HEAD = { fontWeight: 'bold' as const, backgroundColor: '#4F46E5', color: '#FFFFFF' };

export async function downloadTemplate() {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const data = [
    [
      { value: 'Name', ...HEAD },
      { value: 'Ticket / ID', ...HEAD },
      { value: 'Branch / Department', ...HEAD },
    ],
    ...[
      ['Nimal Perera', 'C26-0001', 'Colombo'],
      ['Sanduni Fernando', 'C26-0002', 'Kandy'],
      ['Kasun Jayawardena', 'C26-0003', 'Galle'],
    ].map((r) => r.map((value) => ({ value }))),
  ];
  const help = [
    [{ value: `${BRAND.company} ${BRAND.event} — how to fill the participant sheet`, fontWeight: 'bold' as const }],
    [{ value: '1. Use the "Participants" sheet. Keep the header row exactly as it is.' }],
    [{ value: '2. Name is required. Ticket / ID and Branch / Department are optional.' }],
    [{ value: '3. One person per row. Delete the three example rows before uploading.' }],
    [{ value: '4. If someone appears twice with the same Ticket / ID (or same name when there is no ID), the duplicate is skipped.' }],
    [{ value: '5. Save as .xlsx (or .csv) and upload it in the admin panel.' }],
  ];
  await writeXlsxFile([
    { sheet: 'Participants', data, columns: [{ width: 34 }, { width: 16 }, { width: 24 }], stickyRowsCount: 1 },
    { sheet: 'How to use', data: help, columns: [{ width: 100 }] },
  ]).toFile('Click2026-Raffle-Template.xlsx');
}

export async function downloadWinners(winners: Winner[]) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const head = ['Draw #', 'Prize', 'Winner', 'Ticket / ID', 'Branch / Department', 'Status', 'Drawn at', 'Eligible pool', 'Pool fingerprint'];
  const data = [
    head.map((value) => ({ value, ...HEAD })),
    ...winners.map((w) =>
      [
        String(w.drawNo),
        w.prize,
        w.name,
        w.ticket ?? '',
        w.group ?? '',
        w.forfeited ? 'Not present (redrawn)' : 'Winner',
        new Date(w.at).toLocaleString(),
        String(w.pool),
        w.fingerprint,
      ].map((value) => ({ value })),
    ),
  ];
  await writeXlsxFile(data, {
    sheet: 'Winners',
    columns: [{ width: 8 }, { width: 18 }, { width: 30 }, { width: 14 }, { width: 22 }, { width: 22 }, { width: 22 }, { width: 13 }, { width: 18 }],
    stickyRowsCount: 1,
  }).toFile(`Click2026-Winners-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export async function downloadParticipants(list: Participant[]) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const data = [
    ['Name', 'Ticket / ID', 'Branch / Department', 'Status'].map((value) => ({ value, ...HEAD })),
    ...list.map((p) => [p.name, p.ticket ?? '', p.group ?? '', p.excluded ? 'Excluded' : 'Included'].map((value) => ({ value }))),
  ];
  await writeXlsxFile(data, {
    sheet: 'Participants',
    columns: [{ width: 34 }, { width: 16 }, { width: 24 }, { width: 12 }],
    stickyRowsCount: 1,
  }).toFile('Click2026-Participants.xlsx');
}
