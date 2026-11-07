'use client'

import { ChatCircleDots, PaperPlaneRight, X } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'framer-motion'
import type { FeedbackItem } from '../core/feedback-format'
import { UI_ATTR } from '../core/inspector-protocol'

interface FeedbackTrayProps {
  open: boolean
  items: FeedbackItem[]
  sending: boolean
  onRemove: (id: string) => void
  onSend: () => void
  onClose: () => void
}

export function FeedbackTray({
  open,
  items,
  sending,
  onRemove,
  onSend,
  onClose,
}: FeedbackTrayProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.98 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          {...{ [UI_ATTR]: '' }}
          className="glass fixed right-4 top-16 z-[2147483641] flex max-h-[min(440px,55dvh)] w-[min(340px,calc(100vw-2rem))] origin-top-right flex-col overflow-hidden rounded-[16px]"
        >
          <div className="flex items-center gap-2 border-b border-zinc-900/5 px-4 py-2.5">
            <ChatCircleDots size={14} className="text-zinc-400" />
            <span className="text-xs font-medium text-zinc-700">{'피드백'}</span>
            <span className="font-mono text-[11px] text-zinc-400">
              {items.length}건
            </span>
            <button
              onClick={onClose}
              aria-label={'피드백 모드 종료'}
              className="ml-auto flex size-6 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-900/5 hover:text-zinc-600"
            >
              <X size={12} weight="bold" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-2 py-2">
            {items.map((item, i) => (
              <div
                key={item.id}
                className="group flex items-start gap-2.5 rounded-[12px] px-2 py-2 hover:bg-zinc-900/[0.03]"
              >
                <span
                  className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white ${
                    item.stale ? 'bg-zinc-400' : 'bg-blue-500'
                  }`}
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-[13px] leading-5 text-zinc-900">{item.comment}</p>
                  <p className="mt-0.5 truncate text-[11px] text-zinc-400">
                    {targetSummary(item)}
                  </p>
                </div>
                <button
                  onClick={() => onRemove(item.id)}
                  aria-label={'피드백 삭제'}
                  className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-zinc-300 opacity-0 transition-all hover:bg-zinc-900/5 hover:text-zinc-600 group-hover:opacity-100"
                >
                  <X size={11} weight="bold" />
                </button>
              </div>
            ))}
          </div>

          <div className="border-t border-zinc-900/5 p-2.5">
            <button
              onClick={onSend}
              disabled={items.length === 0 || sending}
              className="flex h-9 w-full items-center justify-center gap-1.5 rounded-full bg-zinc-900 text-[13px] font-medium text-white transition-transform active:scale-[0.98] disabled:opacity-25 disabled:active:scale-100"
            >
              <PaperPlaneRight size={13} weight="fill" />
              {items.length}건 보내기
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function targetSummary(item: FeedbackItem): string {
  if (item.target.kind === 'element') {
    const m = item.target.meta
    return `<${m.tag}>${m.text ? ` ${m.text.slice(0, 40)}` : ''}`
  }
  const { rect, elements } = item.target
  return `영역 ${Math.round(rect.width)}×${Math.round(rect.height)} · 요소 ${elements.length}개`
}
