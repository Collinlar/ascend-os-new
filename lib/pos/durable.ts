// Where a till's irreplaceable records actually live.
//
// IndexedDB is the right home for the catalogue, which is disposable and
// can always be pulled again. It is the wrong home for the device token
// and for queued sales, because Android WebView can evict it under storage
// pressure and "Clear data" wipes it outright. A merchant who sells all
// Saturday offline and loses the queue has lost real money with no server
// copy to recover from.
//
// So those two records route through here instead. Today every path lands
// on IndexedDB and behaves exactly as before; inside a native shell the
// bridge takes over and the same calls reach Android Keystore and SQLite.
// Nothing in the till has to know which it got.

import { getMeta, setMeta } from "./db";

export interface NativeStorageBridge {
  /** Keystore-backed. Used for the device token and nothing else. */
  getSecure(key: string): Promise<string | null> | string | null;
  setSecure(key: string, value: string): Promise<void> | void;
  removeSecure(key: string): Promise<void> | void;
  /** True when this store survives a WebView data clear. */
  isDurable?(): Promise<boolean> | boolean;
}

declare global {
  interface Window {
    AscendStorage?: NativeStorageBridge;
  }
}

function bridge(): NativeStorageBridge | undefined {
  return typeof window === "undefined" ? undefined : window.AscendStorage;
}

/** True when queued sales would survive the user clearing app data. */
export async function storageIsDurable(): Promise<boolean> {
  const native = bridge();
  if (!native) return false;
  try {
    return native.isDurable ? await native.isDurable() : true;
  } catch {
    return false;
  }
}

// Values are stored as strings so the native side never has to agree with
// us about JSON shapes.
export async function secureGet<T>(key: string): Promise<T | undefined> {
  const native = bridge();
  if (native) {
    try {
      const raw = await native.getSecure(key);
      if (raw !== null && raw !== undefined) return JSON.parse(raw) as T;
      return undefined;
    } catch {
      // Fall through: a broken bridge must not lock a till out of its own
      // credentials when IndexedDB still holds them.
    }
  }
  return getMeta<T>(key);
}

export async function secureSet<T>(key: string, value: T): Promise<void> {
  const native = bridge();
  if (native) {
    try {
      await native.setSecure(key, JSON.stringify(value));
      // Mirrored, so a shell that is later removed or downgraded does not
      // strand the till.
      await setMeta(key, value);
      return;
    } catch {
      // Fall through to the web store.
    }
  }
  await setMeta(key, value);
}

export async function secureRemove(key: string): Promise<void> {
  const native = bridge();
  if (native) {
    try {
      await native.removeSecure(key);
    } catch {
      // Ignore: the web store is cleared below either way.
    }
  }
  await setMeta(key, undefined);
}
