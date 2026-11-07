import type { ElementMeta, Point, Rect } from './inspector-protocol'

export type FeedbackTarget =
  | { kind: 'element'; meta: ElementMeta }
  | {
      kind: 'region'
      rect: Rect
      elements: ElementMeta[]
      anchorNodeId: number | null
    }

export interface FeedbackItem {
  id: string
  target: FeedbackTarget
  comment: string
  screenshot: string | null
  /** 사용자가 클릭한 지점 (버블 위치) */
  pin: Point
  /** 추적 기준 요소 rect 좌상단으로부터의 오프셋 — 스크롤 시 버블 위치 재계산용 */
  pinOffset: { dx: number; dy: number }
  /** region 타겟의 현재 표시 rect — 앵커 이동 시 갱신 */
  rect: Rect | null
  rectOffset: { dx: number; dy: number } | null
  stale: boolean
}

const MAX_IMAGES = 5
const MAX_REGION_ELEMENTS = 8

/** 수집된 피드백을 에이전트용 마크다운 + 첨부 이미지(data URL) 목록으로 직렬화 */
export function serializeFeedback(items: FeedbackItem[]): { message: string; images: string[] } {
  const images: string[] = []

  const sections = items.map((item, i) => {
    const lines: (string | null)[] = [`### ${i + 1}. "${item.comment}"`]

    if (item.target.kind === 'element') {
      const m = item.target.meta
      lines.push(
        `- Element: <${m.tag}>${m.text ? ` — "${m.text}"` : ''}`,
        m.classes.length ? `- Classes: ${m.classes.slice(0, 12).join(' ')}` : null,
        m.components.length ? `- Components: ${m.components.join(' < ')}` : null,
        `- Selector: ${m.selector}`,
      )
    } else {
      const { rect, elements } = item.target
      lines.push(`- Region: ${Math.round(rect.width)}×${Math.round(rect.height)}px selection`)
      if (elements.length) {
        lines.push(
          `- Elements in region:\n${elements
            .slice(0, MAX_REGION_ELEMENTS)
            .map(
              (m) =>
                `  - <${m.tag}>${m.text ? ` "${m.text.slice(0, 40)}"` : ''}${m.components[0] ? ` — ${m.components[0]}` : ''}`,
            )
            .join('\n')}`,
        )
      }
    }

    if (item.screenshot && images.length < MAX_IMAGES) {
      images.push(item.screenshot)
      lines.push(`- Screenshot: attached image #${images.length}`)
    }

    return lines.filter(Boolean).join('\n')
  })

  const message = [
    `## User visual feedback (${items.length} ${items.length === 1 ? 'item' : 'items'})`,
    '',
    'The user selected these elements directly in the live preview and left the comments below.',
    'Address every item. Use each Components chain to locate the JSX; confirm with the selector and text.',
    '',
    sections.join('\n\n'),
  ].join('\n')

  return { message, images }
}
