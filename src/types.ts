export type MediaType = 'book' | 'movie' | 'series' | 'game'
export type NoteType = 'memo' | 'reflection' | 'quote' | 'learning' | 'tip'

export interface MediaItem {
  id: string
  type: MediaType
  title: string
  creator?: string
  releaseYear?: number
  experienceDate?: string
  status?: string
  tags: string[]
  oneLineReview?: string
  platform?: string
  season?: string
  cover?: { kind: 'url'; url: string } | { kind: 'blob'; assetId: string; filename: string; mimeType: string }
  createdAt: string
  updatedAt: string
}

export interface MediaNote {
  id: string
  mediaId: string
  noteType: NoteType
  title?: string
  content: string
  recordedAt: string
  createdAt: string
  updatedAt: string
}

export interface StoredAsset {
  id: string
  blob: Blob
  filename: string
  mimeType: string
}

export interface BackupData {
  version: 1
  app: 'Yeoun'
  exportedAt: string
  media: MediaItem[]
  notes: MediaNote[]
  assets: Array<{ id: string; filename: string; mimeType: string; dataUrl: string }>
}

export const MEDIA_LABELS: Record<MediaType, string> = {
  book: 'Books', movie: 'Movies', series: 'Series', game: 'Games',
}

export const NOTE_LABELS: Record<NoteType, string> = {
  memo: '일반 메모', reflection: '감상', quote: '문장 · 대사', learning: '배운 것', tip: '노하우',
}
