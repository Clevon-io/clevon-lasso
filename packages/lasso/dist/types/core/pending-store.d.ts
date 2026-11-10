import type { FeedbackItem } from './feedback-format';
import type { FeedbackDraft } from '../hooks/use-feedback';
export interface SavedDraft {
    draft: FeedbackDraft;
    text: string;
}
export declare function loadItems(): FeedbackItem[];
export declare function saveItems(items: FeedbackItem[]): undefined;
export declare function loadDraft(): SavedDraft | null;
export declare function saveDraft(saved: SavedDraft | null): void;
