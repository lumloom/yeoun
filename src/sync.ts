import type { User } from '@supabase/supabase-js'
import { db } from './db'
import { supabase } from './supabase'
import type { MediaItem, MediaNote } from './types'

type EntityType = 'media' | 'note'
type LocalRecord = { entityType: EntityType; entityId: string; payload: MediaItem | MediaNote; clientUpdatedAt: string | null }
type RemoteRecord = {
  entity_type: EntityType
  entity_id: string
  payload: MediaItem | MediaNote
  version: number
  status: 'active' | 'deleted'
  client_updated_at: string | null
}
type TrackedRecord = { remoteVersion: number | null; dirty: boolean; deleted?: boolean }
type SyncMeta = { userId: string | null; records: Record<string, TrackedRecord>; conflicts: Record<string, { remote: RemoteRecord }> }

export type SyncSnapshot = {
  signedIn: boolean
  email: string
  busy: boolean
  localCount: number
  cloudCount: number
  pendingCount: number
  conflicts: Array<{ key: string; label: string }>
  message: string
  error: boolean
}

const APP = 'yeoun'
const BUCKET = 'lumloom-assets'
const META_KEY = 'lumloom-yeoun-sync-v1'
const listeners = new Set<() => void>()
let user: User | null = null
let busy = false
let cloudCount = 0
let message = ''
let isError = false
let started = false
let syncTimer = 0
let refreshLocal: (() => void | Promise<void>) | null = null

function loadMeta(): SyncMeta {
  try {
    const parsed = JSON.parse(localStorage.getItem(META_KEY) || '') as SyncMeta
    if (parsed?.records && parsed?.conflicts) return parsed
  } catch { /* use a fresh sync index */ }
  return { userId: null, records: {}, conflicts: {} }
}

let meta = loadMeta()
const keyOf = (entityType: EntityType, entityId: string) => `${entityType}:${entityId}`
const saveMeta = () => localStorage.setItem(META_KEY, JSON.stringify(meta))
const samePayload = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

async function listLocalRecords(): Promise<LocalRecord[]> {
  const [media, notes] = await Promise.all([db.media.all(), db.notes.all()])
  return [
    ...media.map((payload) => ({ entityType: 'media' as const, entityId: payload.id, payload, clientUpdatedAt: payload.updatedAt || payload.createdAt || null })),
    ...notes.map((payload) => ({ entityType: 'note' as const, entityId: payload.id, payload, clientUpdatedAt: payload.updatedAt || payload.createdAt || null })),
  ]
}

async function localRecord(entityType: EntityType, entityId: string) {
  return (await listLocalRecords()).find((record) => record.entityType === entityType && record.entityId === entityId) || null
}

async function emit() {
  const localRecords = await listLocalRecords()
  const localCount = localRecords.length
  const pendingCount = localRecords.filter((record) => {
    const tracked = meta.records[keyOf(record.entityType, record.entityId)]
    return !tracked?.remoteVersion || tracked.dirty
  }).length
  snapshot = {
    signedIn: Boolean(user), email: user?.email || '', busy, localCount, cloudCount,
    pendingCount,
    conflicts: Object.entries(meta.conflicts).map(([key, value]) => ({ key, label: `${value.remote.entity_type === 'media' ? '작품' : '기록'} · ${value.remote.entity_id}` })),
    message, error: isError,
  }
  listeners.forEach((listener) => listener())
}

let snapshot: SyncSnapshot = { signedIn: false, email: '', busy: false, localCount: 0, cloudCount: 0, pendingCount: 0, conflicts: [], message: '', error: false }
export const subscribeSync = (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener) }
export const getSyncSnapshot = () => snapshot

function setMessage(next: string, error = false) {
  message = next
  isError = error
  void emit()
}

function assetPath(assetId: string) { return `${user!.id}/${APP}/${assetId}` }

async function uploadAssets(record: LocalRecord) {
  if (record.entityType !== 'media') return
  const item = record.payload as MediaItem
  if (item.cover?.kind !== 'blob') return
  const asset = await db.assets.get(item.cover.assetId)
  if (!asset) return
  const { error } = await supabase.storage.from(BUCKET).upload(assetPath(asset.id), asset.blob, { upsert: true, contentType: asset.mimeType })
  if (error) throw error
}

async function hydrateAssets(record: RemoteRecord) {
  if (record.entity_type !== 'media') return
  const item = record.payload as MediaItem
  if (item.cover?.kind !== 'blob' || await db.assets.get(item.cover.assetId)) return
  const { data, error } = await supabase.storage.from(BUCKET).download(assetPath(item.cover.assetId))
  if (error) throw error
  await db.assets.put({ id: item.cover.assetId, blob: data, filename: item.cover.filename, mimeType: item.cover.mimeType || data.type })
}

async function applyRemote(record: RemoteRecord) {
  if (record.status === 'deleted') {
    if (record.entity_type === 'media') await db.media.delete(record.entity_id, false)
    else await db.notes.delete(record.entity_id, false)
  } else {
    await hydrateAssets(record)
    if (record.entity_type === 'media') await db.media.put(record.payload as MediaItem, false)
    else await db.notes.put(record.payload as MediaNote, false)
  }
  await refreshLocal?.()
}

function trackRemote(record: RemoteRecord) {
  meta.records[keyOf(record.entity_type, record.entity_id)] = { remoteVersion: record.version, dirty: false, deleted: record.status === 'deleted' }
  delete meta.conflicts[keyOf(record.entity_type, record.entity_id)]
}

async function fetchRemote() {
  const { data, error } = await supabase.from('lumloom_records').select('*').eq('app', APP)
  if (error) throw error
  cloudCount = data.filter((record) => record.status !== 'deleted').length
  return data as RemoteRecord[]
}

async function pushRecord(local: LocalRecord | null, entityType: EntityType, entityId: string, tracked: TrackedRecord) {
  if (local) await uploadAssets(local)
  const values = {
    user_id: user!.id, app: APP, entity_type: entityType, entity_id: entityId,
    payload: local?.payload || {}, status: local ? 'active' : 'deleted',
    client_updated_at: local?.clientUpdatedAt, version: (tracked.remoteVersion || 0) + 1,
  }
  if (tracked.remoteVersion === null) {
    const { data, error } = await supabase.from('lumloom_records').insert(values).select().single()
    if (error) {
      if (error.code === '23505') return false
      throw error
    }
    trackRemote(data as RemoteRecord)
    return true
  }
  const { data, error } = await supabase.from('lumloom_records').update(values)
    .eq('app', APP).eq('entity_type', entityType).eq('entity_id', entityId).eq('version', tracked.remoteVersion).select()
  if (error) throw error
  if (!data.length) return false
  trackRemote(data[0] as RemoteRecord)
  return true
}

export async function runSync(includeUntracked = false) {
  if (!user || busy) return
  if (!navigator.onLine) { setMessage('오프라인입니다. 연결되면 다시 동기화합니다.'); return }
  busy = true
  setMessage('기록을 확인하고 있습니다…')
  try {
    const remoteRecords = await fetchRemote()
    const localRecords = await listLocalRecords()
    const localByKey = Object.fromEntries(localRecords.map((record) => [keyOf(record.entityType, record.entityId), record]))
    const remoteByKey = Object.fromEntries(remoteRecords.map((record) => [keyOf(record.entity_type, record.entity_id), record]))

    for (const remote of remoteRecords) {
      const key = keyOf(remote.entity_type, remote.entity_id)
      const local = localByKey[key]
      const tracked = meta.records[key]
      if (!local && remote.status === 'active') { await applyRemote(remote); trackRemote(remote) }
      else if (!local && remote.status === 'deleted') trackRemote(remote)
      else if (!tracked) {
        if (remote.status === 'active' && samePayload(local.payload, remote.payload)) trackRemote(remote)
        else if (includeUntracked) meta.conflicts[key] = { remote }
      } else if (tracked.dirty) {
        if (tracked.remoteVersion !== remote.version && !(remote.status === 'active' && samePayload(local?.payload, remote.payload))) meta.conflicts[key] = { remote }
      } else if (tracked.remoteVersion !== remote.version) { await applyRemote(remote); trackRemote(remote) }
    }

    if (includeUntracked) {
      for (const local of localRecords) {
        const key = keyOf(local.entityType, local.entityId)
        if (meta.records[key] || meta.conflicts[key]) continue
        const remote = remoteByKey[key]
        if (remote) meta.conflicts[key] = { remote }
        else meta.records[key] = { remoteVersion: null, dirty: true }
      }
    }

    for (const [key, tracked] of Object.entries(meta.records)) {
      if (!tracked.dirty || meta.conflicts[key]) continue
      const [entityType, entityId] = key.split(':') as [EntityType, string]
      const local = localByKey[key] || await localRecord(entityType, entityId)
      const pushed = await pushRecord(local, entityType, entityId, tracked)
      if (!pushed) {
        const latest = (await fetchRemote()).find((record) => keyOf(record.entity_type, record.entity_id) === key)
        if (latest) meta.conflicts[key] = { remote: latest }
      }
    }
    saveMeta()
    const count = Object.keys(meta.conflicts).length
    setMessage(count ? `${count}개의 기록은 사용할 내용을 확인해야 합니다.` : `동기화 완료 · ${new Intl.DateTimeFormat('ko-KR', { hour: 'numeric', minute: '2-digit' }).format(new Date())}`)
  } catch (error) {
    console.error('Yeoun sync failed', error)
    setMessage(`동기화하지 못했습니다. ${error instanceof Error ? error.message : '잠시 후 다시 시도해주세요.'}`, true)
  } finally {
    busy = false
    await emit()
  }
}

export async function requestLogin(email: string) {
  busy = true; await emit()
  const redirectTo = `${location.origin}${location.pathname}`
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } })
  busy = false
  if (error) {
    const rateLimited = error.message.toLowerCase().includes('rate limit')
    setMessage(rateLimited ? '로그인 메일 발송 한도를 초과했습니다. 잠시 후 다시 시도해주세요.' : `로그인 링크를 보내지 못했습니다. ${error.message}`, true)
    return false
  }
  setMessage('메일함에서 가장 최근 Lumloom 로그인 링크를 눌러주세요.')
  return true
}

export async function signOut() { await supabase.auth.signOut({ scope: 'local' }) }

export async function resolveConflict(key: string, resolution: 'local' | 'remote') {
  const conflict = meta.conflicts[key]
  if (!conflict) return
  if (resolution === 'remote') { await applyRemote(conflict.remote); trackRemote(conflict.remote); saveMeta(); setMessage('클라우드 기록을 이 기기에 적용했습니다.'); return }
  const [entityType, entityId] = key.split(':') as [EntityType, string]
  meta.records[key] = { remoteVersion: conflict.remote.version, dirty: true }
  delete meta.conflicts[key]
  saveMeta()
  await runSync(false)
}

async function setUser(next: User | null) {
  user = next
  if (user && meta.userId !== user.id) { meta = { userId: user.id, records: {}, conflicts: {} }; saveMeta() }
  await emit()
  if (user) await runSync(false)
}

export function startSync(onLocalChanged: () => void | Promise<void>) {
  refreshLocal = onLocalChanged
  if (started) { void emit(); return }
  started = true
  window.addEventListener('lumloom:entity-changed', ((event: CustomEvent<{ entityType: EntityType; entityId: string; action: 'upsert' | 'delete' }>) => {
    const { entityType, entityId, action } = event.detail
    if (!user && !meta.userId) return
    const key = keyOf(entityType, entityId)
    meta.records[key] = { ...(meta.records[key] || { remoteVersion: null }), dirty: true, deleted: action === 'delete' }
    saveMeta(); void emit()
    window.clearTimeout(syncTimer)
    syncTimer = window.setTimeout(() => { void runSync(false) }, 900)
  }) as EventListener)
  window.addEventListener('online', () => { void runSync(false) })
  supabase.auth.onAuthStateChange((_event, session) => { window.setTimeout(() => { void setUser(session?.user || null) }, 0) })
  void supabase.auth.getSession().then(({ data }) => setUser(data.session?.user || null))
}
