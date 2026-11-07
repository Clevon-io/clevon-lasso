/**
 * Clevon Lander packages/preview/src/client.ts 의 피드백 검사기를 같은 문서 안에서 돌도록 옮겼다.
 * Lander 는 앱을 iframe 에 띄우고 postMessage 로 부모와 대화하지만, 여기서는 페이지 자신을 검사하므로
 * 메시지 대신 콜백을 부르고, 피드백 UI([data-dev-feedback-ui]) 위의 입력은 가로채지 않는다.
 */
import { getFontEmbedCSS, toCanvas } from 'html-to-image'

import {
  UI_ATTR,
  type CaptureTarget,
  type ElementMeta,
  type Point,
  type Rect,
  type RegionSelection,
  type TrackedNode,
  type WireMode,
} from './inspector-protocol'

export interface InspectorCallbacks {
  onSelect: (meta: ElementMeta, point: Point) => void
  onRegionSelect: (region: RegionSelection) => void
  onRects: (rects: Record<number, Rect | null>) => void
  onEscape: () => void
  onToggleBrowse: () => void
}

const COMPUTED_PROPS = [
  'color',
  'backgroundColor',
  'fontSize',
  'fontWeight',
  'borderRadius',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
] as const
const MAX_CAPTURE_WIDTH = 800

const NEXT_INTERNAL =
  /^__|Boundary|_boundary|HotReload|DevRoot|Router|Segment|Scroll|Handler|StateProvider|^(Inner|Outer)?Layout|^(Root|RootLayout|Html|Body|App|ServerRoot|Head)$|^RenderFromTemplateContext$/

function inUi(target: EventTarget | null): boolean {
  const el = target as Element | null
  return Boolean(el && typeof el.closest === 'function' && el.closest(`[${UI_ATTR}]`))
}

function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || typeof el.tagName !== 'string') return false
  return el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT'
}

/** Space 홀드를 가로채면 안 되는 포커스 대상 — 입력 중이거나 버튼 활성화 중일 때 */
function skipsHoldKey(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || typeof el.tagName !== 'string') return false
  return isEditable(el) || el.tagName === 'BUTTON' || el.tagName === 'A'
}

function createBox(bg: string, border: string) {
  const el = document.createElement('div')
  el.setAttribute(UI_ATTR, '')
  el.style.cssText = `position:fixed;display:none;pointer-events:none;z-index:2147483646;background:${bg};border:${border};border-radius:2px;`
  return el
}

function toRect(rect: DOMRect): Rect {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
}

function normalizeRect(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  }
}

/** Lander 의 소스 위치 대신 — React 개발 빌드의 fiber 를 거슬러 올라가 컴포넌트 이름을 모은다. 서버 컴포넌트는 _debugInfo 에 남는다. */
function componentChain(el: Element): string[] {
  const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'))
  let fiber = key ? (el as unknown as Record<string, unknown>)[key] : null
  const names: string[] = []
  const add = (name: unknown) => {
    if (typeof name === 'string' && name && !NEXT_INTERNAL.test(name) && !names.includes(name)) names.push(name)
  }
  while (fiber && names.length < 6) {
    const f = fiber as { type?: unknown; return?: unknown; _debugInfo?: { name?: unknown }[] | null }
    if (typeof f.type === 'function') {
      const type = f.type as { displayName?: string; name?: string }
      add(type.displayName ?? type.name)
    }
    for (const info of [...(f._debugInfo ?? [])].reverse()) add(info?.name)
    fiber = f.return
  }
  return names
}

function cropCanvas(src: HTMLCanvasElement, x: number, y: number, width: number, height: number) {
  const out = document.createElement('canvas')
  out.width = Math.max(1, Math.round(width))
  out.height = Math.max(1, Math.round(height))
  out.getContext('2d')!.drawImage(src, x, y, width, height, 0, 0, out.width, out.height)
  return out
}

function scaleCanvas(src: HTMLCanvasElement, ratio: number) {
  const out = document.createElement('canvas')
  out.width = Math.max(1, Math.round(src.width * ratio))
  out.height = Math.max(1, Math.round(src.height * ratio))
  out.getContext('2d')!.drawImage(src, 0, 0, out.width, out.height)
  return out
}

interface IdleWindow {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
}

/** 캡처는 메인 스레드를 길게 잡으므로 방금 띄운 UI가 먼저 그려지도록 유휴 시간까지 미룬다 */
function whenIdle(run: () => void, timeout = 500) {
  const idle = (window as unknown as IdleWindow).requestIdleCallback
  if (idle) idle.call(window, run, { timeout })
  else setTimeout(run, 0)
}

export function createInspector(callbacks: InspectorCallbacks) {
  let mode: WireMode = 'off'
  let nextNodeId = 1
  let nodeIds = new WeakMap<Element, number>()
  const idToNode = new Map<number, Element>()
  const idToSelector = new Map<number, string>()
  const trackedIds = new Set<number>()
  const lastRects = new Map<number, string>()
  let modeStyle: HTMLStyleElement | null = null
  let dragStart: Point | null = null
  let dragging = false
  let rectsQueued = false
  let fontEmbedCss: string | null = null
  let fontEmbedPending: Promise<string> | null = null
  let fontFamilyKey = ''

  const regionBox = createBox('rgba(59,130,246,0.08)', '1.5px dashed rgb(59,130,246)')
  document.body.append(regionBox)

  const intercepts = () => mode === 'feedback'

  function idFor(el: Element): number {
    let id = nodeIds.get(el)
    if (!id) {
      id = nextNodeId++
      nodeIds.set(el, id)
    }
    idToNode.set(id, el)
    return id
  }

  function resolve(nodeId: number): Element | null {
    const el = idToNode.get(nodeId)
    if (el?.isConnected) return el
    const selector = idToSelector.get(nodeId)
    if (!selector) return null
    try {
      const found = document.querySelector(selector)
      if (found) {
        nodeIds.set(found, nodeId)
        idToNode.set(nodeId, found)
        return found
      }
    } catch {
      // invalid selector, treat as stale
    }
    return null
  }

  function buildSelector(el: Element): string {
    if (el.id) return `#${CSS.escape(el.id)}`
    const parts: string[] = []
    let cur: Element | null = el
    while (cur && cur !== document.body && parts.length < 6) {
      if (cur.id) {
        parts.unshift(`#${CSS.escape(cur.id)}`)
        break
      }
      let part = cur.tagName.toLowerCase()
      const classes = [...cur.classList].slice(0, 2)
      if (classes.length) part += `.${classes.map((value) => CSS.escape(value)).join('.')}`
      const parent: Element | null = cur.parentElement
      if (parent) {
        const siblings = [...parent.children].filter((candidate) => candidate.tagName === cur!.tagName)
        if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(cur) + 1})`
      }
      parts.unshift(part)
      cur = parent
    }
    return parts.join(' > ')
  }

  function buildMeta(el: Element): ElementMeta {
    const nodeId = idFor(el)
    const selector = buildSelector(el)
    idToSelector.set(nodeId, selector)
    const style = window.getComputedStyle(el)
    const computed: Record<string, string> = {}
    for (const prop of COMPUTED_PROPS) computed[prop] = style[prop]
    const image = el instanceof HTMLImageElement
    return {
      nodeId,
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      classes: [...el.classList],
      selector,
      components: componentChain(el),
      text: (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 80),
      rect: toRect(el.getBoundingClientRect()),
      computed,
      ...(image ? { src: el.getAttribute('src') ?? undefined } : {}),
    }
  }

  function targetAt(x: number, y: number): Element | null {
    const el = document.elementFromPoint(x, y)
    if (!el || el === document.documentElement || el === document.body || inUi(el)) return null
    return el
  }

  function showBox(box: HTMLElement, rect: Rect) {
    box.style.display = 'block'
    box.style.left = `${rect.x}px`
    box.style.top = `${rect.y}px`
    box.style.width = `${rect.width}px`
    box.style.height = `${rect.height}px`
  }

  function elementsInRegion(rect: Rect): ElementMeta[] {
    const contained = [...document.body.querySelectorAll('*')].filter((el) => {
      if (inUi(el)) return false
      const candidate = el.getBoundingClientRect()
      if (candidate.width === 0 || candidate.height === 0) return false
      return (
        candidate.left >= rect.x - 1 &&
        candidate.top >= rect.y - 1 &&
        candidate.right <= rect.x + rect.width + 1 &&
        candidate.bottom <= rect.y + rect.height + 1
      )
    })
    const containedSet = new Set(contained)
    return contained
      .filter((el) => !el.parentElement || !containedSet.has(el.parentElement))
      .slice(0, 12)
      .map(buildMeta)
  }

  function onPointerMove(event: PointerEvent) {
    if (!intercepts()) return
    if (dragStart && (dragging || Math.hypot(event.clientX - dragStart.x, event.clientY - dragStart.y) > 4)) {
      dragging = true
      showBox(regionBox, normalizeRect(dragStart, { x: event.clientX, y: event.clientY }))
    }
  }

  function onPointerDown(event: PointerEvent) {
    if (!intercepts() || event.button !== 0 || inUi(event.target)) return
    event.preventDefault()
    event.stopPropagation()
    dragStart = { x: event.clientX, y: event.clientY }
    dragging = false
  }

  function onPointerUp(event: PointerEvent) {
    if (!intercepts() || !dragStart) return
    event.preventDefault()
    event.stopPropagation()
    const start = dragStart
    dragStart = null
    const point = { x: event.clientX, y: event.clientY }
    if (dragging) {
      dragging = false
      regionBox.style.display = 'none'
      const rect = normalizeRect(start, point)
      if (rect.width > 8 && rect.height > 8) {
        callbacks.onRegionSelect({ rect, elements: elementsInRegion(rect), point })
        return
      }
    }
    dragging = false
    regionBox.style.display = 'none'
    const el = targetAt(event.clientX, event.clientY)
    if (el) callbacks.onSelect(buildMeta(el), point)
  }

  function suppress(event: Event) {
    if (!intercepts() || inUi(event.target)) return
    event.preventDefault()
    event.stopPropagation()
  }

  /** Space를 누를 때마다 코멘트와 둘러보기를 오간다 (Lander 는 누르고 있는 동안만 둘러보기였다) */
  function onKeyDown(event: KeyboardEvent) {
    if (mode === 'off' || inUi(event.target)) return
    // 둘러보기 중의 Escape는 앱 몫이다 — 모달 닫기 등이 막히면 안 된다
    if (event.key === 'Escape' && mode !== 'browse') {
      event.preventDefault()
      event.stopPropagation()
      callbacks.onEscape()
      return
    }
    if (event.code !== 'Space' || skipsHoldKey(event.target)) return
    event.preventDefault()
    if (!event.repeat) callbacks.onToggleBrowse()
  }

  /**
   * 추적 중인 앵커 rect를 보고한다.
   * 스크롤·mutation마다 매 프레임 도는 경로라 직전 보고와 달라진 노드만 싣는다.
   */
  function reportRects() {
    if (trackedIds.size === 0) {
      lastRects.clear()
      return
    }
    const changed: Record<number, Rect | null> = {}
    let dirty = false
    for (const id of trackedIds) {
      const el = resolve(id)
      const rect = el ? toRect(el.getBoundingClientRect()) : null
      const key = rect ? `${rect.x},${rect.y},${rect.width},${rect.height}` : ''
      if (lastRects.get(id) === key) continue
      lastRects.set(id, key)
      changed[id] = rect
      dirty = true
    }
    for (const id of [...lastRects.keys()]) {
      if (!trackedIds.has(id)) lastRects.delete(id)
    }
    if (dirty) callbacks.onRects(changed)
  }

  function queueRects() {
    if (rectsQueued || trackedIds.size === 0) return
    rectsQueued = true
    requestAnimationFrame(() => {
      rectsQueued = false
      reportRects()
    })
  }

  /**
   * 폰트 임베드 CSS는 문서의 모든 스타일시트를 훑고 폰트 파일을 내려받아 base64로 만든다.
   * 캡처마다 반복하면 그때마다 메인 스레드가 멎으므로 문서당 한 번만 계산해 재사용한다.
   */
  function fontCss(): Promise<string> {
    const body = document.body
    const fontNodes = new Map<string, HTMLElement>()
    for (const node of [body, ...body.querySelectorAll<HTMLElement>('*')]) {
      if (inUi(node)) continue
      const family = window.getComputedStyle(node).fontFamily
      if (family && !fontNodes.has(family)) fontNodes.set(family, node)
    }
    const key = [...fontNodes.keys()].sort().join('|')
    if (key !== fontFamilyKey) {
      fontFamilyKey = key
      fontEmbedCss = null
      fontEmbedPending = null
    }
    if (fontEmbedCss !== null) return Promise.resolve(fontEmbedCss)
    if (!fontEmbedPending) {
      fontEmbedPending = Promise.all([...fontNodes.values()].map((node) => getFontEmbedCSS(node).catch(() => '')))
        .then((styles) => [...new Set(styles)].join('\n'))
        .then((css) => {
          if (key === fontFamilyKey) fontEmbedCss = css
          return css
        })
    }
    return fontEmbedPending
  }

  /** rect를 온전히 감싸는 가장 작은 요소 — 캡처 원본을 좁혀 문서 전체 복제를 피한다 */
  function enclosingElement(rect: Rect): HTMLElement | null {
    const body = document.body
    const start = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
    let el = start instanceof HTMLElement && !inUi(start) ? start : null
    while (el && el !== body) {
      const bounds = el.getBoundingClientRect()
      if (
        bounds.left <= rect.x + 1 &&
        bounds.top <= rect.y + 1 &&
        bounds.right >= rect.x + rect.width - 1 &&
        bounds.bottom >= rect.y + rect.height - 1
      ) {
        return el
      }
      el = el.parentElement
    }
    return body
  }

  const uiFilter = (node: HTMLElement) => !(node instanceof Element && node.hasAttribute?.(UI_ATTR))

  async function capture(target: CaptureTarget): Promise<string | null> {
    regionBox.style.display = 'none'
    try {
      const options = { pixelRatio: 1, backgroundColor: '#ffffff', fontEmbedCSS: await fontCss(), filter: uiFilter }
      let canvas: HTMLCanvasElement
      if (target.nodeId != null) {
        const el = resolve(target.nodeId)
        if (!(el instanceof HTMLElement)) throw new Error('stale node')
        canvas = await toCanvas(el, options)
      } else if (target.rect) {
        const rect = target.rect
        const source = enclosingElement(rect)
        if (!source) throw new Error('no capture source')
        const bounds = source.getBoundingClientRect()
        const full = await toCanvas(source, options)
        // 캔버스가 너무 크면 html-to-image가 자동 축소하므로 실제 배율로 잘라낸다
        const scale = bounds.width > 0 ? full.width / bounds.width : 1
        canvas = cropCanvas(
          full,
          (rect.x - bounds.x) * scale,
          (rect.y - bounds.y) * scale,
          rect.width * scale,
          rect.height * scale,
        )
      } else {
        throw new Error('nodeId or rect required')
      }
      if (canvas.width > MAX_CAPTURE_WIDTH) canvas = scaleCanvas(canvas, MAX_CAPTURE_WIDTH / canvas.width)
      return canvas.toDataURL('image/jpeg', 0.8)
    } catch {
      return null
    }
  }

  function applyModeStyle() {
    modeStyle?.remove()
    modeStyle = null
    if (!intercepts()) return
    modeStyle = document.createElement('style')
    modeStyle.dataset.devFeedback = 'mode'
    modeStyle.textContent = `:not([${UI_ATTR}], [${UI_ATTR}] *){cursor:crosshair!important;user-select:none!important}`
    document.head.append(modeStyle)
  }

  function setMode(next: WireMode) {
    mode = next
    dragStart = null
    dragging = false
    regionBox.style.display = 'none'
    applyModeStyle()
  }

  function track(nodes: TrackedNode[]) {
    trackedIds.clear()
    for (const { nodeId, selector } of nodes) {
      trackedIds.add(nodeId)
      idToSelector.set(nodeId, selector)
      if (nodeId >= nextNodeId) nextNodeId = nodeId + 1
    }
    reportRects()
  }

  window.addEventListener('pointermove', onPointerMove, true)
  window.addEventListener('pointerdown', onPointerDown, true)
  window.addEventListener('pointerup', onPointerUp, true)
  window.addEventListener('click', suppress, true)
  window.addEventListener('keydown', onKeyDown, true)
  window.addEventListener('scroll', queueRects, { capture: true, passive: true })
  window.addEventListener('resize', queueRects, { passive: true })
  const observer = new MutationObserver(queueRects)
  observer.observe(document.documentElement, { childList: true, subtree: true })
  // 첫 캡처가 폰트 수집까지 떠안지 않도록 미리 데워둔다
  whenIdle(() => void fontCss(), 5_000)

  function dispose() {
    window.removeEventListener('pointermove', onPointerMove, true)
    window.removeEventListener('pointerdown', onPointerDown, true)
    window.removeEventListener('pointerup', onPointerUp, true)
    window.removeEventListener('click', suppress, true)
    window.removeEventListener('keydown', onKeyDown, true)
    window.removeEventListener('scroll', queueRects, true)
    window.removeEventListener('resize', queueRects)
    observer.disconnect()
    modeStyle?.remove()
    regionBox.remove()
    nodeIds = new WeakMap()
  }

  return {
    setMode,
    track,
    capture: (target: CaptureTarget) =>
      new Promise<string | null>((done) => whenIdle(() => void capture(target).then(done))),
    dispose,
  }
}

export type Inspector = ReturnType<typeof createInspector>
