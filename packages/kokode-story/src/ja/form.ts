// Contact form copy. src/waitlist.ts imports this file directly (not the
// barrel) so the page script never bundles the rest of the story.

/**
 * Options of "試したい業務". The value sent to genba-lead is the label itself
 * (the column holds ≤120 characters); the id is for links and `?interest=`.
 */
export const INTEREST = [
  { id: 'referral', label: '紹介状・サマリー作成' },
  { id: 'search', label: '院内文書の検索・要約' },
  { id: 'materials', label: '説明資料・解剖図の作成' },
  { id: 'voice', label: '音声から文書作成' },
  { id: 'other', label: 'その他・まだ決めていない' },
  { id: 'partner', label: '販売パートナーとして相談' },
] as const;

export type { InterestId } from '../types.js';

export const FORM = {
  interestLabel: '試したい業務',
  interestPlaceholder: '1つ選んでください',
  organization: '施設名・会社名（任意）',
  name: 'お名前（任意）',
  email: 'メールアドレス',
  emailPlaceholder: 'you@example.jp',
  submit: '相談を申し込む',
  submitting: '送信中…',
  noscript:
    'フォームの送信にはJavaScriptが必要です。有効にしてから、もう一度お試しください。',
  note: 'ご入力の内容は、KOKODEのパイロットと導入のご相談・ご案内のために利用します。患者情報・診療情報などの機密情報は送信しないでください。',
  privacy: 'プライバシーポリシー',
  contactLead: 'ご相談・サポート：',
  messages: {
    success: '送信しました。担当者からご連絡します。',
    notConfigured: 'ありがとうございます。フォーム受付先の公開準備中です。',
    retry:
      '送信できませんでした。入力内容は保存されており、接続の回復後に自動で再送します。',
    invalidEmail:
      '入力内容をご確認ください。メールアドレスが正しくない可能性があります。',
    invalidInterest: '試したい業務を選択してください。',
  },
} as const;
