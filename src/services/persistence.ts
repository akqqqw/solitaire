import {
  isProfileLike,
  profileUpdatedAt,
  sanitizeProfile,
  type ProfileData,
} from '../store/profile';

const DB_NAME = 'solitaire-club';
const STORE_NAME = 'profile';
const KEY = 'profile';
const LS_KEY = 'solitaire-club:profile';
const LS_BACKUP = 'solitaire-club:profile-backup';

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

async function readIdb(): Promise<unknown> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(KEY);
      request.onsuccess = () => {
        const value = request.result;
        if (typeof value === 'string') {
          try {
            resolve(JSON.parse(value));
          } catch {
            resolve(null);
          }
        } else {
          resolve(value ?? null);
        }
      };
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function readLocal(key = LS_KEY): unknown {
  try {
    const value = localStorage.getItem(key);
    if (!value) return null;
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function writeIdb(serialized: string): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(serialized, KEY);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

function writeLocal(serialized: string): void {
  try {
    const previous = localStorage.getItem(LS_KEY);
    if (previous) localStorage.setItem(LS_BACKUP, previous);
    localStorage.setItem(LS_KEY, serialized);
  } catch {
    // Переполнение localStorage не должно ломать игру: IndexedDB остаётся основным.
  }
}

export async function loadProfile(): Promise<ProfileData> {
  const [idbRaw, lsRaw, backupRaw] = await Promise.all([
    readIdb(),
    Promise.resolve(readLocal(LS_KEY)),
    Promise.resolve(readLocal(LS_BACKUP)),
  ]);
  const candidates = [idbRaw, lsRaw, backupRaw]
    .filter((raw) => isProfileLike(raw))
    .sort((a, b) => profileUpdatedAt(b) - profileUpdatedAt(a));
  if (!candidates.length) return sanitizeProfile(null);
  return sanitizeProfile(candidates[0]);
}

export async function saveProfile(profile: ProfileData): Promise<boolean> {
  const serialized = JSON.stringify({ ...profile, updatedAt: Date.now() });
  writeLocal(serialized);
  try {
    return await writeIdb(serialized);
  } catch {
    return false;
  }
}

export function saveProfileLocal(profile: ProfileData): void {
  writeLocal(JSON.stringify({ ...profile, updatedAt: Date.now() }));
}

export async function clearProfileStorage(): Promise<void> {
  try {
    localStorage.removeItem(LS_KEY);
    localStorage.removeItem(LS_BACKUP);
  } catch {
    // ignore
  }
  try {
    const db = await openDb();
    if (db) {
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    }
  } catch {
    // ignore
  }
}

/** Сравнение облачного и локального профиля: побеждает более свежая версия. */
export function resolveProfileConflict(local: ProfileData, cloud: unknown): ProfileData {
  if (!isProfileLike(cloud)) return local;
  return profileUpdatedAt(cloud) > local.updatedAt ? sanitizeProfile(cloud) : local;
}
