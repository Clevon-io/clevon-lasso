export interface LassoPayload {
    /** 코멘트들을 마크다운으로 묶은 본문 */
    message: string;
    /** 코멘트마다 찍은 화면 조각, JPEG data URL */
    images: string[];
    page: string;
    url: string;
    viewport: {
        width: number;
        height: number;
    };
}
