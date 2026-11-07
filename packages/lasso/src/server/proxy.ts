import http from 'node:http'
import net from 'node:net'

import { handleFeedbackRequest, type Inbox } from './inbox'

export interface ProxyOptions {
  /** 원래 개발 서버 포트 */
  target: number
  targetHost?: string
  /** 중계 서버가 열 포트 */
  listen: number
  inbox: Inbox
  /** 브라우저 도구 스크립트(client.js) 본문 */
  clientJs: () => string
}

const TAG = Buffer.from('<script src="/__lasso/client.js" async></script>')

function inject(upstream: http.IncomingMessage, res: http.ServerResponse) {
  let pending: Buffer | null = Buffer.alloc(0)
  upstream.on('data', (chunk: Buffer) => {
    if (!pending) return void res.write(chunk)
    pending = Buffer.concat([pending, chunk])
    const head = pending.indexOf('<head')
    const close = head < 0 ? -1 : pending.indexOf('>', head)
    if (close < 0) return
    res.write(Buffer.concat([pending.subarray(0, close + 1), TAG, pending.subarray(close + 1)]))
    pending = null
  })
  upstream.on('end', () => {
    if (pending) res.write(Buffer.concat([pending, TAG]))
    res.end()
  })
}

export function startProxy(options: ProxyOptions) {
  const targetHost = options.targetHost ?? 'localhost'
  const targetOrigin = `http://${targetHost}:${options.target}`
  const selfOrigin = `http://localhost:${options.listen}`

  const server = http.createServer((req, res) => {
    const url = req.url ?? '/'
    if (url.startsWith('/__lasso/')) {
      if (url.startsWith('/__lasso/client.js')) {
        res.writeHead(200, {
          'Content-Type': 'text/javascript; charset=utf-8',
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*',
        })
        res.end(options.clientJs())
        return
      }
      if (url.startsWith('/__lasso/feedback')) return void handleFeedbackRequest(req, res, options.inbox)
      res.writeHead(404).end()
      return
    }

    const headers = { ...req.headers, 'accept-encoding': 'identity', 'x-forwarded-host': req.headers.host ?? '' }
    const upstreamReq = http.request(
      { host: targetHost, port: options.target, method: req.method, path: url, headers },
      (upstream) => {
        const out = { ...upstream.headers }
        if (typeof out.location === 'string' && out.location.startsWith(targetOrigin)) {
          out.location = selfOrigin + out.location.slice(targetOrigin.length)
        }
        const isHtml = String(out['content-type'] ?? '').includes('text/html') && req.method !== 'HEAD'
        if (!isHtml) {
          res.writeHead(upstream.statusCode ?? 502, out)
          upstream.pipe(res)
          return
        }
        delete out['content-length']
        delete out['content-security-policy']
        res.writeHead(upstream.statusCode ?? 502, out)
        inject(upstream, res)
      },
    )
    upstreamReq.on('error', (error) => {
      if (res.headersSent) return void res.destroy()
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end(`Lasso: ${targetOrigin} 에 연결하지 못했습니다. 개발 서버가 켜져 있는지 확인하세요.\n${error.message}`)
    })
    req.pipe(upstreamReq)
  })

  // HMR 같은 WebSocket 연결은 그대로 이어 준다
  server.on('upgrade', (req, socket, head) => {
    const upstream = net.connect(options.target, targetHost, () => {
      const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`]
      for (let i = 0; i < req.rawHeaders.length; i += 2) lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`)
      upstream.write(`${lines.join('\r\n')}\r\n\r\n`)
      if (head.length) upstream.write(head)
      upstream.pipe(socket)
      socket.pipe(upstream)
    })
    const close = () => {
      upstream.destroy()
      socket.destroy()
    }
    upstream.on('error', close)
    socket.on('error', close)
  })

  return new Promise<http.Server>((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.listen, () => resolve(server))
  })
}
