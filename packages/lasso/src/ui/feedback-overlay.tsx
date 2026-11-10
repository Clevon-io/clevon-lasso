'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { memo, useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { FeedbackDraft } from '../hooks/use-feedback'
import type { FeedbackItem } from '../core/feedback-format'
import { UI_ATTR, type Point } from '../core/inspector-protocol'
import { DRAFT_KEY, type MarkerStore, type Placement } from '../core/marker-store'

interface FeedbackOverlayProps {
  items: FeedbackItem[]
  draft: FeedbackDraft | null
  markers: MarkerStore
  /** 둘러보기 중에는 마커가 앱 클릭을 가로막지 않도록 비활성화한다 */
  browsing?: boolean
  onSaveDraft: (comment: string) => void
  draftText: string
  onDraftTextChange: (text: string) => void
  onCancelDraft: () => void
}

const PIN_SIZE = 18
const DOT_SIZE = 16
const CHIP_SIZE = 18
const EDGE = 8
const GAP = 8
const POPOVER_WIDTH = 300

/** 마커는 클릭 지점 위에 서지만 화면 위쪽에 붙은 요소면 아래로 뒤집는다 — 그대로 두면 잘린다 */
function pinBand(point: Point, size: number) {
  const flipped = point.y - size < EDGE
  return {
    flipped,
    top: flipped ? point.y : point.y - size,
    bottom: flipped ? point.y + size : point.y,
  }
}

/** 꼬리(각진 모서리)가 클릭 지점 쪽을 향하도록 */
function pinRadius(flipped: boolean) {
  return flipped ? '2px 50% 50% 50%' : '50% 50% 50% 2px'
}

/**
 * 스토어의 좌표를 DOM에 직접 반영한다.
 * 구독 콜백은 리렌더를 거치지 않고 스타일만 쓰므로 스크롤 프레임에 React가 끼어들지 않는다.
 * deps 없는 layout effect는 매 렌더 뒤 재적용용 — 리렌더가 style prop을 되돌려도 좌표가 살아남고,
 * apply가 참조하는 측정값(박스 크기 등)이 늦게 확정돼도 따라온다.
 */
function usePlacement(
  store: MarkerStore,
  id: string,
  initial: Placement,
  apply: (placement: Placement) => void,
) {
  const applyRef = useRef(apply)
  applyRef.current = apply
  const initialRef = useRef(initial)
  initialRef.current = initial

  useLayoutEffect(() => {
    applyRef.current(store.read(id) ?? initialRef.current)
  })

  useLayoutEffect(
    () => store.subscribe(id, (placement) => applyRef.current(placement)),
    [store, id],
  )
}

function FeedbackOverlayImpl({
  items,
  draft,
  markers,
  browsing,
  onSaveDraft,
  onCancelDraft,
  draftText,
  onDraftTextChange,
}: FeedbackOverlayProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const hovered = browsing
    ? null
    : (items.find((item) => item.id === hoveredId && !item.stale) ?? null)

  const hover = useCallback((id: string, on: boolean) => {
    setHoveredId((prev) => (on ? id : prev === id ? null : prev))
  }, [])

  return (
    <div {...{ [UI_ATTR]: '' }} className="pointer-events-none fixed inset-0 z-[2147483640]">
      {items.map((item, i) => {
        if (item.stale) return null
        if (item.target.kind === 'region' && item.rect) {
          return (
            <RegionMarker
              key={item.id}
              store={markers}
              item={item}
              index={i}
              inert={browsing}
              onHover={hover}
            />
          )
        }
        return (
          <PinMarker
            key={item.id}
            store={markers}
            item={item}
            index={i}
            inert={browsing}
            onHover={hover}
          />
        )
      })}

      {/* 툴팁은 마커 안에 중첩하지 않고 오버레이 좌표계에 직접 띄운다 — 뷰포트 클램핑을 위해 */}
      <AnimatePresence>
        {hovered && <CommentTip key={hovered.id} store={markers} item={hovered} />}
      </AnimatePresence>

      <AnimatePresence>
        {draft && <DraftIndicator key="draft-indicator" store={markers} draft={draft} />}
      </AnimatePresence>

      <AnimatePresence>
        {draft && (
          <DraftPopover
            key="draft-popover"
            store={markers}
            point={draft.point}
            initialText={draftText}
            onTextChange={onDraftTextChange}
            onSave={onSaveDraft}
            onCancel={onCancelDraft}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// 채팅 스트리밍 등 화면의 다른 상태 변화로 마커 트리까지 리렌더되지 않게 막는다
export const FeedbackOverlay = memo(FeedbackOverlayImpl)

/** 코멘트 작성 중 클릭 지점·드래그 영역을 유지해 보여준다 — 드래그 영역은 그 자체가 표시라 마커를 얹지 않는다 */
function DraftIndicator({ store, draft }: { store: MarkerStore; draft: FeedbackDraft }) {
  const region = draft.target.kind === 'region'
  const ref = useRef<HTMLDivElement>(null)

  usePlacement(store, DRAFT_KEY, { pin: draft.point, rect: draft.rect }, (placement) => {
    const node = ref.current
    if (!node) return
    if (region) {
      const rect = placement.rect
      if (!rect) return
      node.style.transform = `translate3d(${rect.x}px, ${rect.y}px, 0)`
      node.style.width = `${rect.width}px`
      node.style.height = `${rect.height}px`
      return
    }
    const band = pinBand(placement.pin, DOT_SIZE)
    node.style.transform = `translate3d(${placement.pin.x}px, ${band.top}px, 0)`
    const dot = node.firstElementChild as HTMLElement | null
    if (dot) dot.style.borderRadius = pinRadius(band.flipped)
  })

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12, ease: 'easeOut' }}
      className="pointer-events-none absolute inset-0"
    >
      {region ? (
        <div
          ref={ref}
          className="absolute left-0 top-0 rounded-[3px] border-[1.5px] border-blue-500/70 bg-blue-500/[0.06] will-change-transform"
        />
      ) : (
        <div ref={ref} className="absolute left-0 top-0 will-change-transform">
          <div className="flex size-4 items-center justify-center bg-blue-500 shadow-[0_1px_4px_rgb(24_24_27/0.25)] ring-1 ring-white">
            <span className="block size-1 rounded-full bg-white" />
          </div>
        </div>
      )}
    </motion.div>
  )
}

/** 요소 피드백 핀 — 좌하단 꼭지가 클릭 지점에 닿는다 */
function PinMarker({
  store,
  item,
  index,
  inert,
  onHover,
}: {
  store: MarkerStore
  item: FeedbackItem
  index: number
  inert?: boolean
  onHover: (id: string, on: boolean) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const pinRef = useRef<HTMLDivElement>(null)

  usePlacement(store, item.id, { pin: item.pin, rect: item.rect }, (placement) => {
    const node = ref.current
    if (!node) return
    const band = pinBand(placement.pin, PIN_SIZE)
    node.style.transform = `translate3d(${placement.pin.x}px, ${band.top}px, 0)`
    if (pinRef.current) pinRef.current.style.borderRadius = pinRadius(band.flipped)
  })

  return (
    <div
      ref={ref}
      className={`absolute left-0 top-0 will-change-transform ${inert ? 'pointer-events-none' : 'pointer-events-auto'}`}
      onMouseEnter={() => onHover(item.id, true)}
      onMouseLeave={() => onHover(item.id, false)}
    >
      <div
        ref={pinRef}
        className="flex size-4.5 items-center justify-center bg-blue-500 text-[10px] font-semibold text-white shadow-[0_1px_4px_rgb(24_24_27/0.25)] ring-1 ring-white"
      >
        {index + 1}
      </div>
    </div>
  )
}

/** 드래그 피드백 — 선택 영역 자체를 표시하고 모서리에 번호 칩만 붙인다 */
function RegionMarker({
  store,
  item,
  index,
  inert,
  onHover,
}: {
  store: MarkerStore
  item: FeedbackItem
  index: number
  inert?: boolean
  onHover: (id: string, on: boolean) => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  usePlacement(store, item.id, { pin: item.pin, rect: item.rect }, (placement) => {
    const node = ref.current
    const rect = placement.rect
    if (!node || !rect) return
    node.style.transform = `translate3d(${rect.x}px, ${rect.y}px, 0)`
    node.style.width = `${rect.width}px`
    node.style.height = `${rect.height}px`
  })

  return (
    <div ref={ref} className="absolute left-0 top-0 will-change-transform">
      <div className="pointer-events-none absolute inset-0 rounded-[3px] border border-blue-500/60 bg-blue-500/[0.04]" />
      <div
        className={`absolute flex size-4.5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-blue-500 text-[10px] font-semibold text-white shadow-[0_1px_4px_rgb(24_24_27/0.25)] ring-1 ring-white ${
          inert ? 'pointer-events-none' : 'pointer-events-auto'
        }`}
        onMouseEnter={() => onHover(item.id, true)}
        onMouseLeave={() => onHover(item.id, false)}
      >
        {index + 1}
      </div>
    </div>
  )
}

interface Box {
  width: number
  height: number
}

/** 마커가 차지하는 세로 구간 — 툴팁은 이 위/아래로 붙는다 */
interface TipAnchor {
  x: number
  top: number
  bottom: number
}

function tipAnchor(item: FeedbackItem, placement: Placement): TipAnchor {
  if (item.target.kind === 'region' && placement.rect) {
    const { x, y } = placement.rect
    return { x, top: y - CHIP_SIZE / 2, bottom: y + CHIP_SIZE / 2 }
  }
  const band = pinBand(placement.pin, PIN_SIZE)
  return { x: placement.pin.x, top: band.top, bottom: band.bottom }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, Math.max(min, max)))
}

/** 마커 위에 붙이되 위 공간이 모자라면 아래로 뒤집고, 어느 쪽이든 뷰포트 안으로 물린다 */
function placeTip(anchor: TipAnchor, box: Box) {
  const above = anchor.top - GAP - box.height
  const top = above < EDGE ? anchor.bottom + GAP : above
  return {
    left: clamp(anchor.x, EDGE, window.innerWidth - box.width - EDGE),
    top: clamp(top, EDGE, window.innerHeight - box.height - EDGE),
  }
}

/** 클릭 지점 오른쪽에 두되 폭이 모자라면 왼쪽으로 뒤집고, 세로는 실제 높이만큼 물린다 */
function placePopover(point: Point, box: Box) {
  const right = point.x + 10
  const left = right + box.width > window.innerWidth - EDGE ? point.x - box.width - 10 : right
  return {
    left: clamp(left, EDGE, window.innerWidth - box.width - EDGE),
    top: clamp(point.y - GAP, EDGE, window.innerHeight - box.height - EDGE),
  }
}

/** 렌더된 실제 크기를 재서 넘겨준다 — 레이아웃 이펙트라 페인트 전에 위치가 확정된다 */
function useBoxSize(ref: React.RefObject<HTMLElement | null>, key: unknown): Box | null {
  const [box, setBox] = useState<Box | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const next = { width: el.offsetWidth, height: el.offsetHeight }
    setBox((prev) =>
      prev && prev.width === next.width && prev.height === next.height ? prev : next,
    )
  }, [ref, key])
  return box
}

function CommentTip({ store, item }: { store: MarkerStore; item: FeedbackItem }) {
  const ref = useRef<HTMLDivElement>(null)
  const box = useBoxSize(ref, item.comment)

  usePlacement(store, item.id, { pin: item.pin, rect: item.rect }, (placement) => {
    const node = ref.current
    if (!node || !box) return
    const pos = placeTip(tipAnchor(item, placement), box)
    node.style.left = `${pos.left}px`
    node.style.top = `${pos.top}px`
    node.style.visibility = 'visible'
  })

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.12, ease: 'easeOut' }}
      style={{ visibility: 'hidden' }}
      className="pointer-events-none absolute w-max max-w-[280px] rounded-[12px] bg-zinc-900 px-3 py-2 shadow-xl"
    >
      {/* 긴 코멘트도 툴팁이 화면을 넘지 않도록 줄 수를 제한한다 — 전체 내용은 트레이에서 본다 */}
      <p className="line-clamp-6 whitespace-pre-wrap text-[12px] leading-5 text-white">
        {item.comment}
      </p>
      <p className="mt-1 truncate text-[10px] text-zinc-400">{targetLabel(item)}</p>
    </motion.div>
  )
}

function targetLabel(item: FeedbackItem): string {
  if (item.target.kind === 'element') {
    const m = item.target.meta
    return `<${m.tag}>${m.text ? ` ${m.text.slice(0, 40)}` : ''}`
  }
  return `영역 선택 · 요소 ${item.target.elements.length}개`
}

function DraftPopover({
  store,
  point,
  initialText,
  onTextChange,
  onSave,
  onCancel,
}: {
  store: MarkerStore
  point: Point
  initialText: string
  onTextChange: (text: string) => void
  onSave: (comment: string) => void
  onCancel: () => void
}) {
  const [comment, setComment] = useState(initialText)
  const ref = useRef<HTMLDivElement>(null)
  const box = useBoxSize(ref, null)

  usePlacement(store, DRAFT_KEY, { pin: point, rect: null }, (placement) => {
    const node = ref.current
    if (!node) return
    const pos = placePopover(placement.pin, box ?? { width: POPOVER_WIDTH, height: 0 })
    node.style.left = `${pos.left}px`
    node.style.top = `${pos.top}px`
  })

  const submit = useCallback(() => {
    if (comment.trim()) onSave(comment)
  }, [comment, onSave])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
    if (e.key === 'Escape') {
      e.stopPropagation()
      onCancel()
    }
  }

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 4, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.98 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className="glass pointer-events-auto absolute flex flex-col gap-2 rounded-[16px] p-3"
      style={{ width: POPOVER_WIDTH }}
    >
      <textarea
        value={comment}
        onChange={(e) => {
          setComment(e.target.value)
          onTextChange(e.target.value)
        }}
        onKeyDown={handleKeyDown}
        placeholder={'이 부분에 대한 피드백을 적어주세요…'}
        rows={3}
        autoFocus
        className="w-full resize-none bg-transparent px-1 py-0.5 text-[13px] leading-5 text-zinc-900 outline-none placeholder:text-zinc-400"
      />
      <div className="flex justify-end gap-1.5">
        <button
          onClick={onCancel}
          className="rounded-full px-3 py-1.5 text-[12px] text-zinc-500 transition-colors hover:bg-zinc-900/5 hover:text-zinc-900"
        >
          {'취소'}
        </button>
        <button
          onClick={submit}
          disabled={!comment.trim()}
          className="rounded-full bg-zinc-900 px-3.5 py-1.5 text-[12px] font-medium text-white transition-transform active:scale-95 disabled:opacity-25 disabled:active:scale-100"
        >
          {'추가'}
        </button>
      </div>
    </motion.div>
  )
}
