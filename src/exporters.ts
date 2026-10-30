import JSZip from 'jszip'
import { db } from './db'
import { NOTE_LABELS, type BackupData, type MediaItem, type MediaNote, type StoredAsset } from './types'

const safeName = (value: string) => value.normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1F]/g, '-').replace(/[. ]+$/g, '').trim() || '기록'
const yamlString = (value: string) => JSON.stringify(value)
const yamlList = (values: string[]) => JSON.stringify([...new Set(values)])
const vaultFolder = (type: MediaItem['type']) => ({ book: '책', movie: '영화와 드라마', series: '영화와 드라마', game: '게임' })[type]
const recordDate = (item: MediaItem) => item.experienceDate || item.createdAt.slice(0, 10)
const obsidianTimestamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')

function uniqueName(base: string, used: Set<string>, extension: string) {
  let name = `${base}.${extension}`
  let index = 2
  while (used.has(name.toLocaleLowerCase())) name = `${base}-${index++}.${extension}`
  used.add(name.toLocaleLowerCase())
  return name
}

export function mediaMarkdown(item: MediaItem, notes: MediaNote[], imagePath?: string) {
  const date = recordDate(item)
  const rows = [
    '---',
    `lumloom_id: yeoun-${item.id}`,
    'schema: lumloom-record/v1',
    'source: yeoun',
    `record_type: ${item.type}`,
    `title: ${yamlString(item.title)}`,
    `date: ${date}`,
    `created_at: ${yamlString(item.createdAt)}`,
    `updated_at: ${yamlString(item.updatedAt)}`,
    'status: active',
    `tags: ${yamlList(['lumloom', 'yeoun', ...item.tags])}`,
    'people: []',
    `projects: ${yamlList(['[[Lumloom]]'])}`,
    `related: ${yamlList([`[[${date}]]`])}`,
    'published: false',
    item.creator ? `creator: ${yamlString(item.creator)}` : '',
    item.releaseYear ? `year: ${item.releaseYear}` : '',
    item.status ? `media_status: ${yamlString(item.status)}` : '',
    item.experienceDate ? `experienced: ${item.experienceDate}` : '',
    item.platform ? `platform: ${yamlString(item.platform)}` : '',
    item.season ? `season: ${yamlString(item.season)}` : '',
    '---', '', `# ${item.title}`, '',
  ].filter((line) => line !== '')

  if (imagePath) rows.push('', `![${item.title}](${encodeURI(imagePath)})`)
  if (item.oneLineReview) rows.push('', '## 나의 한 줄', '', item.oneLineReview)
  const sorted = [...notes].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
  sorted.forEach((note) => {
    rows.push('', `## ${note.recordedAt} | ${note.title?.trim() || NOTE_LABELS[note.noteType]}`, '', note.content)
  })
  return `${rows.join('\n')}\n`
}

export function obsidianUriForMedia(item: MediaItem, notes: MediaNote[], successUrl?: string) {
  const file = `01. 수집함/Yeoun/${safeName(item.title)}-${obsidianTimestamp()}.md`
  const content = mediaMarkdown(item, notes, item.cover?.kind === 'url' ? item.cover.url : undefined)
  const success = successUrl ? `&x-success=${encodeURIComponent(successUrl)}` : ''
  return `obsidian://new?vault=${encodeURIComponent('Lumloom')}&file=${encodeURIComponent(file)}&content=${encodeURIComponent(content)}${success}`
}

export function saveMediaToObsidian(item: MediaItem, notes: MediaNote[], successUrl?: string) {
  const uri = obsidianUriForMedia(item, notes, successUrl)
  if (uri.length > 12000) throw new Error('기록이 길어 Markdown 저장을 이용해 주세요.')
  window.location.href = uri
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function exportOne(item: MediaItem, notes: MediaNote[]) {
  const base = safeName(item.title)
  if (item.cover?.kind === 'blob') {
    const asset = await db.assets.get(item.cover.assetId)
    const zip = new JSZip()
    const ext = safeName(item.cover.filename).split('.').pop() || 'jpg'
    const assetName = `${base}-cover.${ext}`
    zip.file(`30. Yeoun/${vaultFolder(item.type)}/${base}.md`, mediaMarkdown(item, notes, `../../91. Attachments/Yeoun/${assetName}`))
    if (asset) zip.file(`91. Attachments/Yeoun/${assetName}`, asset.blob)
    download(await zip.generateAsync({ type: 'blob' }), `${base}-Yeoun.zip`)
  } else {
    download(new Blob([mediaMarkdown(item, notes, item.cover?.url)], { type: 'text/markdown;charset=utf-8' }), `${base}.md`)
  }
}

export async function exportLibrary(media: MediaItem[], notes: MediaNote[]) {
  const zip = new JSZip()
  const usedByFolder = new Map<string, Set<string>>()
  for (const item of media) {
    const folder = vaultFolder(item.type)
    const used = usedByFolder.get(folder) ?? new Set<string>()
    usedByFolder.set(folder, used)
    const mdName = uniqueName(safeName(item.title), used, 'md')
    let imagePath = item.cover?.kind === 'url' ? item.cover.url : undefined
    if (item.cover?.kind === 'blob') {
      const asset = await db.assets.get(item.cover.assetId)
      if (asset) {
        const ext = safeName(asset.filename).split('.').pop() || 'jpg'
        const assetName = `${item.id}-${safeName(item.title)}.${ext}`
        zip.file(`91. Attachments/Yeoun/${assetName}`, asset.blob)
        imagePath = `../../91. Attachments/Yeoun/${assetName}`
      }
    }
    zip.file(`30. Yeoun/${folder}/${mdName}`, mediaMarkdown(item, notes.filter((n) => n.mediaId === item.id), imagePath))
  }
  download(await zip.generateAsync({ type: 'blob' }), `Yeoun-${new Date().toISOString().slice(0, 10)}.zip`)
}

const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result))
  reader.onerror = () => reject(reader.error)
  reader.readAsDataURL(blob)
})

const dataUrlToBlob = (dataUrl: string) => {
  const [meta, encoded] = dataUrl.split(',')
  const mime = meta.match(/data:(.*?);base64/)?.[1] || 'application/octet-stream'
  const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))
  return new Blob([bytes], { type: mime })
}

export async function exportBackup(media: MediaItem[], notes: MediaNote[]) {
  const stored = await db.assets.all()
  const assets = await Promise.all(stored.map(async (asset) => ({ ...asset, blob: undefined, dataUrl: await blobToDataUrl(asset.blob) })))
  const backup: BackupData = { version: 1, app: 'Yeoun', exportedAt: new Date().toISOString(), media, notes, assets }
  download(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }), `Yeoun-backup-${new Date().toISOString().slice(0, 10)}.json`)
}

export async function restoreBackup(file: File) {
  const parsed = JSON.parse(await file.text()) as BackupData
  if (parsed.app !== 'Yeoun' || parsed.version !== 1 || !Array.isArray(parsed.media) || !Array.isArray(parsed.notes)) throw new Error('지원하지 않는 백업 파일입니다.')
  await Promise.all([db.media.clear(), db.notes.clear(), db.assets.clear()])
  for (const item of parsed.media) await db.media.put(item)
  for (const note of parsed.notes) await db.notes.put(note)
  for (const asset of parsed.assets ?? []) {
    const stored: StoredAsset = { id: asset.id, filename: asset.filename, mimeType: asset.mimeType, blob: dataUrlToBlob(asset.dataUrl) }
    await db.assets.put(stored)
  }
}
