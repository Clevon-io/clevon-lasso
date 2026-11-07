'use client'

import { ChatCircleDots, CursorClick, type Icon } from '@phosphor-icons/react'
import { motion } from 'framer-motion'
import { EASE } from '../core/motion'

interface FeedbackModeBarProps {
  browsing: boolean
  onToggle: () => void
}

const MODES: { browse: boolean; label: string; Icon: Icon }[] = [
  { browse: false, label: '코멘트', Icon: ChatCircleDots },
  { browse: true, label: '둘러보기', Icon: CursorClick },
]

/** 피드백 툴 안에서 '코멘트 남기기'와 '앱 직접 조작'을 오간다 — Space로 전환 */
export function FeedbackModeBar({ browsing, onToggle }: FeedbackModeBarProps) {

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.2, ease: EASE }}
      className="glass pointer-events-auto mx-auto mt-3 flex w-fit items-center gap-0.5 rounded-full p-1"
    >
      {MODES.map(({ browse, label, Icon }) => {
        const active = browse === browsing
        return (
          <button
            key={label}
            onClick={(e) => {
              e.currentTarget.blur()
              if (!active) onToggle()
            }}
            aria-pressed={active}
            className="relative flex h-8 items-center rounded-full px-3.5 text-[13px] font-medium focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-zinc-900"
          >
            {active && (
              <motion.span
                layoutId="feedback-mode-indicator"
                transition={{ type: 'spring', stiffness: 460, damping: 36 }}
                className="absolute inset-0 rounded-full bg-white shadow-[0_1px_2px_rgb(24_24_27/0.10),0_4px_12px_-4px_rgb(24_24_27/0.18)]"
              />
            )}
            <span
              className={`relative z-10 flex items-center gap-1.5 transition-colors ${
                active ? 'text-zinc-900' : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              <Icon size={15} weight={active ? 'fill' : 'regular'} />
              {label}
            </span>
          </button>
        )
      })}
      <span className="mx-2 hidden text-[11px] text-zinc-400 sm:block">
        {'Space로 전환'}
      </span>
    </motion.div>
  )
}
