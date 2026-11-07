import { useCallback, useEffect, useRef, useState } from 'react'

import { createInspector, type Inspector } from '../core/inspector'
import {
  toWireMode,
  type CaptureTarget,
  type ElementMeta,
  type InspectorTool,
  type Point,
  type Rect,
  type RegionSelection,
  type TrackedNode,
} from '../core/inspector-protocol'

export interface InspectorHandlers {
  onSelect?: (meta: ElementMeta, point?: Point) => void
  onRegionSelect?: (region: RegionSelection) => void
  onRects?: (rects: Record<number, Rect | null>) => void
  onEscape?: () => void
}

/**
 * Clevon Lander hooks/useInspector.ts 의 툴 상태·둘러보기 전환을 그대로 두고,
 * iframe 과의 postMessage 브리지 대신 같은 문서의 검사기를 직접 부른다.
 */
export function useInspector(handlers: InspectorHandlers) {
  const [connected, setConnected] = useState(false)
  const [tool, setToolState] = useState<InspectorTool>('feedback')
  const [browseSticky, setBrowseSticky] = useState(false)
  const browsing = tool === 'feedback' && browseSticky
  const wireMode = toWireMode(tool, browsing)
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers
  const inspectorRef = useRef<Inspector | null>(null)
  const trackedScopes = useRef(new Map<string, TrackedNode[]>())

  useEffect(() => {
    const inspector = createInspector({
      onSelect: (meta, point) => handlersRef.current.onSelect?.(meta, point),
      onRegionSelect: (region) => handlersRef.current.onRegionSelect?.(region),
      onRects: (rects) => handlersRef.current.onRects?.(rects),
      onEscape: () => handlersRef.current.onEscape?.(),
      onToggleBrowse: () => setBrowseSticky((v) => !v),
    })
    inspectorRef.current = inspector
    setConnected(true)
    return () => {
      inspector.dispose()
      inspectorRef.current = null
      setConnected(false)
    }
  }, [])

  const setTool = useCallback((next: InspectorTool) => {
    setToolState(next)
    setBrowseSticky(false)
  }, [])

  const toggleBrowse = useCallback(() => setBrowseSticky((v) => !v), [])

  useEffect(() => {
    inspectorRef.current?.setMode(wireMode)
  }, [wireMode, connected])

  const track = useCallback((scope: string, nodes: TrackedNode[]) => {
    trackedScopes.current.set(scope, nodes)
    const combined = new Map<number, TrackedNode>()
    for (const scopedNodes of trackedScopes.current.values()) {
      for (const node of scopedNodes) combined.set(node.nodeId, node)
    }
    inspectorRef.current?.track([...combined.values()])
  }, [])

  const capture = useCallback(
    (target: CaptureTarget) => inspectorRef.current?.capture(target) ?? Promise.resolve(null),
    [],
  )

  return { connected, tool, setTool, browsing, toggleBrowse, track, capture }
}
