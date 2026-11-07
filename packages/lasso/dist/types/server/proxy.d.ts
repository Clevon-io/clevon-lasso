import http from 'node:http';
import { type Inbox } from './inbox';
export interface ProxyOptions {
    /** 원래 개발 서버 포트 */
    target: number;
    targetHost?: string;
    /** 중계 서버가 열 포트 */
    listen: number;
    inbox: Inbox;
    /** 브라우저 도구 스크립트(client.js) 본문 */
    clientJs: () => string;
}
export declare function startProxy(options: ProxyOptions): Promise<http.Server<typeof http.IncomingMessage, typeof http.ServerResponse>>;
