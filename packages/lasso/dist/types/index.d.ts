import type { LassoPayload } from './core/payload';
export type { LassoPayload };
export interface LassoOptions {
    /** 피드백을 받을 주소. onSend 를 주지 않으면 여기로 JSON 을 POST 한다. */
    endpoint?: string;
    /** 직접 보내려면 이걸 준다. false 를 돌려주면 모은 코멘트를 지우지 않는다. */
    onSend?: (payload: LassoPayload) => Promise<boolean | void> | boolean | void;
}
export interface LassoHandle {
    unmount: () => void;
}
export declare function mountLasso(options?: LassoOptions): LassoHandle;
