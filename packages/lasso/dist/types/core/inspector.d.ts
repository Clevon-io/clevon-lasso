import { type CaptureTarget, type ElementMeta, type Point, type Rect, type RegionSelection, type TrackedNode, type WireMode } from './inspector-protocol';
export interface InspectorCallbacks {
    onSelect: (meta: ElementMeta, point: Point) => void;
    onRegionSelect: (region: RegionSelection) => void;
    onRects: (rects: Record<number, Rect | null>) => void;
    onEscape: () => void;
    onToggleBrowse: () => void;
}
export declare function createInspector(callbacks: InspectorCallbacks): {
    setMode: (next: WireMode) => void;
    track: (nodes: TrackedNode[]) => void;
    capture: (target: CaptureTarget) => Promise<string | null>;
    dispose: () => void;
};
export type Inspector = ReturnType<typeof createInspector>;
