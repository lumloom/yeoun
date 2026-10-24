import type { MediaItem, MediaNote, StoredAsset } from './types'

const DB_NAME = 'yeoun-archive'
const DB_VERSION = 1

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('media')) db.createObjectStore('media', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('notes')) {
        const store = db.createObjectStore('notes', { keyPath: 'id' })
        store.createIndex('mediaId', 'mediaId')
      }
      if (!db.objectStoreNames.contains('assets')) db.createObjectStore('assets', { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function tx<T>(storeName: string, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode)
    const request = action(transaction.objectStore(storeName))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    transaction.oncomplete = () => db.close()
  })
}

export const db = {
  media: {
    all: () => tx<MediaItem[]>('media', 'readonly', (s) => s.getAll()),
    put: (item: MediaItem) => tx<IDBValidKey>('media', 'readwrite', (s) => s.put(item)),
    delete: (id: string) => tx<undefined>('media', 'readwrite', (s) => s.delete(id)),
    clear: () => tx<undefined>('media', 'readwrite', (s) => s.clear()),
  },
  notes: {
    all: () => tx<MediaNote[]>('notes', 'readonly', (s) => s.getAll()),
    put: (item: MediaNote) => tx<IDBValidKey>('notes', 'readwrite', (s) => s.put(item)),
    delete: (id: string) => tx<undefined>('notes', 'readwrite', (s) => s.delete(id)),
    clear: () => tx<undefined>('notes', 'readwrite', (s) => s.clear()),
  },
  assets: {
    all: () => tx<StoredAsset[]>('assets', 'readonly', (s) => s.getAll()),
    get: (id: string) => tx<StoredAsset | undefined>('assets', 'readonly', (s) => s.get(id)),
    put: (item: StoredAsset) => tx<IDBValidKey>('assets', 'readwrite', (s) => s.put(item)),
    delete: (id: string) => tx<undefined>('assets', 'readwrite', (s) => s.delete(id)),
    clear: () => tx<undefined>('assets', 'readwrite', (s) => s.clear()),
  },
}

export async function deleteMediaCascade(item: MediaItem, notes: MediaNote[]) {
  await Promise.all(notes.filter((n) => n.mediaId === item.id).map((n) => db.notes.delete(n.id)))
  if (item.cover?.kind === 'blob') await db.assets.delete(item.cover.assetId)
  await db.media.delete(item.id)
}
