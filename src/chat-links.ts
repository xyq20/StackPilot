import type { App, ChatLink } from './model'
export function threadUrl(threadId: string) {
  return 'codex://threads/' + encodeURIComponent(threadId)
}
export function matchRemoteControl(link: ChatLink, app: App | undefined) {
  if (link.location !== 'remote' || !link.machine) return null
  if (link.stationUrl) return link.stationUrl
  const same = (s: string) => s.trim().normalize('NFC').toLowerCase()
  return app?.id === link.appId &&
    same(app.project.machine) === same(link.machine)
    ? app.project.remoteUrl || null
    : null
}

type ChatUseAction = 'open' | 'copy' | 'remote'
type ChatTarget = {
  threadId: string
  id?: string
  location?: 'remote' | 'local'
}
export type ChatUse = {
  threadId: string
  linkId: string
  location: 'remote' | 'local'
  action: ChatUseAction
  at: number
}
const usageKey = 'stackpilot.chat-usage.v1'
const usageEvent = 'stackpilot-chat-usage'
const actionKinds = new Set(['open', 'copy', 'remote'])

export function chatUses(): ChatUse[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(usageKey) || '[]')
    if (!Array.isArray(data)) return []
    return data
      .filter(
        (entry): entry is ChatUse =>
          !!entry &&
          typeof entry.threadId === 'string' &&
          typeof entry.linkId === 'string' &&
          (entry.location === 'local' || entry.location === 'remote') &&
          actionKinds.has(entry.action) &&
          Number.isFinite(entry.at),
      )
      .slice(0, 32)
  } catch {
    return []
  }
}

// Only technical identifiers and the user's action are persisted. Titles and
// paths always come from the currently available workspace or an explicit search.
export function rememberChatUse(target: ChatTarget, action: ChatUseAction) {
  const current: ChatUse = {
    threadId: target.threadId,
    linkId: target.id || '',
    location: target.location || 'local',
    action,
    at: Date.now(),
  }
  const entries = chatUses().filter(
    (row) =>
      current.threadId !== row.threadId ||
      current.linkId !== row.linkId ||
      current.location !== row.location,
  )
  try {
    localStorage.setItem(
      usageKey,
      JSON.stringify([current, ...entries].slice(0, 32)),
    )
  } catch {
    return
  }
  window.dispatchEvent(new Event(usageEvent))
}

export function lastChatUse(uses: ChatUse[], target: ChatTarget) {
  const location = target.location || 'local'
  return uses.find(
    (row) =>
      row.threadId === target.threadId &&
      row.location === location &&
      (row.linkId === target.id ||
        (location === 'local' && (!row.linkId || !target.id))),
  )
}

export function observeChatUses(listener: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key === usageKey || !event.key) listener()
  }
  window.addEventListener('storage', storage)
  window.addEventListener(usageEvent, listener)
  return () => {
    window.removeEventListener('storage', storage)
    window.removeEventListener(usageEvent, listener)
  }
}
