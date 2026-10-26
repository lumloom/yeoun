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

function notifySync(entityType: 'media' | 'note', entityId: string, action: 'upsert' | 'delete') {
  window.dispatchEvent(new CustomEvent('lumloom:entity-changed', { detail: { entityType, entityId, action } }))
}

async function putEntity<T extends { id: string }>(storeName: 'media' | 'notes', entityType: 'media' | 'note', item: T, notify = true) {
  const result = await tx<IDBValidKey>(storeName, 'readwrite', (s) => s.put(item))
  if (notify) notifySync(entityType, item.id, 'upsert')
  return result
}

async function deleteEntity(storeName: 'media' | 'notes', entityType: 'media' | 'note', id: string, notify = true) {
  const result = await tx<undefined>(storeName, 'readwrite', (s) => s.delete(id))
  if (notify) notifySync(entityType, id, 'delete')
  return result
}

export const db = {
  media: {
    all: () => tx<MediaItem[]>('media', 'readonly', (s) => s.getAll()),
    put: (item: MediaItem, notify = true) => putEntity('media', 'media', item, notify),
    delete: (id: string, notify = true) => deleteEntity('media', 'media', id, notify),
    clear: () => tx<undefined>('media', 'readwrite', (s) => s.clear()),
  },
  notes: {
    all: () => tx<MediaNote[]>('notes', 'readonly', (s) => s.getAll()),
    put: (item: MediaNote, notify = true) => putEntity('notes', 'note', item, notify),
    delete: (id: string, notify = true) => deleteEntity('notes', 'note', id, notify),
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
