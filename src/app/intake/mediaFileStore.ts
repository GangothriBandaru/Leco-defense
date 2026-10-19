// ── Original media files ─────────────────────────────────────────────────────
// The uploaded files themselves, kept unchanged in the browser's IndexedDB so
// Preview can show them and Download returns the original. IndexedDB is shared
// by every tab of the same origin, so a file a client uploads through a request
// link is available to the attorney's tab. It is this browser's storage only —
// a real deployment needs server-side file storage.

const DB_NAME = "leco-media-files";
const STORE = "files";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Stores the original file under a new key and returns the key. */
export async function putMediaFile(file: Blob): Promise<string> {
  const key = `mf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(file, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Storing the file was aborted"));
  });
  db.close();
  return key;
}

/** The original file, or undefined when it is not stored on this device. */
export async function getMediaFile(key?: string): Promise<Blob | undefined> {
  if (!key) return undefined;
  const db = await openDb();
  const blob = await new Promise<Blob | undefined>((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as Blob | undefined);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return blob;
}

/** Removes a stored file. Throws when the browser refuses. */
export async function deleteMediaFile(key: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Removing the file was aborted"));
  });
  db.close();
}

/** Saves the original file to the user's device under its original name. */
export async function downloadMediaFile(key: string | undefined, name: string): Promise<boolean> {
  const blob = await getMediaFile(key);
  if (!blob) return false;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}
