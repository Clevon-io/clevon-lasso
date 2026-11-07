import type { FeedbackDraft } from '../hooks/use-feedback';
import type { FeedbackItem } from '../core/feedback-format';
import { type MarkerStore } from '../core/marker-store';
interface FeedbackOverlayProps {
    items: FeedbackItem[];
    draft: FeedbackDraft | null;
    markers: MarkerStore;
    /** 둘러보기 중에는 마커가 앱 클릭을 가로막지 않도록 비활성화한다 */
    browsing?: boolean;
    onSaveDraft: (comment: string) => void;
    onCancelDraft: () => void;
}
declare function FeedbackOverlayImpl({ items, draft, markers, browsing, onSaveDraft, onCancelDraft, }: FeedbackOverlayProps): import("react").JSX.Element;
export declare const FeedbackOverlay: import("react").MemoExoticComponent<typeof FeedbackOverlayImpl>;
export {};
