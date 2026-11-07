'use client'

import { AnimatePresence, MotionConfig } from 'framer-motion'
import { useCallback, useEffect, useState } from 'react'

import { useFeedback } from '../hooks/use-feedback'
import { useInspector } from '../hooks/use-inspector'
import { UI_ATTR } from '../core/inspector-protocol'
import { FeedbackModeBar } from './feedback-mode-bar'
import { FeedbackOverlay } from './feedback-overlay'
import { FeedbackTray } from './feedback-tray'

import type { LassoPayload } from '../core/payload'

export function LassoApp({ send }: { send: (payload: LassoPayload) => Promise<boolean> }) {
  const [sending, setSending] = useState(false)

  const inspector = useInspector({
    onSelect: (meta, point) => {
      if (inspector.tool === 'feedback') feedback.beginElementDraft(meta, point)
    },
    onRegionSelect: (region) => {
      if (inspector.tool === 'feedback') feedback.beginRegionDraft(region)
    },
    onRects: (rects) => feedback.updateRects(rects),
    // 툴은 늘 켜져 있으므로 Esc 는 작성 중인 코멘트만 거둔다
    onEscape: () => feedback.cancelDraft(),
  })
  const feedback = useFeedback(inspector)

  // 둘러보기로 넘어가면 쓰던 코멘트는 거둔다
  useEffect(() => {
    if (inspector.browsing) feedback.cancelDraft()
  }, [inspector.browsing, feedback.cancelDraft])

  const handleSendFeedback = useCallback(async () => {
    if (feedback.items.length === 0 || sending) return
    const { message, images } = feedback.serialize()
    setSending(true)
    const ok = await send({
      message,
      images,
      page: location.pathname + location.search + location.hash,
      url: location.href,
      viewport: { width: innerWidth, height: innerHeight },
    }).catch(() => false)
    setSending(false)
    if (ok) feedback.clear()
  }, [feedback, sending, send])

  return (
    <MotionConfig reducedMotion="user">
      <div {...{ [UI_ATTR]: '' }} className="lasso-root">
        <FeedbackOverlay
          items={feedback.items}
          draft={feedback.draft}
          markers={feedback.markers}
          browsing={inspector.browsing}
          onSaveDraft={feedback.saveDraft}
          onCancelDraft={feedback.cancelDraft}
        />

        <div className="pointer-events-none fixed inset-0 z-[2147483641] flex flex-col items-center justify-end px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className="w-[min(640px,100%)]">
            <AnimatePresence>
              {inspector.tool === 'feedback' && (
                <FeedbackModeBar
                  key="feedback-mode"
                  browsing={inspector.browsing}
                  onToggle={inspector.toggleBrowse}
                />
              )}
            </AnimatePresence>
          </div>
        </div>

        <FeedbackTray
          open={!inspector.browsing && feedback.items.length > 0}
          items={feedback.items}
          sending={sending}
          onRemove={feedback.removeItem}
          onSend={() => void handleSendFeedback()}
          onClose={inspector.toggleBrowse}
        />
      </div>
    </MotionConfig>
  )
}
