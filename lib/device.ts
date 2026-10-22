'use client';

/**
 * A random id for this phone, used to allow one registration per phone (see app/register/page.tsx).
 *
 * It is kept in three places — localStorage, IndexedDB and a cookie — and copied back to all of
 * them whenever one still has it, so clearing one of them (or the "registered" note) is not enough
 * to register again. The live server only stores a salted hash of it, per room. Nothing here
 * identifies the person or the phone outside this site.
 */
const KEY = 'click2026:device';
const VALID = /^[a-f0-9]{32}$/;
const valid = (v: unknown): v is string => typeof v === 'string' && VALID.test(v);

function fromStorage() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function fromCookie() {
  const m = new RegExp(`(?:^|; )${KEY.replace(':', '%3A')}=([a-f0-9]{32})`).exec(document.cookie);
  return m ? m[1] : null;
}

function idb<T>(run: (store: IDBObjectStore) => IDBRequest<T>, mode: IDBTransactionMode): Promise<T | null> {
  return new Promise((resolve) => {
    try {
      const open = indexedDB.open('click2026', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('kv');
      open.onerror = () => resolve(null);
      open.onsuccess = () => {
        try {
          const db = open.result;
          const req = run(db.transaction('kv', mode).objectStore('kv'));
          req.onsuccess = () => {
            resolve(req.result ?? null);
            db.close();
          };
          req.onerror = () => {
            resolve(null);
            db.close();
          };
        } catch {
          resolve(null);
        }
      };
    } catch {
      resolve(null);
    }
  });
}

function save(id: string) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* private mode */
  }
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${KEY.replace(':', '%3A')}=${id}; Max-Age=34560000; Path=/; SameSite=Lax${secure}`;
  void idb((s) => s.put(id, KEY), 'readwrite');
}

export async function deviceId(): Promise<string> {
  const found = [fromStorage(), fromCookie(), await idb<string>((s) => s.get(KEY) as IDBRequest<string>, 'readonly')].find(valid);
  const id =
    found ??
    Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
  save(id);
  return id;
}
