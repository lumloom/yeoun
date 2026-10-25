import { describe, expect, it } from 'vitest'
import { mediaMarkdown, obsidianUriForMedia } from './exporters'
import type { MediaItem, MediaNote } from './types'

const media: MediaItem = {
  id: 'm1', type: 'book', title: '데미안: 새로운 시작', creator: '헤르만 "헤세"', releaseYear: 1919,
  tags: ['독서', '성장:문학'], oneLineReview: '나 자신을 이해하는 과정.', createdAt: '2026-10-20T00:00:00Z', updatedAt: '2026-10-24T00:00:00Z',
}

const notes: MediaNote[] = [
  { id: 'n2', mediaId: 'm1', noteType: 'reflection', content: '두 번째 기록', recordedAt: '2026-10-24', createdAt: '2026-10-24T00:00:00Z', updatedAt: '2026-10-24T00:00:00Z' },
  { id: 'n1', mediaId: 'm1', noteType: 'quote', content: '첫 번째 기록', recordedAt: '2026-10-20', createdAt: '2026-10-20T00:00:00Z', updatedAt: '2026-10-20T00:00:00Z' },
]

describe('mediaMarkdown', () => {
  it('creates YAML-safe frontmatter and date-ordered notes', () => {
    const output = mediaMarkdown(media, notes, '../assets/cover image.jpg')
    expect(output).toContain('lumloom_id: yeoun-m1')
    expect(output).toContain('schema: lumloom-record/v1')
    expect(output).toContain('source: yeoun')
    expect(output).toContain('record_type: book')
    expect(output).toContain('title: "데미안: 새로운 시작"')
    expect(output).toContain('creator: "헤르만 \\"헤세\\""')
    expect(output).toContain('![데미안: 새로운 시작](../assets/cover%20image.jpg)')
    expect(output.indexOf('2026-10-20')).toBeLessThan(output.indexOf('2026-10-24'))
  })

  it('builds a Lumloom inbox Obsidian URI from the same Markdown', () => {
    const uri = obsidianUriForMedia(media, notes)
    expect(uri).toContain('obsidian://new?')
    expect(uri).toContain('vault=Lumloom')
    expect(decodeURIComponent(uri)).toContain('01. 수집함/Yeoun/')
    expect(decodeURIComponent(uri)).toContain('schema: lumloom-record/v1')
  })
})
