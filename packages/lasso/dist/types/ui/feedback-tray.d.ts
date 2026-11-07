import type { FeedbackItem } from '../core/feedback-format';
interface FeedbackTrayProps {
    open: boolean;
    items: FeedbackItem[];
    sending: boolean;
    onRemove: (id: string) => void;
    onSend: () => void;
    onClose: () => void;
}
export declare function FeedbackTray({ open, items, sending, onRemove, onSend, onClose, }: FeedbackTrayProps): import("react").JSX.Element;
export {};
