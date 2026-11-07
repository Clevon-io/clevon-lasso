import { createRoot } from 'react-dom/client'

import type { LassoPayload } from './core/payload'
import { UI_ATTR } from './core/inspector-protocol'
import { LassoApp } from './ui/lasso-app'
import css from './ui/styles.css'

export type { LassoPayload }

export interface LassoOptions {
  /** 피드백을 받을 주소. onSend 를 주지 않으면 여기로 JSON 을 POST 한다. */
  endpoint?: string
  /** 직접 보내려면 이걸 준다. false 를 돌려주면 모은 코멘트를 지우지 않는다. */
  onSend?: (payload: LassoPayload) => Promise<boolean | void> | boolean | void
}

export interface LassoHandle {
  unmount: () => void
}

const GLOBAL_KEY = '__clevonLasso'
type Holder = { [GLOBAL_KEY]?: LassoHandle }

/* Shadow DOM 안의 @property 는 등록되지 않아 Tailwind 그림자·변형 변수가 비어 버린다. 문서에 따로 건다. */
function hoistProperties() {
  if (document.getElementById('clevon-lasso-properties')) return
  const rules = css.match(/@property[^{]+\{[^}]*\}/g)
  if (!rules) return
  const style = document.createElement('style')
  style.id = 'clevon-lasso-properties'
  style.textContent = rules.join('\n')
  document.head.append(style)
}

export function mountLasso(options: LassoOptions = {}): LassoHandle {
  const holder = window as unknown as Holder
  holder[GLOBAL_KEY]?.unmount()

  const send = async (payload: LassoPayload) => {
    if (options.onSend) return (await options.onSend(payload)) !== false
    if (!options.endpoint) throw new Error('mountLasso: endpoint 나 onSend 중 하나는 있어야 합니다.')
    const res = await fetch(options.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return res.ok
  }

  hoistProperties()
  const host = document.createElement('clevon-lasso')
  host.setAttribute(UI_ATTR, '')
  host.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;'
  const shadow = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = css
  const container = document.createElement('div')
  shadow.append(style, container)
  document.body.append(host)

  const root = createRoot(container)
  root.render(<LassoApp send={send} />)

  const handle: LassoHandle = {
    unmount: () => {
      root.unmount()
      host.remove()
      if (holder[GLOBAL_KEY] === handle) delete holder[GLOBAL_KEY]
    },
  }
  holder[GLOBAL_KEY] = handle
  return handle
}
