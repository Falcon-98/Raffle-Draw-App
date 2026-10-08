'use client';

import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { Background, ClickMark } from '@/components/Brand';
import { ADMIN_PIN, BRAND } from '@/lib/config';

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <span className="switch">
      <input type="checkbox" role="switch" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="track" />
    </span>
  );
}

export function Setting({ title, desc, checked, onChange }: { title: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="setting">
      <div>
        <b>{title}</b>
        <span>{desc}</span>
      </div>
      <Switch label={title} checked={checked} onChange={onChange} />
    </div>
  );
}

const SESSION_KEY = 'click2026:admin-ok';

/** Simple PIN screen that keeps the audience out of the admin console. */
export function AdminGate({ children }: { children: ReactNode }) {
  const [ok, setOk] = useState<boolean | null>(null);
  const [pin, setPin] = useState('');
  const [bad, setBad] = useState(false);

  useEffect(() => {
    try {
      setOk(sessionStorage.getItem(SESSION_KEY) === '1');
    } catch {
      setOk(false);
    }
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (pin.trim() === ADMIN_PIN) {
      try {
        sessionStorage.setItem(SESSION_KEY, '1');
      } catch {}
      setOk(true);
    } else {
      setBad(true);
      setTimeout(() => setBad(false), 450);
    }
  };

  if (ok === null) return <div className="gate"><Background /></div>;
  if (ok) return <>{children}</>;

  return (
    <div className="gate">
      <Background />
      <form className={`card ${bad ? 'shake' : ''}`} onSubmit={submit}>
        <ClickMark />
        <div>
          <h1>Admin console</h1>
          <p className="note" style={{ margin: '6px 0 0' }}>
            {BRAND.company} · {BRAND.event} lucky draw
          </p>
        </div>
        <input
          className="input"
          type="password"
          inputMode="text"
          autoFocus
          placeholder="Enter PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          aria-label="Admin PIN"
        />
        <button className="btn primary" type="submit">
          Unlock
        </button>
        {bad && <span className="note" style={{ color: 'var(--red)' }}>That PIN isn&apos;t right.</span>}
      </form>
    </div>
  );
}

export function lockAdmin() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {}
  location.reload();
}
