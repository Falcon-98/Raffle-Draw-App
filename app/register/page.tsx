'use client';

/**
 * Registration form people open by scanning the QR code on the big screen (or a printed one).
 * Only first name, last name and organization are asked; the live server gives back a Code and
 * the event laptop adds the person to the draw within a few seconds. With "one registration per
 * phone" on (the default), a phone that registered once only ever gets its own registration back.
 *   /register/?r=ROOMCODE[&s=https://live-server-address]
 */
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Background, EventTitle } from '@/components/Brand';
import { normalizeServer, regInfo, regSubmit } from '@/lib/live';
import { deviceId } from '@/lib/device';
import { BRAND, DEFAULT_LIVE_SERVER } from '@/lib/config';

type Done = { name: string; code: string };
type Status = 'loading' | 'open' | 'closed' | 'notfound' | 'nolink' | 'offline';

const MAX = 60;
const saved = (room: string) => `click2026:registered:${room}`;

export default function RegisterPage() {
  const [link, setLink] = useState<{ server: string; code: string } | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [title, setTitle] = useState(BRAND.event);
  const [form, setForm] = useState({ first: '', last: '', org: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<Done | null>(null);
  const [device, setDevice] = useState('');
  const [onePerDevice, setOnePerDevice] = useState(true);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const code = (q.get('r') || '').trim().toUpperCase();
    if (!code) return setStatus('nolink');
    const server = normalizeServer(q.get('s') || DEFAULT_LIVE_SERVER);
    setLink({ server, code });
    try {
      const d = JSON.parse(localStorage.getItem(saved(code)) || 'null') as Done | null;
      if (d?.code) setDone(d);
    } catch {
      /* private mode */
    }
    deviceId()
      .then((dev) => {
        setDevice(dev);
        return regInfo(server, code, dev);
      })
      .then((r) => {
        if (r.eventTitle) setTitle(r.eventTitle);
        setOnePerDevice(r.onePerDevice !== false);
        // This phone registered already (the server remembers it, even if the page's note was cleared).
        if (r.mine) {
          setDone(r.mine);
          try {
            localStorage.setItem(saved(code), JSON.stringify(r.mine));
          } catch {
            /* private mode */
          }
        }
        setStatus(r.open ? 'open' : 'closed');
      })
      .catch((e: Error) => setStatus(/no live draw/i.test(e.message) ? 'notfound' : 'offline'));
  }, []);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!link || busy || !device) return;
    const data = { first: form.first.trim(), last: form.last.trim(), org: form.org.trim() };
    if (!data.first || !data.last || !data.org) return setError('Please fill in all three fields.');
    setBusy(true);
    setError('');
    try {
      const r = await regSubmit(link.server, link.code, { ...data, device });
      const d = { name: r.name, code: r.code };
      setDone(d);
      try {
        localStorage.setItem(saved(link.code), JSON.stringify(d));
      } catch {
        /* private mode */
      }
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      if (/closed/i.test(m)) setStatus('closed');
      setError(m);
    } finally {
      setBusy(false);
    }
  };

  const again = () => {
    setDone(null);
    setForm({ first: '', last: '', org: '' });
    if (link)
      try {
        localStorage.removeItem(saved(link.code));
      } catch {
        /* private mode */
      }
  };

  return (
    <main className="register-page">
      <Background />
      <div className="register-wrap">
        <EventTitle title={title} />
        <motion.div className="card register-card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          {done ? (
            <div className="register-done" role="status">
              <div className="register-tick" aria-hidden>
                ✓
              </div>
              <h1>You’re in the draw!</h1>
              <p className="register-name">{done.name}</p>
              <p className="note">Your code</p>
              <p className="register-code">{done.code}</p>
              <p className="note">Keep this page or take a screenshot — good luck!</p>
              {onePerDevice ? (
                <p className="note register-once">One registration per phone — this phone is already registered.</p>
              ) : (
                <button className="btn sm" onClick={again}>
                  Register someone else
                </button>
              )}
            </div>
          ) : status === 'open' ? (
            <form className="col" style={{ gap: 14 }} onSubmit={(e) => void submit(e)} noValidate>
              <h1>Register for the lucky draw</h1>
              <label className="field">
                First name
                <input className="input" name="first" autoComplete="given-name" maxLength={MAX} required value={form.first} onChange={set('first')} />
              </label>
              <label className="field">
                Last name
                <input className="input" name="last" autoComplete="family-name" maxLength={MAX} required value={form.last} onChange={set('last')} />
              </label>
              <label className="field">
                Organization
                <input className="input" name="org" autoComplete="organization" maxLength={MAX} required value={form.org} onChange={set('org')} />
              </label>
              {error && (
                <p className="register-error" role="alert">
                  {error}
                </p>
              )}
              <button className="btn primary big" type="submit" disabled={busy || !device}>
                {busy ? 'Registering…' : 'Register'}
              </button>
              <p className="note" style={{ margin: 0 }}>
                Only your name and organization are used, to show you on the screen if you win.
              </p>
            </form>
          ) : (
            <div className="register-done" role="status">
              <h1>
                {status === 'loading'
                  ? 'Loading…'
                  : status === 'closed'
                    ? 'Registration is closed'
                    : status === 'offline'
                      ? 'Can’t reach the registration server'
                      : 'This registration link is not valid'}
              </h1>
              <p className="note">
                {status === 'closed'
                  ? 'Registration for this draw is not open right now. Please ask the organisers.'
                  : status === 'offline'
                    ? 'Check your internet connection and try again.'
                    : status === 'loading'
                      ? ''
                      : 'Scan the QR code shown at the event again.'}
              </p>
              {(status === 'offline' || status === 'closed') && (
                <button className="btn sm" onClick={() => window.location.reload()}>
                  Try again
                </button>
              )}
            </div>
          )}
        </motion.div>
      </div>
    </main>
  );
}
