// AstroSnap – IndexedDB alapú helyi tárolás a képeknek és beállításoknak

import type { StoredImage } from "@/lib/astro/types";

const DB_NAME = "astrosnap";
const DB_VERSION = 1;
const STORE_IMAGES = "images";
const STORE_PROJECTS = "projects";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB nem érhető el ebben a környezetben"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_IMAGES)) {
        const store = db.createObjectStore(STORE_IMAGES, { keyPath: "id" });
        store.createIndex("type", "type", { unique: false });
        store.createIndex("capturedAt", "capturedAt", { unique: false });
        store.createIndex("target", "target", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        db.createObjectStore(STORE_PROJECTS, { keyPath: "id" });
      }
    };
  });
  return dbPromise;
}

export async function saveImage(image: StoredImage): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_IMAGES, "readwrite");
    const store = tx.objectStore(STORE_IMAGES);
    const req = store.put(image);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getImage(id: string): Promise<StoredImage | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_IMAGES, "readonly");
    const store = tx.objectStore(STORE_IMAGES);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result as StoredImage | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function listImages(
  type?: StoredImage["type"]
): Promise<StoredImage[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_IMAGES, "readonly");
    const store = tx.objectStore(STORE_IMAGES);
    const req = type ? store.index("type").getAll(type) : store.getAll();
    req.onsuccess = () => {
      const items = (req.result as StoredImage[]) ?? [];
      // Rendezés: legfrissebb először
      items.sort((a, b) => b.capturedAt - a.capturedAt);
      resolve(items);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteImage(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_IMAGES, "readwrite");
    const store = tx.objectStore(STORE_IMAGES);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function clearImages(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_IMAGES, "readwrite");
    const store = tx.objectStore(STORE_IMAGES);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// Blob → ObjectURL segéd (component életciklushoz kötött)
export function blobToUrl(blob: Blob): string {
  return URL.createObjectURL(blob);
}

// Készíts egy azonosítót
export function genId(prefix = "img"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}
