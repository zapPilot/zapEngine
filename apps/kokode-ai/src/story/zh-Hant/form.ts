import type { CopyShape, InterestId } from '../types';
import type * as Japanese from '../ja/form';
// Contact form copy. src/waitlist.ts imports this file directly (not the
// barrel) so the page script never bundles the rest of the story.

/**
 * Options of "試したい業務". The value sent to genba-lead is the label itself
 * (the column holds ≤120 characters); the id is for links and `?interest=`.
 */
export const INTEREST: readonly {
  readonly id: InterestId;
  readonly label: string;
}[] = [
  { id: 'referral', label: '轉診信／摘要撰寫' },
  { id: 'search', label: '院內文件搜尋／摘要' },
  { id: 'materials', label: '說明資料／解剖圖製作' },
  { id: 'voice', label: '從語音撰寫文件' },
  { id: 'other', label: '其他／尚未決定' },
  { id: 'partner', label: '洽詢銷售合作' },
] as const;

export type { InterestId } from '../types';

export const FORM: CopyShape<typeof Japanese.FORM> = {
  interestLabel: '想試行的工作',
  interestPlaceholder: '請選擇一項',
  organization: '機構／公司名稱（選填）',
  name: '姓名（選填）',
  email: '電子郵件',
  emailPlaceholder: 'you@example.jp',
  submit: '申請洽詢',
  submitting: '傳送中…',
  noscript: '傳送表單需要 JavaScript，請啟用後再試。',
  note: '您填寫的資料將用於 KOKODE 試行及導入的洽詢與說明。請勿傳送患者或診療資料等機密資訊。',
  privacy: '隱私政策（日文）',
  contactLead: '洽詢／支援：',
  messages: {
    success: '已傳送，負責人將與您聯繫。',
    notConfigured: '謝謝，表單受理端正在準備上線。',
    retry: '無法傳送，填寫內容已保存，連線恢復後將自動重送。',
    invalidEmail: '請確認填寫內容，電子郵件地址可能有誤。',
    invalidInterest: '請選擇想試行的工作。',
  },
} as const;
