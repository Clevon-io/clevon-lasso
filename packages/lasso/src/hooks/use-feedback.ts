import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { serializeFeedback, type FeedbackItem, type FeedbackTarget } from '../core/feedback-format'
import type {
  ElementMeta,
  Point,
  Rect,
  RegionSelection,
  TrackedNode,
} from '../core/inspector-protocol'
import { DRAFT_KEY, MarkerStore, type Placement } from '../core/marker-store'

interface Offset {
  dx: number
  dy: number
}

export interface FeedbackDraft {
  target: FeedbackTarget
  /** 생성 시점의 클릭 지점 — 이후 실시간 좌표는 MarkerStore가 갖는다 */
  point: Point
  pointOffset: Offset
  rect: Rect | null
  rectOffset: Offset | null
}

interface InspectorApi {
  connected: boolean
  track: (scope: string, nodes: TrackedNode[]) => void
  capture: (target: { nodeId?: number; rect?: Rect }) => Promise<string | null>
}

function trackingAnchor(
  target: FeedbackTarget,
): { nodeId: number; selector: string; rect: Rect } | null {
  if (target.kind === 'element') {
    return { nodeId: target.meta.nodeId, selector: target.meta.selector, rect: target.meta.rect }
  }
  if (target.anchorNodeId == null) return null
  const anchor = target.elements.find((el) => el.nodeId === target.anchorNodeId)
  return anchor ? { nodeId: anchor.nodeId, selector: anchor.selector, rect: anchor.rect } : null
}

/** 앵커 요소가 이동한 만큼 마커를 따라 옮긴다 — 크기는 생성 시점 값을 유지한다 */
function place(
  source: { pin: Point; pinOffset: Offset; rect: Rect | null; rectOffset: Offset | null },
  anchor: Rect,
): Placement {
  return {
    pin: { x: anchor.x + source.pinOffset.dx, y: anchor.y + source.pinOffset.dy },
    rect:
      source.rect && source.rectOffset
        ? { ...source.rect, x: anchor.x + source.rectOffset.dx, y: anchor.y + source.rectOffset.dy }
        : source.rect,
  }
}

/** 피드백 버블 수집 상태 — 클릭 지점 선택 → 코멘트 초안 → 항목 축적 → 직렬화 */
export function useFeedback(inspector: InspectorApi) {
  const [items, setItems] = useState<FeedbackItem[]>([])
  const [draft, setDraft] = useState<FeedbackDraft | null>(null)
  const [markers] = useState(() => new MarkerStore())

  // 좌표 갱신 콜백은 프레임마다 불리므로 상태를 deps로 걸지 않는다 — 콜백 참조가 매번 바뀌면
  // FeedbackOverlay와 track effect가 덩달아 재실행된다
  const itemsRef = useRef(items)
  itemsRef.current = items
  const draftRef = useRef(draft)
  draftRef.current = draft

  const { connected, track, capture } = inspector

  const trackedNodes = useMemo(() => {
    const nodes = new Map<number, string>()
    for (const item of items) {
      const anchor = trackingAnchor(item.target)
      if (anchor) nodes.set(anchor.nodeId, anchor.selector)
    }
    if (draft) {
      const anchor = trackingAnchor(draft.target)
      if (anchor) nodes.set(anchor.nodeId, anchor.selector)
    }
    return [...nodes].map(([nodeId, selector]) => ({ nodeId, selector }))
  }, [items, draft])
  // 추적 대상 집합이 실제로 바뀔 때만 재전송 — items/draft는 참조가 바뀌므로 객체를 deps에 걸면
  // track↔rects 무한 루프가 된다.
  // connected가 다시 true가 될 때(iframe 리로드)의 재전송은 인스펙터 selector 재바인딩용.
  const trackedKey = trackedNodes.map((node) => `${node.nodeId}:${node.selector}`).join('\n')
  useEffect(() => {
    if (!connected) return
    track('feedback', trackedNodes)
  }, [trackedKey, track, connected])

  const beginElementDraft = useCallback(
    (meta: ElementMeta, point?: Point) => {
      const p = point ?? { x: meta.rect.x + meta.rect.width, y: meta.rect.y }
      markers.write(DRAFT_KEY, { pin: p, rect: null })
      setDraft({
        target: { kind: 'element', meta },
        point: p,
        pointOffset: { dx: p.x - meta.rect.x, dy: p.y - meta.rect.y },
        rect: null,
        rectOffset: null,
      })
    },
    [markers],
  )

  const beginRegionDraft = useCallback(
    (region: RegionSelection) => {
      const target: FeedbackTarget = {
        kind: 'region',
        rect: region.rect,
        elements: region.elements,
        anchorNodeId: region.elements[0]?.nodeId ?? null,
      }
      const point = region.point ?? { x: region.rect.x + region.rect.width, y: region.rect.y }
      const anchor = trackingAnchor(target)
      markers.write(DRAFT_KEY, { pin: point, rect: region.rect })
      setDraft({
        target,
        point,
        pointOffset: anchor
          ? { dx: point.x - anchor.rect.x, dy: point.y - anchor.rect.y }
          : { dx: 0, dy: 0 },
        rect: region.rect,
        rectOffset: anchor
          ? { dx: region.rect.x - anchor.rect.x, dy: region.rect.y - anchor.rect.y }
          : null,
      })
    },
    [markers],
  )

  const cancelDraft = useCallback(() => {
    markers.forget(DRAFT_KEY)
    setDraft(null)
  }, [markers])

  const saveDraft = useCallback(
    (comment: string) => {
      const current = draftRef.current
      const trimmed = comment.trim()
      if (!current || !trimmed) return
      // 초안이 살아 있는 동안 앵커가 움직였을 수 있으므로 최신 좌표로 확정한다
      const live = markers.read(DRAFT_KEY)
      const pin = live?.pin ?? current.point
      const rect = live?.rect ?? current.rect
      const id = crypto.randomUUID()

      markers.write(id, { pin, rect })
      markers.forget(DRAFT_KEY)
      setItems((prev) => [
        ...prev,
        {
          id,
          target: current.target,
          comment: trimmed,
          screenshot: null,
          pin,
          pinOffset: current.pointOffset,
          rect,
          rectOffset: current.rectOffset,
          stale: false,
        },
      ])
      setDraft(null)

      const captureTarget =
        current.target.kind === 'element'
          ? { nodeId: current.target.meta.nodeId }
          : { rect: rect ?? current.target.rect }
      capture(captureTarget).then((dataUrl) => {
        if (dataUrl) {
          setItems((prev) => prev.map((it) => (it.id === id ? { ...it, screenshot: dataUrl } : it)))
        }
      })
    },
    [markers, capture],
  )

  const removeItem = useCallback(
    (id: string) => {
      markers.forget(id)
      setItems((prev) => prev.filter((item) => item.id !== id))
    },
    [markers],
  )

  /**
   * 셸이 보고한 앵커 rect를 마커 좌표에 반영한다.
   * 좌표는 스토어로만 흘려보내고 상태는 건드리지 않는다 — 여기서 setState를 하면 스크롤 프레임마다
   * 화면 전체가 리렌더된다. 상태를 바꾸는 건 앵커가 사라지거나 되살아난 stale 전환뿐이다.
   */
  const updateRects = useCallback(
    (rects: Record<number, Rect | null>) => {
      const staleFlips = new Map<string, boolean>()

      for (const item of itemsRef.current) {
        const anchor = trackingAnchor(item.target)
        if (!anchor) continue
        const rect = rects[anchor.nodeId]
        if (rect === undefined) continue
        if (!rect) {
          if (!item.stale) staleFlips.set(item.id, true)
          continue
        }
        if (item.stale) staleFlips.set(item.id, false)
        markers.write(item.id, place(item, rect))
      }

      if (staleFlips.size > 0) {
        setItems((prev) =>
          prev.map((item) => {
            const next = staleFlips.get(item.id)
            return next === undefined || next === item.stale ? item : { ...item, stale: next }
          }),
        )
      }

      const current = draftRef.current
      if (!current) return
      const anchor = trackingAnchor(current.target)
      if (!anchor) return
      const rect = rects[anchor.nodeId]
      if (!rect) return
      markers.write(
        DRAFT_KEY,
        place(
          {
            pin: current.point,
            pinOffset: current.pointOffset,
            rect: current.rect,
            rectOffset: current.rectOffset,
          },
          rect,
        ),
      )
    },
    [markers],
  )

  const clear = useCallback(() => {
    for (const item of itemsRef.current) markers.forget(item.id)
    markers.forget(DRAFT_KEY)
    setItems([])
    setDraft(null)
  }, [markers])

  const serialize = useCallback(
    (): { message: string; images: string[] } => serializeFeedback(items),
    [items],
  )

  return {
    items,
    draft,
    markers,
    beginElementDraft,
    beginRegionDraft,
    cancelDraft,
    saveDraft,
    removeItem,
    updateRects,
    clear,
    serialize,
  }
}
