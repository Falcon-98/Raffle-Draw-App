'use client';

import type { Participant, Winner } from './store';
import { BRAND } from './config';

export type ImportRow = Omit<Participant, 'id'>;

type Cell = string | number | boolean | Date | null | undefined;

// Header names, matched after trimming and lower-casing. The event list uses
// First Name · Surname · Organization · Code; older lists may have one Name column.
const FIRST_RE = /^(first|given|fore)\s*name$|^first$/;
const LAST_RE = /^(last|sur|family)\s*name$|^surname$|^last$/;
const NAME_RE = /^(full\s*|participant\s*|customer\s*|attendee\s*|guest\s*)?name$/;
const CODE_RE = /^code$|code|ticket|^id$|\bid\b|reg(istration)?\s*(no|number|id)?$/;
const GROUP_RE = /organi[sz]ation|company|branch|dept|department|group|team|region|city|outlet/;
// Never used for the code or organization, even if the header looks similar: these are private.
const PRIVATE_RE = /mobile|phone|whats\s*app|e-?mail|passport|nic\b|identity|designation|address/;

const cellText = (c: Cell) =>
  c === null || c === undefined
    ? ''
    : c instanceof Date
      ? c.toISOString().slice(0, 10)
      : String(c).replace(/\s+/g, ' ').trim();

/** "vinu" → "Vinu", "EGODA GAMAGE" → "Egoda Gamage"; names typed in mixed case are kept as typed. */
export function tidyName(v: string) {
  return v
    .split(' ')
    .map((w) => (w.length > 1 && (w === w.toLowerCase() || w === w.toUpperCase()) ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(' ');
}

/** First + last name, without repeating the surname when it was already typed into the first-name cell. */
export function joinName(first: string, last: string) {
  const f = first.trim();
  const l = last.trim();
  if (!l || f.toLowerCase().endsWith(l.toLowerCase())) return f;
  if (!f || l.toLowerCase().startsWith(f.toLowerCase())) return l;
  return `${f} ${l}`;
}

/** Turn a grid of cells into participants, auto-detecting a header row. */
export function rowsToParticipants(rows: Cell[][]): ImportRow[] {
  const clean = rows.map((r) => r.map(cellText)).filter((r) => r.some(Boolean));
  if (!clean.length) return [];

  const header = clean[0].map((h) => h.toLowerCase());
  const find = (re: RegExp, skip: number[] = []) => header.findIndex((h, i) => h && !skip.includes(i) && !PRIVATE_RE.test(h) && re.test(h));
  const firstIdx = find(FIRST_RE);
  const lastIdx = find(LAST_RE);
  const nameIdx = firstIdx === -1 ? find(NAME_RE) : -1;
  const hasHeader = firstIdx !== -1 || nameIdx !== -1;

  let cols: { first: number; last: number; name: number; code: number; group: number };
  if (hasHeader) {
    const used = [firstIdx, lastIdx, nameIdx].filter((i) => i !== -1);
    // An exact "Code" column wins over other code-like columns.
    const exactCode = header.findIndex((h) => h === 'code');
    const code = exactCode !== -1 ? exactCode : find(CODE_RE, used);
    // Prefer "Organization" over branch/department-like columns.
    const org = header.findIndex((h, i) => i !== code && !used.includes(i) && /organi[sz]ation/.test(h));
    cols = { first: firstIdx, last: lastIdx, name: nameIdx, code, group: org !== -1 ? org : find(GROUP_RE, [...used, code]) };
  } else {
    // No header: column A = name, B = code, C = organization
    cols = { first: -1, last: -1, name: 0, code: clean[0].length > 1 ? 1 : -1, group: clean[0].length > 2 ? 2 : -1 };
  }

  const at = (r: string[], i: number) => (i >= 0 ? r[i] ?? '' : '');
  const out: ImportRow[] = [];
  for (const r of clean.slice(hasHeader ? 1 : 0)) {
    const first = tidyName(at(r, cols.first));
    const last = tidyName(at(r, cols.last));
    const name = cols.name >= 0 ? tidyName(at(r, cols.name)) : joinName(first, last);
    if (!name) continue;
    out.push({
      name,
      first: cols.first >= 0 ? first || undefined : undefined,
      last: cols.first >= 0 ? last || undefined : undefined,
      ticket: at(r, cols.code) || undefined,
      group: at(r, cols.group) || undefined,
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

/** The four fields the raffle uses, in this order everywhere (template, exports). */
const COLUMNS = ['First Name', 'Last Name', 'Code', 'Organization'];

/** First / last name for exports; older records only have the full name. */
const nameParts = (p: { name: string; first?: string; last?: string }) => {
  if (p.first || p.last) return [p.first ?? '', p.last ?? ''];
  const i = p.name.lastIndexOf(' ');
  return i > 0 ? [p.name.slice(0, i), p.name.slice(i + 1)] : [p.name, ''];
};

export async function downloadTemplate() {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const data = [
    COLUMNS.map((value) => ({ value, ...HEAD })),
    ...[
      ['Nimal', 'Perera', 'C26NP0001ABC', 'Example Holdings (Pvt) Ltd'],
      ['Sanduni', 'Fernando', 'C26SF0002DEF', 'Sample Networks'],
      ['Kasun', 'Jayawardena', 'C26KJ0003GHI', 'Demo Technologies'],
    ].map((r) => r.map((value) => ({ value }))),
  ];
  const help = [
    [{ value: `${BRAND.company} ${BRAND.event} — how to fill the participant sheet`, fontWeight: 'bold' as const }],
    [{ value: '1. Use the "Participants" sheet. Keep the header row (First Name, Last Name, Code, Organization).' }],
    [{ value: '2. First Name is required. Last Name, Code and Organization are optional but recommended.' }],
    [{ value: '3. The registration export works as it is: its First Name, Surname, Organization and Code columns are read, every other column (email, phone…) is ignored.' }],
    [{ value: '4. One person per row. Delete the three example rows before uploading.' }],
    [{ value: '5. If someone appears twice with the same Code (or the same name when there is no code), the duplicate is skipped.' }],
    [{ value: '6. Save as .xlsx (or .csv) and upload it in the admin panel.' }],
  ];
  await writeXlsxFile([
    { sheet: 'Participants', data, columns: [{ width: 18 }, { width: 22 }, { width: 18 }, { width: 40 }], stickyRowsCount: 1 },
    { sheet: 'How to use', data: help, columns: [{ width: 100 }] },
  ]).toFile('Click2026-Raffle-Template.xlsx');
}

/** Winners in the order given (the admin passes them in prize order: 1st, 2nd, 3rd …). */
export async function downloadWinners(winners: Winner[]) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const head = ['Draw #', 'Prize', ...COLUMNS, 'Status', 'Drawn at', 'Eligible pool', 'Pool fingerprint'];
  const data = [
    head.map((value) => ({ value, ...HEAD })),
    ...winners.map((w) =>
      [
        String(w.drawNo),
        w.prize,
        ...nameParts(w),
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
    columns: [{ width: 8 }, { width: 18 }, { width: 18 }, { width: 22 }, { width: 16 }, { width: 36 }, { width: 22 }, { width: 22 }, { width: 13 }, { width: 18 }],
    stickyRowsCount: 1,
  }).toFile(`Click2026-Winners-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export async function downloadParticipants(list: Participant[]) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const data = [
    [...COLUMNS, 'Status'].map((value) => ({ value, ...HEAD })),
    ...list.map((p) => [...nameParts(p), p.ticket ?? '', p.group ?? '', p.excluded ? 'Excluded' : 'Included'].map((value) => ({ value }))),
  ];
  await writeXlsxFile(data, {
    sheet: 'Participants',
    columns: [{ width: 18 }, { width: 22 }, { width: 16 }, { width: 36 }, { width: 12 }],
    stickyRowsCount: 1,
  }).toFile('Click2026-Participants.xlsx');
}
