import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowLeft, BookOpen, Camera, Check, ChevronDown, Download, Film, Gamepad2, ImagePlus, Library, Pencil, Plus, Search, Settings2, Sparkles, SunMedium, Trash2, Tv, Upload, X } from 'lucide-react'
import { db, deleteMediaCascade } from './db'
import { exportBackup, exportLibrary, exportOne, restoreBackup } from './exporters'
import { MEDIA_LABELS, NOTE_LABELS, type MediaItem, type MediaNote, type MediaType, type NoteType } from './types'

const now = () => new Date().toISOString()
const today = () => new Date().toISOString().slice(0, 10)
const uid = () => crypto.randomUUID()

const mediaIcons: Record<MediaType, ReactNode> = {
  book: <BookOpen />, movie: <Film />, series: <Tv />, game: <Gamepad2 />,
}

function Modal({ children, onClose, wide = false }: { children: ReactNode; onClose: () => void; wide?: boolean }) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])
  return <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true">{children}</div>
  </div>
}

function Cover({ item, className = '' }: { item: MediaItem; className?: string }) {
  const [blobUrl, setBlobUrl] = useState<string>()
  useEffect(() => {
    let active = true
    let url: string | undefined
    if (item.cover?.kind === 'blob') db.assets.get(item.cover.assetId).then((asset) => {
      if (active && asset) { url = URL.createObjectURL(asset.blob); setBlobUrl(url) }
    })
    return () => { active = false; if (url) URL.revokeObjectURL(url) }
  }, [item.cover])
  const src = item.cover?.kind === 'url' ? item.cover.url : blobUrl
  if (src) return <img className={`cover ${className}`} src={src} alt={`${item.title} 표지`} />
  return <div className={`cover cover-placeholder cover-${item.type} ${className}`} aria-label="기본 표지">
    <span className="placeholder-mark">{mediaIcons[item.type]}</span><span>{item.title}</span>
  </div>
}

type MediaDraft = Partial<MediaItem> & { title: string; type: MediaType; tagsText: string; coverUrl: string }

function MediaEditor({ initial, onSave, onClose }: { initial?: MediaItem; onSave: (item: MediaItem, file?: File) => Promise<void>; onClose: () => void }) {
  const [draft, setDraft] = useState<MediaDraft>({
    ...initial, title: initial?.title ?? '', type: initial?.type ?? 'book', tagsText: initial?.tags.join(', ') ?? '',
    coverUrl: initial?.cover?.kind === 'url' ? initial.cover.url : '',
  })
  const [file, setFile] = useState<File>()
  const [previewUrl, setPreviewUrl] = useState<string>()
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (!file) { setPreviewUrl(undefined); return }
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])
  const creatorLabel = draft.type === 'book' ? '저자' : draft.type === 'movie' ? '감독' : draft.type === 'game' ? '개발사' : '제작자'
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!draft.title.trim()) return
    setSaving(true)
    const timestamp = now()
    const item: MediaItem = {
      id: initial?.id ?? uid(), type: draft.type, title: draft.title.trim(), creator: draft.creator?.trim() || undefined,
      releaseYear: draft.releaseYear ? Number(draft.releaseYear) : undefined, experienceDate: draft.experienceDate || undefined,
      status: draft.status?.trim() || undefined, tags: draft.tagsText.split(',').map((x) => x.trim()).filter(Boolean),
      oneLineReview: draft.oneLineReview?.trim() || undefined, platform: draft.platform?.trim() || undefined,
      season: draft.season?.trim() || undefined, cover: initial?.cover,
      createdAt: initial?.createdAt ?? timestamp, updatedAt: timestamp,
    }
    if (!file && draft.coverUrl.trim()) item.cover = { kind: 'url', url: draft.coverUrl.trim() }
    if (!file && !draft.coverUrl.trim() && initial?.cover?.kind === 'url') item.cover = undefined
    await onSave(item, file)
    setSaving(false)
  }
  return <form onSubmit={submit} className="media-editor">
    <div className="modal-head"><div><span className="eyebrow">{initial ? 'CONTENT EDIT' : 'NEW CONTENT'}</span><h2>{initial ? '작품 정보 다듬기' : '새로운 여운 담기'}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="닫기"><X /></button></div>
    <div className="media-editor-scroll">
      <div className="type-picker" role="radiogroup" aria-label="미디어 유형">
        {(Object.keys(MEDIA_LABELS) as MediaType[]).map((type) => <button type="button" role="radio" aria-checked={draft.type === type} className={draft.type === type ? 'active' : ''} key={type} onClick={() => setDraft({ ...draft, type })}>{mediaIcons[type]} {MEDIA_LABELS[type]}</button>)}
      </div>
      <div className="form-grid">
        <label className="field field-full"><span>제목 <b>필수</b></span><input autoFocus required value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="마음에 남은 작품의 이름" /></label>
        <label className="field"><span>{creatorLabel}</span><input value={draft.creator ?? ''} onChange={(e) => setDraft({ ...draft, creator: e.target.value })} /></label>
        <label className="field"><span>출시 연도</span><input type="number" min="0" max="9999" value={draft.releaseYear ?? ''} onChange={(e) => setDraft({ ...draft, releaseYear: Number(e.target.value) || undefined })} /></label>
        {draft.type === 'game' && <label className="field"><span>플랫폼</span><input value={draft.platform ?? ''} onChange={(e) => setDraft({ ...draft, platform: e.target.value })} placeholder="예: PC, Switch" /></label>}
        <label className="field"><span>경험한 날짜</span><input type="date" value={draft.experienceDate ?? ''} onChange={(e) => setDraft({ ...draft, experienceDate: e.target.value })} /></label>
        <label className="field"><span>상태</span><input value={draft.status ?? ''} onChange={(e) => setDraft({ ...draft, status: e.target.value })} placeholder={draft.type === 'book' ? '읽는 중, 완독' : draft.type === 'game' ? '플레이 중, 완료' : '보는 중, 감상 완료'} /></label>
        <label className="field field-full"><span>태그</span><input value={draft.tagsText} onChange={(e) => setDraft({ ...draft, tagsText: e.target.value })} placeholder="쉼표로 구분해 주세요" /></label>
        <label className="field field-full"><span>나의 한 줄</span><input value={draft.oneLineReview ?? ''} onChange={(e) => setDraft({ ...draft, oneLineReview: e.target.value })} placeholder="이 작품이 내게 남긴 것을 한 문장으로" /></label>
      </div>
      <section className="cover-picker" aria-labelledby="cover-picker-title">
        <div className="cover-picker-head"><div><span id="cover-picker-title">대표 이미지</span><small>지금 촬영하거나 기기에 저장된 사진을 선택하세요.</small></div>{file && <button type="button" onClick={() => setFile(undefined)}>선택 취소</button>}</div>
        <div className="image-source-grid">
          <label className="upload-box camera-box"><Camera /><span>사진 촬영</span><small>카메라로 바로 담기</small><input hidden type="file" accept="image/*" capture="environment" onChange={(e) => setFile(e.target.files?.[0])} /></label>
          <label className="upload-box"><ImagePlus /><span>사진 보관함</span><small>저장된 이미지 선택</small><input hidden type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0])} /></label>
          {previewUrl && <div className="image-preview"><img src={previewUrl} alt="선택한 대표 이미지 미리보기" /><span>{file?.name}</span></div>}
        </div>
        <div className="image-url-row"><span className="or">또는</span><label className="field grow"><span>이미지 URL</span><input type="url" disabled={!!file} value={draft.coverUrl} onChange={(e) => setDraft({ ...draft, coverUrl: e.target.value })} placeholder="https://..." /></label></div>
      </section>
    </div>
    <div className="modal-actions"><button type="button" className="button ghost" onClick={onClose}>취소</button><button className="button primary" disabled={saving || !draft.title.trim()}>{saving ? '담는 중…' : initial ? '변경사항 저장' : '라이브러리에 담기'}</button></div>
  </form>
}

function NoteEditor({ mediaId, initial, onSave, onClose }: { mediaId: string; initial?: MediaNote; onSave: (note: MediaNote) => Promise<void>; onClose: () => void }) {
  const draftKey = `yeoun-note-draft-${mediaId}`
  const stored = !initial ? localStorage.getItem(draftKey) : null
  const recovered = stored ? JSON.parse(stored) as Partial<MediaNote> : {}
  const [noteType, setNoteType] = useState<NoteType>(initial?.noteType ?? recovered.noteType ?? 'memo')
  const [title, setTitle] = useState(initial?.title ?? recovered.title ?? '')
  const [content, setContent] = useState(initial?.content ?? recovered.content ?? '')
  const [recordedAt, setRecordedAt] = useState(initial?.recordedAt ?? recovered.recordedAt ?? today())
  const [savedDraft, setSavedDraft] = useState(false)
  useEffect(() => {
    if (initial || !content) return
    const timer = setTimeout(() => { localStorage.setItem(draftKey, JSON.stringify({ noteType, title, content, recordedAt })); setSavedDraft(true) }, 450)
    return () => clearTimeout(timer)
  }, [content, draftKey, initial, noteType, recordedAt, title])
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!content.trim()) return
    const stamp = now()
    await onSave({ id: initial?.id ?? uid(), mediaId, noteType, title: title.trim() || undefined, content: content.trim(), recordedAt, createdAt: initial?.createdAt ?? stamp, updatedAt: stamp })
    localStorage.removeItem(draftKey)
  }
  return <form onSubmit={submit} className="note-editor">
    <div className="modal-head"><div><span className="eyebrow">{initial ? 'EDIT NOTE' : 'NEW NOTE'}</span><h2>{initial ? '기록 다듬기' : '지금 남아 있는 것'}</h2></div><button type="button" className="icon-button" onClick={onClose}><X /></button></div>
    <div className="note-meta"><label className="select-wrap"><select value={noteType} onChange={(e) => setNoteType(e.target.value as NoteType)}>{(Object.keys(NOTE_LABELS) as NoteType[]).map((type) => <option key={type} value={type}>{NOTE_LABELS[type]}</option>)}</select><ChevronDown /></label><input type="date" value={recordedAt} onChange={(e) => setRecordedAt(e.target.value)} /></div>
    <input className="note-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="제목을 붙여도 좋아요 (선택)" />
    <textarea autoFocus value={content} onChange={(e) => { setContent(e.target.value); setSavedDraft(false) }} placeholder="길지 않아도 괜찮아요. 지금 떠오른 것을 남겨보세요." rows={12} />
    <div className="editor-foot"><span>{initial ? '변경사항은 저장할 때 반영돼요' : savedDraft ? <><Check /> 임시 저장됨</> : '작성 중인 내용은 이 기기에 임시 저장돼요'}</span><div className="modal-actions"><button type="button" className="button ghost" onClick={onClose}>취소</button><button className="button primary" disabled={!content.trim()}>기록 저장</button></div></div>
  </form>
}

export default function App() {
  const [media, setMedia] = useState<MediaItem[]>([])
  const [notes, setNotes] = useState<MediaNote[]>([])
  const [selectedId, setSelectedId] = useState<string>()
  const [filter, setFilter] = useState<'all' | MediaType>('all')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<'recent' | 'title' | 'created'>('recent')
  const [mediaEditor, setMediaEditor] = useState<MediaItem | null | 'new'>(null)
  const [noteEditor, setNoteEditor] = useState<MediaNote | null | 'new'>(null)
  const [settings, setSettings] = useState(false)
  const [toast, setToast] = useState('')
  const [theme, setTheme] = useState<'quiet' | 'fresh'>(() => localStorage.getItem('yeoun-theme') === 'fresh' ? 'fresh' : 'quiet')
  const restoreInput = useRef<HTMLInputElement>(null)
  const load = async () => { setMedia(await db.media.all()); setNotes(await db.notes.all()) }
  useEffect(() => { load() }, [])
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }) }, [selectedId])
  useEffect(() => {
    document.body.dataset.theme = theme
    localStorage.setItem('yeoun-theme', theme)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'fresh' ? '#fff7e7' : '#f3f5ef')
  }, [theme])
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 2600); return () => clearTimeout(timer) }, [toast])
  const selected = media.find((item) => item.id === selectedId)
  const selectedNotes = notes.filter((note) => note.mediaId === selectedId).sort((a, b) => b.recordedAt.localeCompare(a.recordedAt) || b.createdAt.localeCompare(a.createdAt))
  const visible = useMemo(() => media.filter((item) => {
    const term = search.trim().toLocaleLowerCase()
    return (filter === 'all' || item.type === filter) && (!term || item.title.toLocaleLowerCase().includes(term) || item.tags.some((tag) => tag.toLocaleLowerCase().includes(term)))
  }).sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title, 'ko') : sort === 'created' ? b.createdAt.localeCompare(a.createdAt) : b.updatedAt.localeCompare(a.updatedAt)), [filter, media, search, sort])

  const saveMedia = async (item: MediaItem, file?: File) => {
    const previous = media.find((m) => m.id === item.id)
    if (file) {
      if (previous?.cover?.kind === 'blob') await db.assets.delete(previous.cover.assetId)
      const assetId = uid()
      await db.assets.put({ id: assetId, blob: file, filename: file.name, mimeType: file.type })
      item.cover = { kind: 'blob', assetId, filename: file.name, mimeType: file.type }
    }
    await db.media.put(item); await load(); setMediaEditor(null); setToast(previous ? '작품 정보를 저장했어요.' : '새로운 작품을 담았어요.')
  }
  const saveNote = async (note: MediaNote) => {
    await db.notes.put(note)
    if (selected) await db.media.put({ ...selected, updatedAt: now() })
    await load(); setNoteEditor(null); setToast('기록을 고이 저장했어요.')
  }
  const removeMedia = async () => {
    if (!selected || !confirm(`“${selected.title}”과 그 안의 모든 기록을 삭제할까요? 이 작업은 되돌릴 수 없어요.`)) return
    await deleteMediaCascade(selected, notes); setSelectedId(undefined); await load(); setToast('작품과 기록을 삭제했어요.')
  }
  const removeNote = async (note: MediaNote) => {
    if (!confirm('이 기록을 삭제할까요?')) return
    await db.notes.delete(note.id); await load(); setToast('기록을 삭제했어요.')
  }
  const restore = async (file?: File) => {
    if (!file || !confirm('현재 저장된 데이터를 백업 파일의 내용으로 교체할까요?')) return
    try { await restoreBackup(file); await load(); setSelectedId(undefined); setSettings(false); setToast('백업을 온전히 복원했어요.') } catch (error) { alert(error instanceof Error ? error.message : '백업을 읽지 못했어요.') }
  }

  const toggleTheme = () => setTheme((current) => current === 'quiet' ? 'fresh' : 'quiet')
  const themeLabel = theme === 'quiet' ? '상큼 모드' : '서재 모드'

  if (selected) return <div className="app-shell detail-shell">
    <header className="topbar compact"><button className="brand" onClick={() => setSelectedId(undefined)}><span>Yeoun</span><small>여운</small></button><button className="button ghost back" onClick={() => setSelectedId(undefined)}><ArrowLeft /> 라이브러리</button><button className="theme-toggle detail-theme-toggle" type="button" aria-pressed={theme === 'fresh'} onClick={toggleTheme} title={`${themeLabel}로 전환`}><span className="theme-swatch" aria-hidden="true">{theme === 'quiet' ? <SunMedium /> : <Library />}</span><span>{themeLabel}</span></button></header>
    <main className="detail-page">
      <section className="detail-hero">
        <Cover item={selected} className="detail-cover" />
        <div className="detail-info"><span className="eyebrow">{MEDIA_LABELS[selected.type]}</span><h1>{selected.title}</h1>{selected.creator && <p className="creator">{selected.creator}</p>}
          <div className="metadata">{selected.releaseYear && <span>{selected.releaseYear}</span>}{selected.status && <span>{selected.status}</span>}{selected.platform && <span>{selected.platform}</span>}{selected.season && <span>{selected.season}</span>}</div>
          {selected.tags.length > 0 && <div className="tags">{selected.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>}
          <div className="detail-actions"><button className="button quiet" onClick={() => exportOne(selected, selectedNotes)}><Download /> Markdown</button><button className="button quiet" onClick={() => setMediaEditor(selected)}><Pencil /> 수정</button><button className="icon-button danger" onClick={removeMedia} aria-label="작품 삭제"><Trash2 /></button></div>
        </div>
      </section>
      {selected.oneLineReview && <section className="one-line"><span>나의 한 줄</span><blockquote>“{selected.oneLineReview}”</blockquote></section>}
      <section className="notes-section"><div className="section-head"><div><span className="eyebrow">MY NOTES</span><h2>나의 기록 <small>{selectedNotes.length}</small></h2></div><button className="button primary" onClick={() => setNoteEditor('new')}><Plus /> 새 기록</button></div>
        {selectedNotes.length === 0 ? <div className="notes-empty"><Sparkles /><h3>아직 말이 되지 않은 마음도 괜찮아요.</h3><p>한 문장, 기억하고 싶은 장면, 작은 발견부터 남겨보세요.</p><button className="text-button" onClick={() => setNoteEditor('new')}>첫 기록 남기기 <span>→</span></button></div> : <div className="timeline">{selectedNotes.map((note) => <article className="note-card" key={note.id}><div className="note-card-head"><div><time>{note.recordedAt.replaceAll('-', '. ')}</time><span>{NOTE_LABELS[note.noteType]}</span></div><div className="note-tools"><button onClick={() => setNoteEditor(note)} aria-label="기록 수정"><Pencil /></button><button onClick={() => removeNote(note)} aria-label="기록 삭제"><Trash2 /></button></div></div>{note.title && <h3>{note.title}</h3>}<div className="note-content">{note.content}</div></article>)}</div>}
      </section>
    </main>
    {mediaEditor && <Modal onClose={() => setMediaEditor(null)} wide><MediaEditor initial={mediaEditor === 'new' ? undefined : mediaEditor} onSave={saveMedia} onClose={() => setMediaEditor(null)} /></Modal>}
    {noteEditor && <Modal onClose={() => setNoteEditor(null)} wide><NoteEditor mediaId={selected.id} initial={noteEditor === 'new' ? undefined : noteEditor} onSave={saveNote} onClose={() => setNoteEditor(null)} /></Modal>}
    {toast && <div className="toast"><Check />{toast}</div>}
  </div>

  return <div className="app-shell">
    <header className="topbar"><button className="brand"><span>Yeoun</span><small>여운</small></button><nav><button className="nav-active"><Library /> 나의 서재</button><button onClick={() => setSettings(true)}><Settings2 /> 보관과 이동</button></nav><button className="theme-toggle" type="button" aria-pressed={theme === 'fresh'} onClick={toggleTheme} title={`${themeLabel}로 전환`}><span className="theme-swatch" aria-hidden="true">{theme === 'quiet' ? <SunMedium /> : <Library />}</span><span>{themeLabel}</span></button><button className="button primary desktop-add" onClick={() => setMediaEditor('new')}><Plus /> 새 작품</button></header>
    <main className="library-page">
      <section className="intro"><span className="eyebrow">MY PRIVATE ARCHIVE</span><h1>경험이 지나간 자리에<br />남는 것들.</h1><p>책과 영화, 이야기와 플레이 뒤에 남은 작은 생각을<br className="desktop-only" /> 당신만의 속도로 모아두세요.</p></section>
      <section className="library-tools">
        <div className="filters">{(['all', 'book', 'movie', 'series', 'game'] as const).map((type) => <button key={type} className={filter === type ? 'active' : ''} onClick={() => setFilter(type)}>{type === 'all' ? 'All' : MEDIA_LABELS[type]}<span>{type === 'all' ? media.length : media.filter((m) => m.type === type).length}</span></button>)}</div>
        <div className="search-sort"><label className="search"><Search /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="제목이나 태그 검색" /></label><label className="select-wrap"><select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}><option value="recent">최근 기록순</option><option value="title">제목순</option><option value="created">등록일순</option></select><ChevronDown /></label></div>
      </section>
      {visible.length ? <section className="media-grid" aria-live="polite">{visible.map((item) => { const lastNote = notes.filter((n) => n.mediaId === item.id).sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0]; return <button className="media-card" key={item.id} onClick={() => setSelectedId(item.id)}><div className="card-image"><Cover item={item} />{lastNote && <span className="note-count">{notes.filter((n) => n.mediaId === item.id).length} notes</span>}</div><div className="card-copy"><span>{MEDIA_LABELS[item.type]}</span><h2>{item.title}</h2>{(item.oneLineReview || lastNote?.content) && <p>{item.oneLineReview || lastNote.content}</p>}<time>{new Date(item.updatedAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })}</time></div></button>})}</section> : <section className="empty-library"><div className="empty-illustration"><BookOpen /><Film /><Gamepad2 /></div><span className="eyebrow">A QUIET BEGINNING</span><h2>{media.length ? '찾고 있는 작품이 보이지 않아요.' : '최근 마음에 남았던 작품이 있나요?'}</h2><p>{media.length ? '검색어나 필터를 조금 바꿔보세요.' : '완성된 감상이 아니어도 좋아요. 제목 하나에서 당신의 서재가 시작됩니다.'}</p>{!media.length && <button className="button primary" onClick={() => setMediaEditor('new')}><Plus /> 첫 작품 담기</button>}</section>}
    </main>
    <button className="mobile-add" onClick={() => setMediaEditor('new')} aria-label="새 작품 추가"><Plus /></button>
    {mediaEditor && <Modal onClose={() => setMediaEditor(null)} wide><MediaEditor initial={mediaEditor === 'new' ? undefined : mediaEditor} onSave={saveMedia} onClose={() => setMediaEditor(null)} /></Modal>}
    {settings && <Modal onClose={() => setSettings(false)}><div className="modal-head"><div><span className="eyebrow">PORTABILITY</span><h2>기록을 내 곁에</h2></div><button className="icon-button" onClick={() => setSettings(false)}><X /></button></div><p className="settings-lead">여운의 기록은 특정 서비스에 묶이지 않습니다. 읽기 위한 Markdown과 복원을 위한 JSON을 구분해 보관하세요.</p><div className="settings-list"><button onClick={() => exportLibrary(media, notes)} disabled={!media.length}><span className="settings-icon"><Download /></span><span><b>전체 Markdown ZIP</b><small>Obsidian용 문서와 업로드 이미지를 폴더별로 정리합니다.</small></span><span>→</span></button><button onClick={() => exportBackup(media, notes)} disabled={!media.length}><span className="settings-icon"><Download /></span><span><b>JSON 전체 백업</b><small>이미지와 모든 앱 데이터를 하나의 파일로 보관합니다.</small></span><span>→</span></button><button onClick={() => restoreInput.current?.click()}><span className="settings-icon"><Upload /></span><span><b>JSON 백업 복원</b><small>현재 데이터를 선택한 백업 내용으로 교체합니다.</small></span><span>→</span></button></div><input ref={restoreInput} hidden type="file" accept="application/json,.json" onChange={(e) => restore(e.target.files?.[0])} /><div className="local-note"><span>이 기기에 저장됨</span><p>브라우저 데이터를 지우면 기록도 사라질 수 있어요. 가끔 JSON 백업을 받아주세요.</p></div></Modal>}
    {toast && <div className="toast"><Check />{toast}</div>}
  </div>
}
