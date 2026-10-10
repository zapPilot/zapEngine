export const en = {
  'dock.review': 'Fund {amount}',
  'dock.checkpoint': 'Next batch · {amount}',
  'dock.agent': 'Agent authorization · {amount}',
  'dock.checked': 'Checked',
  'dock.recheck': 'Re-check',
  'dock.authorize': 'Authorization needed',
  'dock.open': 'Review & sign',
} as const;
export const zhHant = {
  'dock.review': '投入 {amount}',
  'dock.checkpoint': '下一批次 · {amount}',
  'dock.agent': 'Agent 授權 · {amount}',
  'dock.checked': '已檢查',
  'dock.recheck': '重新檢查',
  'dock.authorize': '需要授權',
  'dock.open': '檢查並簽名',
} satisfies Record<keyof typeof en, string>;
export const ja = {
  'dock.review': '入金 {amount}',
  'dock.checkpoint': '次のバッチ · {amount}',
  'dock.agent': 'エージェント承認 · {amount}',
  'dock.checked': '確認済み',
  'dock.recheck': '再確認',
  'dock.authorize': '承認が必要',
  'dock.open': '確認して署名',
} satisfies Record<keyof typeof en, string>;
