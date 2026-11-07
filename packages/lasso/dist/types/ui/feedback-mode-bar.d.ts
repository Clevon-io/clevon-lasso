interface FeedbackModeBarProps {
    browsing: boolean;
    onToggle: () => void;
}
/** 피드백 툴 안에서 '코멘트 남기기'와 '앱 직접 조작'을 오간다 — Space로 전환 */
export declare function FeedbackModeBar({ browsing, onToggle }: FeedbackModeBarProps): import("react").JSX.Element;
export {};
