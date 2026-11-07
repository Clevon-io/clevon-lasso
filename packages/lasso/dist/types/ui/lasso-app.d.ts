import type { LassoPayload } from '../core/payload';
export declare function LassoApp({ send }: {
    send: (payload: LassoPayload) => Promise<boolean>;
}): import("react").JSX.Element;
