import JSZip from 'jszip'
import { db } from './db'
import { MEDIA_LABELS, NOTE_LABELS, type BackupData, type MediaItem, type MediaNote, type StoredAsset } from './types'

const safeName = (value: string) => value.normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1F]/g, '-').replace(/[. ]+$/g, '').trim() || '기록'
const yamlString = (value: string) => JSON.stringify(value)

function uniqueName(base: string, used: Set<string>, extension: string) {
  let name = `${base}.${extension}`
  let index = 2
  while (used.has(name.toLocaleLowerCase())) name = `${base}-${index++}.${extension}`
  used.add(name.toLocaleLowerCase())
  return name
}

export function mediaMarkdown(item: MediaItem, notes: MediaNote[], imagePath?: string) {
  const rows = [
    '---',
    `title: ${yamlString(item.title)}`,
    `type: ${item.type}`,
    item.creator ? `creator: ${yamlString(item.creator)}` : '',
    item.releaseYear ? `year: ${item.releaseYear}` : '',
    item.status ? `status: ${yamlString(item.status)}` : '',
    item.experienceDate ? `experienced: ${item.experienceDate}` : '',
    item.platform ? `platform: ${yamlString(item.platform)}` : '',
    item.season ? `season: ${yamlString(item.season)}` : '',
    item.tags.length ? `tags:\n${item.tags.map((tag) => `  - ${yamlString(tag)}`).join('\n')}` : '',
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
    zip.file(`${base}.md`, mediaMarkdown(item, notes, `assets/${assetName}`))
    if (asset) zip.file(`assets/${assetName}`, asset.blob)
    download(await zip.generateAsync({ type: 'blob' }), `${base}-Yeoun.zip`)
  } else {
    download(new Blob([mediaMarkdown(item, notes, item.cover?.url)], { type: 'text/markdown;charset=utf-8' }), `${base}.md`)
  }
}

export async function exportLibrary(media: MediaItem[], notes: MediaNote[]) {
  const zip = new JSZip()
  const usedByFolder = new Map<string, Set<string>>()
  for (const item of media) {
    const folder = MEDIA_LABELS[item.type]
    const used = usedByFolder.get(folder) ?? new Set<string>()
    usedByFolder.set(folder, used)
    const mdName = uniqueName(safeName(item.title), used, 'md')
    let imagePath = item.cover?.kind === 'url' ? item.cover.url : undefined
    if (item.cover?.kind === 'blob') {
      const asset = await db.assets.get(item.cover.assetId)
      if (asset) {
        const ext = safeName(asset.filename).split('.').pop() || 'jpg'
        const assetName = `${item.id}-${safeName(item.title)}.${ext}`
        zip.file(`assets/${assetName}`, asset.blob)
        imagePath = `../assets/${assetName}`
      }
    }
    zip.file(`${folder}/${mdName}`, mediaMarkdown(item, notes.filter((n) => n.mediaId === item.id), imagePath))
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
