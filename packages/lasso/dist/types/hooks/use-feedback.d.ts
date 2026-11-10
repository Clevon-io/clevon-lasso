import { type FeedbackItem, type FeedbackTarget } from '../core/feedback-format';
import type { ElementMeta, Point, Rect, RegionSelection, TrackedNode } from '../core/inspector-protocol';
import { MarkerStore } from '../core/marker-store';
interface Offset {
    dx: number;
    dy: number;
}
export interface FeedbackDraft {
    target: FeedbackTarget;
    /** 생성 시점의 클릭 지점 — 이후 실시간 좌표는 MarkerStore가 갖는다 */
    point: Point;
    pointOffset: Offset;
    rect: Rect | null;
    rectOffset: Offset | null;
}
interface InspectorApi {
    connected: boolean;
    track: (scope: string, nodes: TrackedNode[]) => void;
    capture: (target: {
        nodeId?: number;
        rect?: Rect;
    }) => Promise<string | null>;
}
/** 피드백 버블 수집 상태 — 클릭 지점 선택 → 코멘트 초안 → 항목 축적 → 직렬화 */
export declare function useFeedback(inspector: InspectorApi): {
    items: FeedbackItem[];
    draft: FeedbackDraft | null;
    draftText: string;
    setDraftText: (text: string) => void;
    markers: MarkerStore;
    beginElementDraft: (meta: ElementMeta, point?: Point) => void;
    beginRegionDraft: (region: RegionSelection) => void;
    cancelDraft: () => void;
    saveDraft: (comment: string) => void;
    removeItem: (id: string) => void;
    updateRects: (rects: Record<number, Rect | null>) => void;
    clear: () => void;
    serialize: () => {
        message: string;
        images: string[];
    };
};
export {};
