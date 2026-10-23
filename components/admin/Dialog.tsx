'use client';

/**
 * In-page confirm / prompt / message dialogs for the admin.
 *
 * The browser's own confirm() and prompt() can be switched off ("Prevent this page from creating
 * additional dialogs"), are blocked in some kiosk / embedded browsers, and then silently answer
 * "Cancel" — so buttons like "Clear winners" or "Reset all" seemed to do nothing. These always show.
 *
 *   if (!(await confirmDialog({ title: 'Clear all winners?', okLabel: 'Clear', danger: true }))) return;
 *   const name = await promptDialog({ title: 'Prize name', value: 'TV' });
 *   await messageDialog('That file is not a valid raffle backup.');
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

type Request = {
  title: string;
  message?: string;
  okLabel?: string;
  cancelLabel?: string | null; // null = no cancel button (messages)
  danger?: boolean;
  /** Show a text field; the dialog then answers with its value. */
  input?: { value?: string; label?: string; readOnly?: boolean };
  /** The OK button stays disabled until this word is typed (any case). */
  typeToConfirm?: string;
};
type Pending = Request & { resolve: (v: string | boolean | null) => void };

let show: ((p: Pending) => void) | null = null;
const queue: Pending[] = [];

function open(req: Request) {
  return new Promise<string | boolean | null>((resolve) => {
    const p = { ...req, resolve };
    if (show) show(p);
    else queue.push(p);
  });
}

export const confirmDialog = (req: Request) => open(req).then((v) => v !== null && v !== false);
export const promptDialog = (req: Request) => open({ ...req, input: req.input ?? { value: '' } }).then((v) => (typeof v === 'string' ? v : null));
export const messageDialog = (message: string, title = 'Please note') => open({ title, message, okLabel: 'OK', cancelLabel: null }).then(() => undefined);

/** Mount once in the admin page. */
export function DialogHost() {
  const [cur, setCur] = useState<Pending | null>(null);
  const [text, setText] = useState('');
  const waiting = useRef<Pending[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const okRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    show = (p) => setCur((c) => (c ? (waiting.current.push(p), c) : p));
    const first = queue.splice(0);
    if (first.length) {
      setCur(first[0]);
      waiting.current.push(...first.slice(1));
    }
    return () => {
      show = null;
    };
  }, []);

  useEffect(() => {
    if (!cur) return;
    setText(cur.input?.value ?? '');
    const t = setTimeout(() => {
      if (cur.input || cur.typeToConfirm) {
        inputRef.current?.focus();
        inputRef.current?.select();
      } else okRef.current?.focus();
    }, 30);
    return () => clearTimeout(t);
  }, [cur]);

  // Esc cancels wherever the focus is (also in the moment before it moves into the dialog);
  // a layout effect, so it listens from the very frame the dialog appears.
  const cancelRef = useRef(() => {});
  useLayoutEffect(() => {
    if (!cur) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      cancelRef.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [cur]);

  if (!cur) return null;
  const blocked = !!cur.typeToConfirm && text.trim().toUpperCase() !== cur.typeToConfirm.toUpperCase();
  const close = (v: string | boolean | null) => {
    cur.resolve(v);
    setCur(waiting.current.shift() ?? null);
  };
  const ok = () => !blocked && close(cur.input ? text : true);
  const cancel = () => close(cur.cancelLabel === null ? true : cur.input ? null : false);
  cancelRef.current = cancel;

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && cancel()}
    >
      <form
        className="dialog card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        onSubmit={(e) => {
          e.preventDefault();
          ok();
        }}
      >
        <h2 id="dialog-title">{cur.title}</h2>
        {cur.message && <p className="dialog-message">{cur.message}</p>}
        {(cur.input || cur.typeToConfirm) && (
          <label className="field">
            {cur.typeToConfirm ? (
              <span>
                Type <b>{cur.typeToConfirm}</b> to confirm
              </span>
            ) : (
              cur.input?.label
            )}
            <input
              ref={inputRef}
              className="input"
              value={text}
              readOnly={cur.input?.readOnly}
              onChange={(e) => setText(e.target.value)}
              aria-label={cur.typeToConfirm ? `Type ${cur.typeToConfirm} to confirm` : cur.input?.label || cur.title}
              autoComplete="off"
            />
          </label>
        )}
        <div className="row dialog-actions">
          {cur.cancelLabel !== null && (
            <button type="button" className="btn" onClick={cancel}>
              {cur.cancelLabel ?? 'Cancel'}
            </button>
          )}
          <button ref={okRef} type="submit" className={`btn ${cur.danger ? 'danger solid' : 'primary'}`} disabled={blocked}>
            {cur.okLabel ?? 'OK'}
          </button>
        </div>
      </form>
    </div>
  );
}
