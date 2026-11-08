import type { IncomingMessage, ServerResponse } from 'node:http';
import type { LassoPayload } from '../core/payload';
export interface InboxEntry {
    id: string;
    at: string;
    page: string | null;
    url: string | null;
    viewport: {
        width: number;
        height: number;
    } | null;
    /** 저장된 이미지 파일의 절대 경로 */
    images: string[];
    message: string;
}
/** 프로젝트 폴더마다 홈 아래 따로 둔다. 프로젝트 안에는 아무것도 만들지 않는다. */
export declare function defaultInboxDir(projectDir?: string): string;
export declare function createInbox(dir: string): {
    dir: string;
    file: string;
    append: (payload: Partial<LassoPayload>) => Promise<InboxEntry>;
    readAll: () => InboxEntry[];
    takeUnread: () => Promise<InboxEntry[]>;
    hasUnread: () => Promise<boolean>;
    touch: () => Promise<void>;
    lastActivity: () => Promise<number | null>;
};
export type Inbox = ReturnType<typeof createInbox>;
/** Node http 서버에 붙이는 수신 처리. 처리했으면 true. */
export declare function handleFeedbackRequest(req: IncomingMessage, res: ServerResponse, inbox: Inbox): Promise<boolean>;
export declare function formatEntry(entry: InboxEntry): string;
