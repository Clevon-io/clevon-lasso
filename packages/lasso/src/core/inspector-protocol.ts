/* Clevon Lander packages/workspace/.../lib/inspector-protocol.ts 에서 피드백 툴이 쓰는 부분만 옮겼다. */

export type InspectorTool = 'off' | 'feedback'

/** 'browse'는 피드백 툴을 켠 채 클릭을 앱으로 흘려보내는 상태다. */
export type WireMode = 'off' | 'feedback' | 'browse'

export function toWireMode(tool: InspectorTool, browsing = false): WireMode {
  if (tool === 'off') return 'off'
  return browsing ? 'browse' : 'feedback'
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface CaptureTarget {
  nodeId?: number
  rect?: Rect
}

export interface Point {
  x: number
  y: number
}

export interface ElementMeta {
  nodeId: number
  tag: string
  id: string | null
  classes: string[]
  selector: string
  /** Lander 는 빌드 플러그인이 박은 소스 위치를 싣는다. Next 에서는 그 대신 React 컴포넌트 이름을 싣는다. */
  components: string[]
  text: string
  rect: Rect
  computed: Record<string, string>
  src?: string
}

export interface RegionSelection {
  rect: Rect
  elements: ElementMeta[]
  point?: Point
}

/** 위치 추적 대상 — selector는 라우트 복귀 후 재바인딩에 쓰인다 */
export interface TrackedNode {
  nodeId: number
  selector: string
}

/** 피드백 UI 자신은 검사 대상에서 뺀다. Lander 는 UI 가 iframe 바깥에 있어 이 구분이 필요 없었다. */
export const UI_ATTR = 'data-lasso-ui'
