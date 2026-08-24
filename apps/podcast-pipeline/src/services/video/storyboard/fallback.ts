import {
  podcastContentSceneCountRange,
  podcastEditorialSceneCountRange,
} from '../../podcast-packaging.js';
import { speakingUnits } from '../text-units.js';
import {
  MAX_SEARCH_INTENT_CHARACTERS,
  type StoryboardDraft,
  type StoryboardDraftScene,
} from './draft.js';
import type {
  StoryboardProvider,
  StoryboardProviderRequest,
  StoryboardProviderResult,
} from './provider.js';
import {
  type CanonicalSentence,
  canonicalSentenceRangeText,
  splitCanonicalSentences,
} from './sentences.js';
import { normalizeNumericToken, NUMERIC_TOKEN_PATTERN } from './validation.js';
import { stableSceneId } from './visual-plan.js';

const keywordSegmenter = new Intl.Segmenter('zh-Hant', {
  granularity: 'word',
});

const searchGroupSegmenter = new Intl.Segmenter('en', {
  granularity: 'word',
});

const BRIDGE_WORDS = new Set([
  'and',
  'of',
  'or',
  '以及',
  '之',
  '及',
  '和',
  '或',
  '的',
  '與',
  '跟',
]);

const SEARCH_NOISE_WORDS = new Set([
  'a',
  'about',
  'actually',
  'also',
  'an',
  'another',
  'are',
  'arises',
  'as',
  'at',
  'be',
  'been',
  'being',
  'but',
  'by',
  'can',
  'could',
  'discuss',
  'episode',
  'finally',
  'first',
  'for',
  'from',
  'hello',
  'here',
  'how',
  'in',
  'is',
  'it',
  'its',
  'just',
  "let's",
  'listeners',
  'look',
  'might',
  'more',
  'naturally',
  'next',
  'now',
  'on',
  'one',
  'only',
  'our',
  'podcast',
  'question',
  'raises',
  'really',
  'should',
  'show',
  'simply',
  'still',
  'talk',
  'that',
  'the',
  'then',
  'their',
  'them',
  'there',
  'these',
  'they',
  'this',
  'those',
  'to',
  'today',
  'we',
  'welcome',
  'were',
  'what',
  'when',
  'with',
  'would',
  'you',
  'your',
  '一個',
  '一个',
  '一起',
  '上集',
  '下集',
  '不代表',
  '不過',
  '不过',
  '中',
  '了解',
  '事情',
  '介紹',
  '介绍',
  '仍',
  '仍然',
  '今天',
  '今日',
  '他們',
  '他们',
  '來',
  '來看',
  '來聊',
  '來自',
  '其實',
  '其实',
  '內容',
  '内容',
  '再',
  '出現',
  '出现',
  '分享',
  '到',
  '反直覺',
  '反直觉',
  '可以',
  '各位',
  '告訴',
  '告诉',
  '咱們',
  '咱们',
  '問題',
  '问题',
  '喜歡',
  '喜欢',
  '在',
  '大家',
  '好的',
  '如何',
  '如果',
  '它們',
  '它们',
  '對',
  '对',
  '將',
  '将',
  '就是',
  '已經',
  '已经',
  '帶來',
  '带来',
  '帶你',
  '带你',
  '並',
  '并',
  '接下來',
  '接下来',
  '接著',
  '接着',
  '探討',
  '探讨',
  '提供',
  '故事',
  '是',
  '更',
  '最後',
  '最后',
  '有些',
  '有點',
  '有点',
  '本期',
  '東西',
  '东西',
  '歡迎',
  '欢迎',
  '正',
  '正在',
  '注意',
  '然後',
  '然后',
  '現在',
  '现在',
  '當然',
  '当然',
  '看看',
  '知道',
  '節目',
  '节目',
  '第一',
  '第一個',
  '第一个',
  '簡單',
  '简单',
  '總之',
  '总之',
  '聽眾',
  '听众',
  '聚焦',
  '能',
  '與其',
  '話題',
  '话题',
  '說',
  '說明',
  '說說',
  '说',
  '说明',
  '说说',
  '請',
  '请',
  '變成',
  '变成',
  '讓',
  '让',
  '話說回來',
  '话说回来',
  '談',
  '談談',
  '谈',
  '谈谈',
  '訊號',
  '讯号',
  '討論',
  '讨论',
  '重新',
  '重要',
  '重點',
  '重点',
  '關注',
  '關於',
  '关注',
  '关于',
  '首先',
  '觀察',
  '观察',
  '塑造',
  '追蹤',
  '追踪',
  '這些',
  '這個',
  '這期',
  '这些',
  '这个',
  '这期',
  '進行',
  '进行',
  '那麼',
  '那個',
  '那些',
  '那么',
  '那个',
  '部分',
  '需要',
  '因此',
  '所以',
  '同步',
  '線索',
  '线索',
  '聊',
  '為',
  '为',
  '為什麼',
  '为什么',
  '我們',
  '我们',
  '我想',
  '或許',
  '或许',
  '方面',
  '朋友',
  '收聽',
  '收听',
  '持續',
  '持续',
  '評估',
  '评估',
  '成為',
  '成为',
  '怎麼',
  '怎么',
  '意味著',
  '意味着',
  '應該',
  '应该',
  '會',
  '会',
  '有',
  '最',
  '很',
  '可',
  '要',
  '先',
  '看',
  '留意',
  '顯示',
  '显示',
  '發生',
  '发生',
  '代表',
  '一下',
  '下一批',
  '不是',
  '不能',
  '不斷',
  '不再',
  '但',
  '人',
  '什麼',
  '以前',
  '你們',
  '值得',
  '做出',
  '做出了',
  '到底',
  '包括',
  '只',
  '只是',
  '同',
  '因為',
  '地方',
  '大部分',
  '很多',
  '心裡',
  '我是',
  '拿到',
  '指出',
  '主播',
  '是不是',
  '最終',
  '有意思',
  '每一個',
  '每個',
  '概念',
  '真正',
  '系統',
  '繼續',
  '聽過',
  '自然而然',
  '自然而然地',
  '被',
  '被動',
  '覺得',
  '這',
  '這一步',
  '這裡',
  '還有',
  '還能',
  '關心',
  '限制',
  '了',
  '也',
  '也就是',
  '它',
  '工具',
  '所需',
  '狹窄',
  '用例',
  '種',
  '裡',
  '起來',
  '跟上',
  '跟上來',
  '跟上來了',
  '連線',
  '錯',
  '誕生',
  '資金',
]);

const MAX_KEYWORD_PHRASE_CHARACTERS = 32;
const MAX_KEYWORD_PHRASE_WORDS = 6;

interface PhotographicConcept {
  signals: readonly string[];
  subject: string;
}

const PHOTOGRAPHIC_CONCEPTS: readonly PhotographicConcept[] = [
  {
    signals: [
      'quantum',
      'qubit',
      'quantum computing',
      '量子',
      '量子計算',
      '量子计算',
    ],
    subject: 'quantum scientists working in a laboratory photo',
  },
  {
    signals: [
      'robot',
      'robotics',
      'humanoid',
      'automation',
      'machine economy',
      'autonomous machine',
      'machine operator',
      'human machine',
      'vision language',
      'vision-language',
      'vla',
      'factory',
      'manufacturing',
      '機器人',
      '机器人',
      '自動化',
      '自动化',
      '工廠',
      '工厂',
    ],
    subject: 'industrial robots and engineers in a factory photo',
  },
  {
    signals: [
      'identity',
      'cybersecurity',
      'security',
      'privacy',
      'authentication',
      'verification',
      'biometric',
      'encryption',
      'secure execution',
      'audit chain',
      '身分',
      '身份',
      '資安',
      '安全',
      '隱私',
      '隐私',
      '驗證',
      '验证',
    ],
    subject: 'cybersecurity team verifying digital identity office photo',
  },
  {
    signals: [
      'ai agent',
      'ai agents',
      'ai',
      'agent',
      'agents',
      'artificial intelligence',
      'machine learning',
      'digital labor',
      'data center',
      'data centers',
      'data centre',
      'data centres',
      'gpu',
      '模型',
      '人工智慧',
      '人工智能',
      '智能體',
      '智能体',
      '資料中心',
      '数据中心',
    ],
    subject: 'AI engineers monitoring data center servers photo',
  },
  {
    signals: [
      'stablecoin',
      'stablecoins',
      'payment',
      'payments',
      'checkout',
      'wallet',
      'remittance',
      'settlement',
      'transaction',
      'merchant',
      'fiat',
      'visa',
      'mastercard',
      '穩定幣',
      '稳定币',
      '支付',
      '付款',
      '錢包',
      '钱包',
      '匯款',
      '汇款',
    ],
    subject: 'customer using digital payment at retail checkout photo',
  },
  {
    signals: [
      'ethereum',
      'bitcoin',
      'blockchain',
      'crypto',
      'cryptocurrency',
      'cryptography',
      'cryptographic',
      'defi',
      'dex',
      'coinbase',
      'moonwell',
      'onchain',
      'on-chain',
      'chain data',
      'layer 2',
      'web3',
      'token',
      '交易所',
      '加密',
      '區塊鏈',
      '区块链',
      '去中心化',
      '鏈上',
      '链上',
    ],
    subject: 'blockchain developers office photo',
  },
  {
    signals: [
      'builder',
      'builders',
      'developer',
      'developers',
      'startup',
      'startups',
      'founder',
      'founders',
      'entrepreneur',
      'innovation',
      '建設者',
      '建设者',
      '開發者',
      '开发者',
      '創業',
      '创业',
      '新創',
      '创新',
    ],
    subject: 'technology startup founders collaborating in office photo',
  },
  {
    signals: [
      'market',
      'markets',
      'trading',
      'investor',
      'investment',
      'finance',
      'liquidity',
      'bond',
      'stock',
      '經濟',
      '经济',
      '市場',
      '市场',
      '金融',
      '投資',
      '投资',
      '流動性',
      '流动性',
      '債券',
      '债券',
    ],
    subject: 'financial traders working at market screens photo',
  },
  {
    signals: [
      'solar',
      'wind power',
      'renewable',
      'energy',
      'electricity',
      'battery',
      'climate',
      '能源',
      '電力',
      '电力',
      '太陽能',
      '太阳能',
      '風力',
      '风力',
      '電池',
      '电池',
      '氣候',
      '气候',
    ],
    subject: 'renewable energy engineers at solar and wind site photo',
  },
  {
    signals: [
      'cargo',
      'port',
      'freight',
      'railway',
      'railroad',
      'logistics',
      'supply chain',
      '港口',
      '貨運',
      '货运',
      '鐵路',
      '铁路',
      '物流',
      '供應鏈',
      '供应链',
      '基礎建設',
      '基础设施',
    ],
    subject: 'cargo port and freight logistics workers photo',
  },
  {
    signals: [
      'forest',
      'wetland',
      'habitat',
      'conservation',
      'ecosystem',
      'biodiversity',
      '環境',
      '环境',
      '森林',
      '濕地',
      '湿地',
      '生態',
      '生态',
      '保育',
    ],
    subject: 'conservation scientists restoring natural habitat photo',
  },
  {
    signals: [
      'science',
      'scientist',
      'scientists',
      'research',
      'laboratory',
      'experiment',
      '科學',
      '科学',
      '研究',
      '實驗室',
      '实验室',
    ],
    subject: 'scientists conducting research in a laboratory photo',
  },
  {
    signals: [
      'health',
      'healthcare',
      'medical',
      'medicine',
      'hospital',
      'patient',
      '醫療',
      '医疗',
      '健康',
      '醫院',
      '医院',
      '病患',
    ],
    subject: 'medical professionals caring for patients hospital photo',
  },
  {
    signals: [
      'policy',
      'government',
      'regulation',
      'regulator',
      'election',
      'parliament',
      '政策',
      '政府',
      '監管',
      '监管',
      '法規',
      '法规',
      '選舉',
      '选举',
    ],
    subject: 'government officials meeting on public policy photo',
  },
];

interface KeywordPhrase {
  value: string;
  index: number;
  wordCount: number;
}

interface KeywordPhraseState {
  current: string;
  currentIndex: number;
  lastWord: string;
  pendingConnector: string;
  pendingWhitespace: boolean;
  wordCount: number;
}

interface SearchTextUnit {
  text: string;
  startOffset: number;
  endOffset: number;
}

export interface DeterministicStoryboardSearchContext {
  searchTitle: string;
  searchScript: string;
}

function normalizedKeyword(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('en-US');
}

function characterCount(value: string): number {
  return Array.from(value).length;
}

function hasLatinOrNumber(value: string): boolean {
  return /[A-Za-z0-9]/u.test(value);
}

const TECHNICAL_CONNECTORS = new Set(['#', '+', '&', '.', '/', '-']);

function createKeywordPhraseState(): KeywordPhraseState {
  return {
    current: '',
    currentIndex: 0,
    lastWord: '',
    pendingConnector: '',
    pendingWhitespace: false,
    wordCount: 0,
  };
}

function resetKeywordPhraseState(state: KeywordPhraseState): void {
  state.current = '';
  state.lastWord = '';
  state.pendingConnector = '';
  state.pendingWhitespace = false;
  state.wordCount = 0;
}

function trimTrailingTechnicalConnectors(value: string): string {
  const characters = Array.from(value);
  while (
    characters.length > 0 &&
    TECHNICAL_CONNECTORS.has(characters.at(-1)!)
  ) {
    characters.pop();
  }
  return characters.join('');
}

function flushKeywordPhrase(
  state: KeywordPhraseState,
  phrases: KeywordPhrase[],
): void {
  const phrase = trimTrailingTechnicalConnectors(state.current).trim();
  if (characterCount(phrase) >= 2) {
    phrases.push({
      value: phrase,
      index: state.currentIndex,
      wordCount: state.wordCount,
    });
  }
  resetKeywordPhraseState(state);
}

function addKeywordWord(
  state: KeywordPhraseState,
  phrases: KeywordPhrase[],
  segment: string,
  index: number,
): void {
  const normalized = normalizedKeyword(segment);
  if (BRIDGE_WORDS.has(normalized)) {
    state.pendingConnector = '';
    return;
  }
  if (SEARCH_NOISE_WORDS.has(normalized)) {
    flushKeywordPhrase(state, phrases);
    return;
  }

  const needsSpace =
    state.current.length > 0 &&
    state.pendingConnector.length === 0 &&
    (state.pendingWhitespace ||
      (hasLatinOrNumber(state.lastWord) && hasLatinOrNumber(segment)));
  const addition = `${state.pendingConnector}${needsSpace ? ' ' : ''}${segment}`;
  const exceedsLimit =
    state.current.length > 0 &&
    (state.wordCount >= MAX_KEYWORD_PHRASE_WORDS ||
      characterCount(`${state.current}${addition}`) >
        MAX_KEYWORD_PHRASE_CHARACTERS);
  if (exceedsLimit) flushKeywordPhrase(state, phrases);
  if (!state.current) state.currentIndex = index;
  state.current += state.current ? addition : segment;
  state.lastWord = segment;
  state.pendingConnector = '';
  state.pendingWhitespace = false;
  state.wordCount += 1;
}

function handleKeywordSeparator(
  state: KeywordPhraseState,
  phrases: KeywordPhrase[],
  segments: readonly Intl.SegmentData[],
  part: Intl.SegmentData,
  index: number,
): void {
  const segment = part.segment;
  if (segment.trim().length === 0) {
    state.pendingWhitespace = true;
    return;
  }
  if ((segment === '%' || segment === '％') && /\d$/u.test(state.current)) {
    state.current += segment;
    return;
  }
  const next = segments[index + 1];
  if (
    TECHNICAL_CONNECTORS.has(segment) &&
    state.current.length > 0 &&
    next?.isWordLike &&
    part.index + segment.length === next.index
  ) {
    state.pendingConnector = segment;
    return;
  }
  flushKeywordPhrase(state, phrases);
}

function keywordPhrases(value: string): KeywordPhrase[] {
  const segments = Array.from(keywordSegmenter.segment(value));
  const phrases: KeywordPhrase[] = [];
  const state = createKeywordPhraseState();

  for (const [index, part] of segments.entries()) {
    if (part.isWordLike) {
      addKeywordWord(state, phrases, part.segment, index);
    } else {
      handleKeywordSeparator(state, phrases, segments, part, index);
    }
  }
  flushKeywordPhrase(state, phrases);

  const unique = new Map<string, KeywordPhrase>();
  for (const phrase of phrases) {
    const normalized = normalizedKeyword(phrase.value).replace(/\s+/gu, '');
    if (!unique.has(normalized)) unique.set(normalized, phrase);
  }
  return [...unique.values()];
}

function phraseScore(phrase: KeywordPhrase): number {
  let score = Math.min(characterCount(phrase.value), 24) + phrase.wordCount * 2;
  if (/[A-Za-z]/u.test(phrase.value)) score += 18;
  if (/\d/u.test(phrase.value)) score += 6;
  if (/[A-Z]{2,}/u.test(phrase.value)) score += 8;
  if (/[A-Za-z][#+./-]|[#+./-][A-Za-z0-9]/u.test(phrase.value)) score += 5;
  return score;
}

function selectKeywordPhrases(value: string, limit: number): string[] {
  return keywordPhrases(value)
    .sort((left, right) => phraseScore(right) - phraseScore(left))
    .slice(0, limit)
    .sort((left, right) => left.index - right.index)
    .map((phrase) => phrase.value);
}

function groundedNumericText(
  value: string,
  evidence: string,
  replacement: string,
): string {
  const normalizedEvidence = normalizeNumericToken(evidence);
  return value.replace(NUMERIC_TOKEN_PATTERN, (token) =>
    normalizedEvidence.includes(normalizeNumericToken(token))
      ? token
      : replacement,
  );
}

function appendDistinctPhrase(target: string[], phrase: string): void {
  const normalized = normalizedKeyword(phrase).replace(/\s+/gu, '');
  const existingIndex = target.findIndex((candidate) => {
    const candidateNormalized = normalizedKeyword(candidate).replace(
      /\s+/gu,
      '',
    );
    return (
      candidateNormalized === normalized ||
      candidateNormalized.includes(normalized) ||
      normalized.includes(candidateNormalized)
    );
  });
  if (existingIndex < 0) {
    target.push(phrase);
    return;
  }
  const existing = target[existingIndex]!;
  if (characterCount(phrase) > characterCount(existing)) {
    target[existingIndex] = phrase;
  }
}

function combinePhrases(phrases: readonly string[]): string {
  const selected: string[] = [];
  for (const phrase of phrases) {
    const candidate = [...selected, phrase].join(' ');
    if (characterCount(candidate) > MAX_SEARCH_INTENT_CHARACTERS) continue;
    appendDistinctPhrase(selected, phrase);
  }
  return selected.join(' ');
}

function normalizedSearchCorpus(value: string): string {
  return ` ${normalizedKeyword(value)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()} `;
}

function containsConceptSignal(corpus: string, signal: string): boolean {
  const normalizedSignal = normalizedSearchCorpus(signal).trim();
  if (!normalizedSignal) return false;
  if (/^[a-z0-9 ]+$/u.test(normalizedSignal)) {
    return corpus.includes(` ${normalizedSignal} `);
  }
  return corpus.includes(normalizedSignal);
}

function matchingSignalCount(
  corpus: string,
  concept: PhotographicConcept,
): number {
  return concept.signals.reduce(
    (count, signal) => count + (containsConceptSignal(corpus, signal) ? 1 : 0),
    0,
  );
}

function selectPhotographicConcept(
  title: string,
  evidence: string,
): PhotographicConcept | null {
  const titleCorpus = normalizedSearchCorpus(title);
  const sceneCorpus = normalizedSearchCorpus(evidence);
  let best: { concept: PhotographicConcept; score: number } | null = null;

  for (const concept of PHOTOGRAPHIC_CONCEPTS) {
    const sceneMatches = matchingSignalCount(sceneCorpus, concept);
    const titleMatches = matchingSignalCount(titleCorpus, concept);
    const score = sceneMatches * 4 + titleMatches;
    if (score > 0 && (!best || score > best.score)) {
      best = { concept, score };
    }
  }
  return best?.concept ?? null;
}

function isLikelyTechnicalPhrase(
  phrase: string,
  concept: PhotographicConcept | null,
): boolean {
  if (/\d/u.test(phrase)) return true;
  const capitalizedWords = phrase
    .split(/\s+/u)
    .filter((word) => /^[A-Z]/u.test(word));
  if (/[A-Z]{2}/u.test(phrase) || capitalizedWords.length >= 2) {
    return true;
  }
  if (!concept) return false;
  const corpus = normalizedSearchCorpus(phrase);
  return concept.signals.some((signal) =>
    containsConceptSignal(corpus, signal),
  );
}

function groundedPhotographicIntent(
  groundedPhrases: readonly string[],
  subject: string,
): string {
  const selected: string[] = [];
  for (const phrase of groundedPhrases) {
    const candidate = [...selected, phrase, subject].join(' ');
    if (characterCount(candidate) <= MAX_SEARCH_INTENT_CHARACTERS) {
      appendDistinctPhrase(selected, phrase);
    }
  }
  return combinePhrases([...selected, subject]);
}

function deterministicSearchIntents(
  title: string,
  evidence: string,
  numericEvidence = evidence,
): string[] {
  const titlePhrases = selectKeywordPhrases(
    groundedNumericText(title, numericEvidence, ''),
    1,
  );
  const scenePhrases = selectKeywordPhrases(
    groundedNumericText(evidence, numericEvidence, ' '),
    3,
  );
  const concept = selectPhotographicConcept(title, evidence);
  const photographicSubject =
    concept?.subject ??
    combinePhrases([...titlePhrases, 'real world documentary editorial photo']);
  const technicalPhrases = scenePhrases.filter((phrase) =>
    isLikelyTechnicalPhrase(phrase, concept),
  );
  const photographicIntent = groundedPhotographicIntent(
    technicalPhrases,
    photographicSubject,
  );
  const intents = [photographicIntent, photographicSubject].filter(
    (intent, index, all) =>
      characterCount(intent) >= 2 && all.indexOf(intent) === index,
  );
  if (intents.length > 0) return intents;

  return ['editorial concept'];
}

function sentenceGroups<T extends { text: string }>(
  sentences: readonly T[],
  groupCount: number,
): T[][] {
  const weights = sentences.map((sentence) => speakingUnits(sentence.text));
  const prefixWeights = [0];
  for (const weight of weights) {
    prefixWeights.push(prefixWeights.at(-1)! + weight);
  }
  const totalWeight = prefixWeights.at(-1)!;
  const boundaries = [0];
  for (let group = 1; group < groupCount; group += 1) {
    const previous = boundaries.at(-1)!;
    const min = previous + 1;
    const max = sentences.length - (groupCount - group);
    const target = (totalWeight * group) / groupCount;
    let selected = min;
    for (let candidate = min + 1; candidate <= max; candidate += 1) {
      if (
        Math.abs(prefixWeights[candidate]! - target) <
        Math.abs(prefixWeights[selected]! - target)
      ) {
        selected = candidate;
      }
    }
    boundaries.push(selected);
  }
  boundaries.push(sentences.length);

  return boundaries
    .slice(0, -1)
    .map((start, index) => sentences.slice(start, boundaries[index + 1]));
}

function searchTextUnits(script: string, groupCount: number): SearchTextUnit[] {
  const sentences = splitCanonicalSentences(script);
  if (sentences.length >= groupCount) return sentences;

  const words = Array.from(searchGroupSegmenter.segment(script)).flatMap(
    (part): SearchTextUnit[] =>
      part.isWordLike
        ? [
            {
              text: part.segment,
              startOffset: part.index,
              endOffset: part.index + part.segment.length,
            },
          ]
        : [],
  );
  if (words.length >= groupCount) return words;

  return Array.from(
    script.matchAll(/\S/gu),
    (match): SearchTextUnit => ({
      text: match[0],
      startOffset: match.index,
      endOffset: match.index + match[0].length,
    }),
  );
}

/**
 * Splits the English search script into one weight-balanced slice per scene.
 * The canonical and English scripts are not sentence-aligned, so this is the
 * only mapping available; the LLM enrichment pass reuses it so it reads the
 * same English span the deterministic intents were built from.
 */
export function balancedSearchEvidenceGroups(
  script: string,
  groupCount: number,
): string[] | null {
  if (!script.trim()) return null;
  const units = searchTextUnits(script, groupCount);
  if (units.length === 0) return null;

  if (units.length < groupCount) {
    return Array.from({ length: groupCount }, (_, index) => {
      const unitIndex = Math.min(
        units.length - 1,
        Math.floor((index * units.length) / groupCount),
      );
      return units[unitIndex]!.text;
    });
  }

  return sentenceGroups(units, groupCount).map((group) => {
    const first = group[0]!;
    const last = group.at(-1)!;
    return script.slice(first.startOffset, last.endOffset).trim();
  });
}

function chooseBalancedGroups(
  sentences: readonly CanonicalSentence[],
  minGroups: number,
  maxGroups: number,
  durationMs: number,
): CanonicalSentence[][] {
  let best: CanonicalSentence[][] = [];
  let bestPenalty = Number.POSITIVE_INFINITY;
  const totalWeight = sentences.reduce(
    (sum, sentence) => sum + speakingUnits(sentence.text),
    0,
  );
  for (let groupCount = minGroups; groupCount <= maxGroups; groupCount += 1) {
    const groups = sentenceGroups(sentences, groupCount);
    const penalty = groups.reduce((sum, group) => {
      const weight = group.reduce(
        (groupSum, sentence) => groupSum + speakingUnits(sentence.text),
        0,
      );
      const estimatedDuration = (durationMs * weight) / totalWeight;
      const under = Math.max(0, 9_000 - estimatedDuration);
      const over = Math.max(0, estimatedDuration - 12_000);
      const targetDelta = Math.abs(10_500 - estimatedDuration) * 0.05;
      return sum + under + over + targetDelta;
    }, 0);
    if (penalty < bestPenalty) {
      best = groups;
      bestPenalty = penalty;
    }
  }
  return best;
}

function rangeText(
  script: string,
  sentences: readonly CanonicalSentence[],
  group: readonly CanonicalSentence[],
): string {
  const first = group[0];
  const last = group.at(-1);
  if (!first || !last) throw new Error('Fallback sentence group is empty');
  return (
    canonicalSentenceRangeText(script, sentences, first.id, last.id) ??
    group.map((sentence) => sentence.text).join('')
  );
}

export function createDeterministicStoryboard(input: {
  title: string;
  script: string;
  durationMs: number;
  sentences: readonly CanonicalSentence[];
  searchTitle?: string;
  searchScript?: string;
  isPackaged?: boolean;
}): StoryboardDraft {
  if (input.sentences.length === 0) {
    throw new Error('Cannot build a storyboard from an empty canonical script');
  }

  const range =
    input.isPackaged !== undefined
      ? podcastEditorialSceneCountRange(
          input.durationMs,
          input.sentences.length,
          input.isPackaged,
        )
      : podcastContentSceneCountRange(
          input.durationMs,
          input.sentences.length,
          input.script,
        );
  const groups = chooseBalancedGroups(
    input.sentences,
    range.min,
    range.max,
    input.durationMs,
  );
  const searchEvidenceGroups = input.searchScript
    ? balancedSearchEvidenceGroups(input.searchScript, groups.length)
    : null;
  const searchTitle = input.searchTitle?.trim() || input.title;

  const scenes = groups.map((group, index): StoryboardDraftScene => {
    const first = group[0]!;
    const last = group.at(-1)!;
    const canonicalEvidence = rangeText(
      input.script,
      input.sentences,
      group,
    ).trim();
    const searchEvidence =
      searchEvidenceGroups?.[index]?.trim() || canonicalEvidence;
    return {
      sceneId: stableSceneId(index),
      startSentenceId: first.id,
      endSentenceId: last.id,
      imageSearchIntent: deterministicSearchIntents(
        searchTitle,
        searchEvidence,
        canonicalEvidence,
      ),
    };
  });

  return { scenes };
}

const DETERMINISTIC_STORYBOARD_MODEL = 'deterministic-v1';

export function createDeterministicStoryboardProvider(
  searchContext: Partial<DeterministicStoryboardSearchContext> = {},
): StoryboardProvider {
  return {
    name: 'deterministic',
    model: DETERMINISTIC_STORYBOARD_MODEL,
    generate(
      request: StoryboardProviderRequest,
    ): Promise<StoryboardProviderResult> {
      return Promise.resolve({
        draft: createDeterministicStoryboard({ ...request, ...searchContext }),
        model: DETERMINISTIC_STORYBOARD_MODEL,
        usage: null,
      });
    },
  };
}
