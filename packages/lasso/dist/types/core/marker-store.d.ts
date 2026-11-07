import type { Point, Rect } from './inspector-protocol';
/** 마커의 현재 화면 좌표 — 스크롤·레이아웃 변화마다 갱신된다 */
export interface Placement {
    pin: Point;
    rect: Rect | null;
}
type Listener = (placement: Placement) => void;
/** 작성 중인 초안은 항상 하나뿐이라 고정 키를 쓴다 */
export declare const DRAFT_KEY = "__draft";
/**
 * 마커 좌표를 React 상태 밖에 둔다.
 * 스크롤 한 번에 프레임마다 좌표가 바뀌는데 이걸 상태로 올리면 갱신마다 화면 트리 전체가
 * 리렌더돼 마커가 앱보다 여러 프레임 뒤처진다. 구독자는 좌표를 받아 DOM transform만 직접 쓴다.
 */
export declare class MarkerStore {
    private placements;
    private listeners;
    read(id: string): Placement | null;
    write(id: string, placement: Placement): void;
    forget(id: string): void;
    subscribe(id: string, notify: Listener): () => void;
}
export {};
