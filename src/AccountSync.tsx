import { useState, useSyncExternalStore, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { Cloud, X } from 'lucide-react'
import { getSyncSnapshot, requestLogin, resolveConflict, runSync, signOut, subscribeSync } from './sync'

export default function AccountSync() {
  const sync = useSyncExternalStore(subscribeSync, getSyncSnapshot)
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')

  const login = async (event: FormEvent) => {
    event.preventDefault()
    if (await requestLogin(email.trim())) setEmail('')
  }

  const uploadLabel = !sync.localCount ? '올릴 기록 없음' : sync.pendingCount ? '기존 기록 올리기' : '모두 업로드됨'

  return <>
    <button className="account-trigger" type="button" onClick={() => setOpen(true)} aria-label="Lumloom 계정과 동기화">
      <span className={`account-status-dot ${sync.signedIn ? 'online' : ''}`} />
      <span>{sync.signedIn ? sync.email : 'Lumloom 계정'}</span>
    </button>
    {open && createPortal(<div className="modal-backdrop account-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false) }}>
      <section className="modal account-modal" role="dialog" aria-modal="true" aria-labelledby="account-title">
        <div className="modal-head"><div><span className="eyebrow">LUMLOOM ACCOUNT</span><h2 id="account-title">계정과 동기화</h2></div><button className="icon-button" onClick={() => setOpen(false)} aria-label="닫기"><X /></button></div>
        <p className="settings-lead">같은 계정으로 로그인하면 데스크탑, 아이패드, 아이폰에서 작품과 기록을 이어서 볼 수 있습니다.</p>
        {!sync.signedIn ? <form className="account-login" onSubmit={login}>
          <label className="field"><span>이메일</span><input type="email" inputMode="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" /></label>
          <button className="button primary" disabled={sync.busy}>{sync.busy ? '보내는 중…' : '로그인 링크 받기'}</button>
          <small>메일함에서 가장 최근 링크를 눌러주세요.</small>
        </form> : <div className="account-session">
          <div className="account-email"><span>로그인한 계정</span><strong>{sync.email}</strong><button className="text-button" onClick={() => void signOut()}>로그아웃</button></div>
          <div className="sync-summary"><div><strong>{sync.localCount}</strong><span>이 기기 기록</span></div><div><strong>{sync.cloudCount}</strong><span>클라우드 기록</span></div><div><strong>{sync.conflicts.length}</strong><span>확인할 충돌</span></div></div>
          <div className="sync-actions"><button className="button primary" disabled={sync.busy} onClick={() => void runSync(false)}><Cloud />지금 동기화</button><button className="button quiet" disabled={sync.busy || !sync.localCount || !sync.pendingCount} onClick={() => void runSync(true)}>{uploadLabel}</button></div>
          {sync.conflicts.map((conflict) => <div className="sync-conflict" key={conflict.key}><strong>{conflict.label}</strong><span>이 기기와 클라우드에서 모두 변경되었습니다.</span><div><button onClick={() => void resolveConflict(conflict.key, 'local')}>이 기기 사용</button><button onClick={() => void resolveConflict(conflict.key, 'remote')}>클라우드 사용</button></div></div>)}
        </div>}
        {sync.message && <p className={`sync-message ${sync.error ? 'error' : ''}`} role="status">{sync.message}</p>}
      </section>
    </div>, document.body)}
  </>
}
