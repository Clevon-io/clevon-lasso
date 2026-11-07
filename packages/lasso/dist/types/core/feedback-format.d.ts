import type { ElementMeta, Point, Rect } from './inspector-protocol';
export type FeedbackTarget = {
    kind: 'element';
    meta: ElementMeta;
} | {
    kind: 'region';
    rect: Rect;
    elements: ElementMeta[];
    anchorNodeId: number | null;
};
export interface FeedbackItem {
    id: string;
    target: FeedbackTarget;
    comment: string;
    screenshot: string | null;
    /** 사용자가 클릭한 지점 (버블 위치) */
    pin: Point;
    /** 추적 기준 요소 rect 좌상단으로부터의 오프셋 — 스크롤 시 버블 위치 재계산용 */
    pinOffset: {
        dx: number;
        dy: number;
    };
    /** region 타겟의 현재 표시 rect — 앵커 이동 시 갱신 */
    rect: Rect | null;
    rectOffset: {
        dx: number;
        dy: number;
    } | null;
    stale: boolean;
}
/** 수집된 피드백을 에이전트용 마크다운 + 첨부 이미지(data URL) 목록으로 직렬화 */
export declare function serializeFeedback(items: FeedbackItem[]): {
    message: string;
    images: string[];
};
