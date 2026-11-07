import { mountLasso } from './index'

/* <script src=".../__lasso/client.js"> 로 실린 경우: 스크립트가 온 서버로 보낸다. 화면이 하이드레이션을 마친 뒤에 붙인다. */
const script = document.currentScript as HTMLScriptElement | null
const origin = script?.src ? new URL(script.src).origin : location.origin
const start = () => mountLasso({ endpoint: `${origin}/__lasso/feedback` })

if (document.readyState === 'complete') start()
else window.addEventListener('load', start, { once: true })
