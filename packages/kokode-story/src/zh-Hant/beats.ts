import type { Beat, BeatId } from '../types.js';

// Claims are fenced by packages/kokode-story/src/story.test.ts: when a guardrail fails, change the copy.
export const BEATS: { readonly [Id in BeatId]: Beat } = {
  hero: {
    eyebrow: 'AI，就在這裡。',
    title: ['不送上雲端。', '不離開院內。'],
    body: [
      'AI 在院內運作，日常使用不需要網際網路。',
      '從設備準備到設定，由 KOKODE 導入。',
    ],
    action: { label: '洽詢試行方案' },
  },
  painPatient: {
    eyebrow: '課題：患者資料',
    title: ['想交給 AI 的工作，', '往往都有患者資料。'],
    body: [
      '轉診信、出院摘要、病程整理。越費時的文件，越需要患者資料才能撰寫。',
      '日本個人情報保護委員會也提醒，在生成式 AI 服務輸入個人資料時應注意風險。',
    ],
    source: {
      label:
        '日本個人情報保護委員會〈關於使用生成式 AI 服務的注意事項〉（2023 年 6 月 2 日）',
      href: 'https://www.ppc.go.jp/news/careful_information/230602_AI_utilize_alert/',
    },
  },
  painContent: {
    eyebrow: '課題：醫療圖像',
    title: ['醫療所需的圖像，', '有時無法生成。'],
    body: [
      '解剖圖、手術說明圖，即使是醫療不可或缺的圖像，一般 AI 服務也可能因使用規則而限制生成。',
    ],
  },
  desiredWorld: {
    eyebrow: '我們想要的是',
    title: ['像 ChatGPT 一樣自然。', '但由院內管理。'],
    body: [
      '提出需求就能得到回應，無論是文件草稿或說明圖。保留這份便利，同時讓患者資料留在院內。',
    ],
  },
  solution: {
    eyebrow: 'KOKODE',
    title: ['在院內運作，', '專屬於機構的 AI。'],
    body: [
      'KOKODE 在院內設備上運行 AI，處理患者資料的工作留在院內，日常使用不需要網際網路。',
    ],
    notes: ['normalOperation'],
  },
  beforeAfter: {
    eyebrow: '資料的去向',
    title: ['患者資料，', '交給院內的 AI。'],
    figure: 'beforeAfter',
    notes: ['normalOperation'],
  },
  experience: {
    eyebrow: '使用方式',
    title: ['打開瀏覽器，', '像平常一樣使用。'],
    body: [
      '在連接員工網路的電腦或平板上，用瀏覽器開啟 kokode.local 並登入，即可像使用 ChatGPT 一樣透過聊天交辦，不必坐在伺服器前。',
    ],
    figure: 'experience',
  },
  boundary: {
    eyebrow: '連線範圍',
    title: ['只在院內網路', '使用的 AI。'],
    body: [
      '只有連接院內授權網路（有線 LAN 或員工 Wi-Fi）並登入的裝置才能使用 KOKODE，院外無法連線，設定時也會與患者用 Wi-Fi 分開。',
    ],
    figure: 'boundary',
  },
  demoPatient: {
    eyebrow: '應用例：轉診信',
    title: ['病程摘要，', '也在院內起草。'],
    body: ['根據病歷中的病程記錄，起草轉診信所需的摘要，再由醫師確認並完成。'],
    figure: 'demoPatient',
    notes: ['clinicalJudgment'],
    action: { label: '想試用這項工作', interest: 'referral' },
  },
  demoImage: {
    eyebrow: '應用例：說明圖',
    title: ['簡報所需的圖，', '也在院內起草。'],
    body: ['提出「請繪製臀部解剖圖」的需求，即可起草線稿並整理成簡報投影片。'],
    figure: 'demoImage',
    action: { label: '想試用這項工作', interest: 'materials' },
  },
  turnkey: {
    eyebrow: '整套導入',
    title: ['由 KOKODE 導入，', '由院內團隊使用。'],
    body: [
      '設備、AI 模型、院內知識、工作代理與聊天介面，包含登入與備份設定，由 KOKODE 整套設定好才交付。',
      '交付後，院內團隊不必做技術設定就能使用。更新與維運支援也由 KOKODE 負責。',
    ],
    figure: 'turnkey',
  },
  ownership: {
    eyebrow: '機構的資產',
    title: ['在院內累積的內容，', '都屬於機構。'],
    body: [
      '文件、對話、工作流程與設定都留在院內，屬於機構的資產。',
      'AI 模型是可以替換的零件。更換模型，累積的知識仍屬於機構。',
    ],
  },
  updates: {
    eyebrow: '更新與備份',
    title: ['更新與備份，', '都由機構掌握。'],
    body: [
      '更新資料可用 USB 等方式帶進院內，不必連網。',
      '備份存到機構自己管理的保存先，不送 KOKODE 的雲端。',
    ],
  },
  startSmall: {
    eyebrow: '開始方式',
    title: ['先從一台設備，', '一項工作開始。'],
    body: [
      '不必一開始就準備 GPU 機架，可先用一台小型設備試行一項工作。',
      '規模擴大時，可與我們討論符合設施需求的設備配置。設備變大，使用方式仍然相同。',
    ],
    figure: 'hardware',
    notes: ['hardwareImage'],
    price: {
      label: 'PoC',
      amount: '30 萬日圓起',
      note: '試行方案（導入驗證）的參考價格，依內容個別報價。',
    },
  },
  pilot: {
    eyebrow: '試行方案',
    title: ['選一項工作，', '在院內試行。'],
    points: [
      {
        title: '選擇一項工作',
        text: '選一項無法送上雲端，但想交給 AI 的工作，例如轉診信撰寫、院內文件搜尋、說明資料製作，或將語音整理成文件。',
      },
      {
        title: '在院內設置一台設備',
        text: '從設備準備到設定，由 KOKODE 負責。',
      },
      {
        title: '實際使用',
        text: '員工透過瀏覽器使用，一起確認效果。',
      },
    ],
  },
  cta: {
    eyebrow: '洽詢',
    title: ['帶來一項', '無法送上雲端、', '卻想交給 AI 的工作。'],
    body: ['告訴我們想試行的工作，我們將說明試行方案的進行方式。'],
    notes: ['notReplacement'],
    action: { label: '洽詢想試行的工作' },
  },
  partnerDemand: {
    eyebrow: '致銷售合作夥伴',
    title: ['您的客戶，', '正在尋找 AI。'],
    body: [
      '想用 AI，卻不能讓患者資料離開院內。我們以院內運作的 AI 回應醫療機構的這項需求。',
    ],
  },
  partnerGap: {
    eyebrow: '合作夥伴的角色',
    title: ['不需要 AI 工程師，', '也不需要 GPU 專業知識。'],
    body: [
      '設備選型、AI 模型設定、更新與備份的安排及導入後支援由 KOKODE 負責，請運用您與客戶的關係為我們引介。',
    ],
  },
  partnerRoles: {
    eyebrow: '角色分工',
    title: ['合作夥伴與', 'KOKODE，', '共同支援醫療機構。'],
    figure: 'partnerRoles',
  },
  partnerCta: {
    eyebrow: '開始方式',
    title: ['先從一家機構，', '一起開始。'],
    body: [
      '我們將與合作夥伴一起導入第一家機構，若有合適的引介對象，歡迎洽詢。',
    ],
    action: { label: '洽詢合作夥伴方案', interest: 'partner' },
  },
};
