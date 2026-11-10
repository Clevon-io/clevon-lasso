import type { FeedbackItem } from './feedback-format'
import type { FeedbackDraft } from '../hooks/use-feedback'

/*
 * 보내기 전 코멘트를 탭의 sessionStorage 에 둔다. 에이전트가 코드를 고쳐 페이지가 통째로
 * 새로 고쳐져도 모아 둔 코멘트와 쓰던 글이 남는다.
 */
const ITEMS_KEY = 'clevon-lasso:items'
const DRAFT_KEY = 'clevon-lasso:draft'

export interface SavedDraft {
  draft: FeedbackDraft
  text: string
}

function read<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown) {
  try {
    if (value == null) sessionStorage.removeItem(key)
    else sessionStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export function loadItems(): FeedbackItem[] {
  const items = read<FeedbackItem[]>(ITEMS_KEY)
  return Array.isArray(items) ? items.map((item) => ({ ...item, stale: false })) : []
}

export function saveItems(items: FeedbackItem[]) {
  if (items.length === 0) return void write(ITEMS_KEY, null)
  // 용량을 넘기면 스크린샷을 빼고라도 코멘트는 남긴다
  if (!write(ITEMS_KEY, items)) write(ITEMS_KEY, items.map((item) => ({ ...item, screenshot: null })))
}

export function loadDraft(): SavedDraft | null {
  const saved = read<SavedDraft>(DRAFT_KEY)
  return saved?.draft ? saved : null
}

export function saveDraft(saved: SavedDraft | null) {
  write(DRAFT_KEY, saved)
}
