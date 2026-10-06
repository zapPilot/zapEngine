import type { CopyShape } from '../types.js';
import type * as Japanese from '../ja/figures.js';
// Labels of the diagrams. They are real text on every surface (HTML and
// film), never baked into an image, so they stay searchable and reviewable.
export const FIGURES: CopyShape<typeof Japanese.FIGURES> = {
  hardware: {
    caption: '依設施規模配置的設備示意',
    sizes: [
      {
        label: '小型診所',
        note: '先從這裡開始',
        alt: '設置於院內的小型設備示意',
      },
      { label: '中型設施', note: '個別洽談', alt: '機架式伺服器設備示意' },
      {
        label: '醫院與研究機構',
        note: '個別洽談',
        alt: '多台伺服器機櫃的配置示意',
      },
    ],
  },
  beforeAfter: {
    caption: '患者資料的去向：雲端 AI 與 KOKODE',
    inside: '院內',
    before: {
      label: '過去',
      steps: ['患者資料', '雲端 AI', '疑慮／限制'],
    },
    after: {
      label: 'KOKODE',
      steps: ['患者資料', 'KOKODE', '院內 AI'],
    },
  },
  boundary: {
    caption: '只有連接院內授權網路並登入的裝置能連接 KOKODE',
    inside: '院內',
    network: '員工網路',
    devices: ['PC', '平板'],
    login: '登入',
    server: 'KOKODE',
    guest: '患者用 Wi-Fi',
    outside: '院外',
    blocked: '無法連線',
  },
  turnkey: {
    caption: 'KOKODE 整套導入的內容',
    layers: [
      { title: '聊天介面', text: '員工透過瀏覽器使用' },
      { title: '代理', text: '配合工作的流程' },
      { title: '院內知識', text: '文件、對話與工作流程' },
      { title: 'AI 模型', text: '在院內設備上運行' },
      { title: '硬體', text: '設置於院內的設備' },
    ],
    hardwareAlt: 'KOKODE 在院內設置的設備示意',
  },
  partnerRoles: {
    caption: '醫療機構、合作夥伴與 KOKODE 的角色分工',
    client: { title: '醫療機構', text: '在院內使用 AI' },
    partner: { title: '合作夥伴', text: '引介／客戶窗口' },
    kokode: { title: 'KOKODE', text: '導入／更新／備份支援' },
  },
} as const;
