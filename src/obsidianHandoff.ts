const SUCCESS_PARAM = 'lumloom_obsidian_saved'

export const OBSIDIAN_UNCONFIRMED_MESSAGE = '저장 완료를 확인하지 못했어요. Lumloom Vault가 없거나 이름이 다를 수 있습니다. Markdown 저장을 이용해 주세요.'

export function beginObsidianHandoff(storageKey: string) {
  const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  localStorage.setItem(storageKey, token)
  const callbackUrl = new URL(window.location.href)
  callbackUrl.searchParams.set(SUCCESS_PARAM, token)
  return { token, successUrl: callbackUrl.toString() }
}

export function cancelObsidianHandoff(storageKey: string, token: string) {
  if (localStorage.getItem(storageKey) === token) localStorage.removeItem(storageKey)
}

export function consumeObsidianSuccess(storageKey: string) {
  const currentUrl = new URL(window.location.href)
  const token = currentUrl.searchParams.get(SUCCESS_PARAM)
  if (!token) return false
  const confirmed = localStorage.getItem(storageKey) === token
  if (confirmed) localStorage.removeItem(storageKey)
  currentUrl.searchParams.delete(SUCCESS_PARAM)
  window.history.replaceState(window.history.state, '', `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`)
  return confirmed
}

export function watchObsidianHandoff(storageKey: string, token: string, onUnconfirmed: () => void) {
  let departed = false
  let settled = false
  const pending = () => localStorage.getItem(storageKey) === token
  const cleanup = () => {
    window.removeEventListener('blur', onDepart)
    window.removeEventListener('focus', onReturn)
    document.removeEventListener('visibilitychange', onVisibility)
  }
  const finish = () => {
    if (settled) return
    settled = true
    cleanup()
    if (!pending()) return
    localStorage.removeItem(storageKey)
    onUnconfirmed()
  }
  const onDepart = () => { departed = true }
  const onReturn = () => { if (departed) window.setTimeout(finish, 500) }
  const onVisibility = () => document.hidden ? onDepart() : onReturn()
  window.addEventListener('blur', onDepart)
  window.addEventListener('focus', onReturn)
  document.addEventListener('visibilitychange', onVisibility)
  window.setTimeout(() => { if (!departed && !document.hidden) finish() }, 8000)
}
