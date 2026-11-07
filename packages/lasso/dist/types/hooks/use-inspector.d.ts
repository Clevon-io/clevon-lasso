import { type CaptureTarget, type ElementMeta, type InspectorTool, type Point, type Rect, type RegionSelection, type TrackedNode } from '../core/inspector-protocol';
export interface InspectorHandlers {
    onSelect?: (meta: ElementMeta, point?: Point) => void;
    onRegionSelect?: (region: RegionSelection) => void;
    onRects?: (rects: Record<number, Rect | null>) => void;
    onEscape?: () => void;
}
/**
 * Clevon Lander hooks/useInspector.ts 의 툴 상태·둘러보기 전환을 그대로 두고,
 * iframe 과의 postMessage 브리지 대신 같은 문서의 검사기를 직접 부른다.
 */
export declare function useInspector(handlers: InspectorHandlers): {
    connected: boolean;
    tool: InspectorTool;
    setTool: (next: InspectorTool) => void;
    browsing: boolean;
    toggleBrowse: () => void;
    track: (scope: string, nodes: TrackedNode[]) => void;
    capture: (target: CaptureTarget) => Promise<string | null>;
};
