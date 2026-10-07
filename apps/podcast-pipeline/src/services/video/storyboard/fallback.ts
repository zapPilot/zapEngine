import {
  podcastContentSceneCountRange,
  podcastEditorialSceneCountRange,
} from '../../podcast-packaging.js';
import { speakingUnits } from '../text-units.js';
import { type StoryboardDraft, type StoryboardDraftScene } from './draft.js';
import type {
  StoryboardProvider,
  StoryboardProviderRequest,
  StoryboardProviderResult,
} from './provider.js';
import {
  type CanonicalSentence,
  splitCanonicalSentences,
} from './sentences.js';
import { MAX_SCENE_DURATION_MS, MIN_SCENE_DURATION_MS } from './validation.js';
import { stableSceneId } from './visual-plan.js';

const searchGroupSegmenter = new Intl.Segmenter('en', {
  granularity: 'word',
});

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

interface SegmentationTopic {
  signals: readonly string[];
  id: string;
}

const SEGMENTATION_TOPICS: readonly SegmentationTopic[] = [
  {
    signals: [
      'quantum',
      'qubit',
      'quantum computing',
      '量子',
      '量子計算',
      '量子计算',
    ],
    id: 'topic-01',
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
    id: 'topic-02',
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
    id: 'topic-03',
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
    id: 'topic-04',
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
    id: 'topic-05',
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
    id: 'topic-06',
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
    id: 'topic-07',
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
    id: 'topic-08',
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
    id: 'topic-09',
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
    id: 'topic-10',
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
    id: 'topic-11',
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
    id: 'topic-12',
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
    id: 'topic-13',
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
    id: 'topic-14',
  },
];

interface SearchTextUnit {
  text: string;
  startOffset: number;
  endOffset: number;
}

function normalizedKeyword(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('en-US');
}

function normalizedSearchCorpus(value: string): string {
  return ` ${normalizedKeyword(value)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()} `;
}

function containsConceptSignal(corpus: string, signal: string): boolean {
  const normalizedSignal = normalizedSearchCorpus(signal).trim();
  if (/^[a-z0-9 ]+$/u.test(normalizedSignal)) {
    return corpus.includes(` ${normalizedSignal} `);
  }
  return corpus.includes(normalizedSignal);
}

function matchingSignalCount(
  corpus: string,
  concept: SegmentationTopic,
): number {
  return concept.signals.reduce(
    (count, signal) => count + (containsConceptSignal(corpus, signal) ? 1 : 0),
    0,
  );
}

function selectSegmentationTopic(
  title: string,
  evidence: string,
): SegmentationTopic | null {
  const titleCorpus = normalizedSearchCorpus(title);
  const sceneCorpus = normalizedSearchCorpus(evidence);
  let best: { concept: SegmentationTopic; score: number } | null = null;

  for (const concept of SEGMENTATION_TOPICS) {
    const sceneMatches = matchingSignalCount(sceneCorpus, concept);
    const titleMatches = matchingSignalCount(titleCorpus, concept);
    const score = sceneMatches * 4 + titleMatches;
    if (score > 0 && (!best || score > best.score)) {
      best = { concept, score };
    }
  }
  return best?.concept ?? null;
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
 * Splits ordered English search evidence according to the relative spoken
 * weight of each canonical scene. Translation sentences are not 1:1 with the
 * canonical script, so preserving cumulative story progress is safer than
 * giving every scene an equal-sized English slice.
 */
export function weightedSearchEvidenceGroups(
  script: string,
  groupWeights: readonly number[],
): string[] | null {
  if (!script.trim()) return null;
  if (groupWeights.length === 0) return [];
  const groupCount = groupWeights.length;
  const units = searchTextUnits(script, groupCount);

  const weights = groupWeights.map((weight) =>
    Number.isFinite(weight) && weight > 0 ? weight : 1,
  );
  const totalGroupWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const cumulativeGroupFractions = weights
    .slice(0, -1)
    .reduce<number[]>((fractions, weight) => {
      const previous = fractions.at(-1) ?? 0;
      fractions.push(previous + weight / totalGroupWeight);
      return fractions;
    }, []);

  if (units.length < groupCount) {
    let cumulative = 0;
    return weights.map((weight) => {
      const midpoint = (cumulative + weight / 2) / totalGroupWeight;
      cumulative += weight;
      const unitIndex = Math.min(
        units.length - 1,
        Math.floor(midpoint * units.length),
      );
      return units[unitIndex]!.text;
    });
  }

  const unitWeights = units.map((unit) => speakingUnits(unit.text));
  const prefixUnitWeights = [0];
  for (const weight of unitWeights) {
    prefixUnitWeights.push(prefixUnitWeights.at(-1)! + weight);
  }
  const totalUnitWeight = prefixUnitWeights.at(-1)!;
  const boundaries = [0];

  for (const [index, fraction] of cumulativeGroupFractions.entries()) {
    const previous = boundaries.at(-1)!;
    const min = previous + 1;
    const remainingGroups = groupCount - index - 1;
    const max = units.length - remainingGroups;
    const target = totalUnitWeight * fraction;
    let selected = min;
    for (let candidate = min + 1; candidate <= max; candidate += 1) {
      if (
        Math.abs(prefixUnitWeights[candidate]! - target) <
        Math.abs(prefixUnitWeights[selected]! - target)
      ) {
        selected = candidate;
      }
    }
    boundaries.push(selected);
  }
  boundaries.push(units.length);

  const groups: string[] = [];
  let boundaryStart = 0;
  for (const boundaryEnd of boundaries.slice(1)) {
    const group = units.slice(boundaryStart, boundaryEnd);
    boundaryStart = boundaryEnd;
    const first = group[0]!;
    const last = group.at(-1)!;
    groups.push(script.slice(first.startOffset, last.endOffset).trim());
  }
  return groups;
}

function sentenceWeight(group: readonly CanonicalSentence[]): number {
  return group.reduce((sum, sentence) => sum + speakingUnits(sentence.text), 0);
}

function estimatedGroupDurationMs(
  group: readonly CanonicalSentence[],
  totalWeight: number,
  durationMs: number,
): number {
  const weight = sentenceWeight(group);
  return (durationMs * weight) / totalWeight;
}

function namedVisualAnchors(text: string): Set<string> {
  const matches =
    text.match(
      /\b[A-Z][A-Za-z0-9.+&/-]*(?:\s+[A-Z][A-Za-z0-9.+&/-]*){0,3}\b/gu,
    ) ?? [];
  return new Set(
    matches
      .map((match) => match.trim())
      .filter((match) => {
        const normalized = normalizedKeyword(match);
        if (SEARCH_NOISE_WORDS.has(normalized)) return false;
        return (
          /[A-Z]{2,}/u.test(match) ||
          /[a-z][A-Z]/u.test(match) ||
          /\d/u.test(match) ||
          match.includes(' ')
        );
      })
      .map(normalizedKeyword),
  );
}

// The split/merge loops below re-score the same sentence pairs on every pass,
// so a long episode asks these two pure lookups thousands of times for the
// same sentence. Both are keyed on the sentence object, which lives only for
// the duration of one planning call.
const sentenceConceptCache = new WeakMap<CanonicalSentence, string | null>();
const sentenceAnchorCache = new WeakMap<CanonicalSentence, Set<string>>();

function sentenceConcept(sentence: CanonicalSentence): string | null {
  const cached = sentenceConceptCache.get(sentence);
  if (cached !== undefined) return cached;
  const concept = selectSegmentationTopic('', sentence.text)?.id ?? null;
  sentenceConceptCache.set(sentence, concept);
  return concept;
}

function sentenceAnchors(sentence: CanonicalSentence): Set<string> {
  const cached = sentenceAnchorCache.get(sentence);
  if (cached) return cached;
  const anchors = namedVisualAnchors(sentence.text);
  sentenceAnchorCache.set(sentence, anchors);
  return anchors;
}

function semanticBoundaryStrength(
  left: CanonicalSentence,
  right: CanonicalSentence,
): number {
  const leftConcept = sentenceConcept(left);
  const rightConcept = sentenceConcept(right);
  if (leftConcept && rightConcept && leftConcept !== rightConcept) return 3;

  const leftAnchors = sentenceAnchors(left);
  const rightAnchors = sentenceAnchors(right);
  if (leftAnchors.size > 0 && rightAnchors.size > 0) {
    const shared = [...leftAnchors].some((anchor) => rightAnchors.has(anchor));
    if (!shared) return 2;
  }
  if ((leftConcept && !rightConcept) || (!leftConcept && rightConcept))
    return 1;
  return 0;
}

function bestSemanticSplitIndex(group: readonly CanonicalSentence[]): number {
  const total = sentenceWeight(group);
  let prefix = 0;
  let bestIndex = 1;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let index = 1; index < group.length; index += 1) {
    prefix += speakingUnits(group[index - 1]!.text);
    const strength = semanticBoundaryStrength(group[index - 1]!, group[index]!);
    const balance = Math.abs(total / 2 - prefix);
    const score = strength * 100_000 - balance;
    if (score > bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  }
  return bestIndex;
}

function splitLargestGroup(
  groups: CanonicalSentence[][],
  totalWeight: number,
  durationMs: number,
): boolean {
  const candidates = groups
    .map((group, index) => ({
      group,
      index,
      duration: estimatedGroupDurationMs(group, totalWeight, durationMs),
    }))
    .filter(({ group }) => group.length > 1)
    .sort((left, right) => right.duration - left.duration);
  const candidate = candidates[0]!;
  const splitIndex = bestSemanticSplitIndex(candidate.group);
  groups.splice(
    candidate.index,
    1,
    candidate.group.slice(0, splitIndex),
    candidate.group.slice(splitIndex),
  );
  return true;
}

function mergeCost(
  left: readonly CanonicalSentence[],
  right: readonly CanonicalSentence[],
  totalWeight: number,
  durationMs: number,
): number {
  const combined = [...left, ...right];
  const duration = estimatedGroupDurationMs(combined, totalWeight, durationMs);
  const boundaryStrength = semanticBoundaryStrength(left.at(-1)!, right[0]!);
  const overflow = Math.max(0, duration - MAX_SCENE_DURATION_MS);
  return boundaryStrength * 100_000 + overflow * 10 + duration;
}

function mergeCheapestAdjacentGroups(
  groups: CanonicalSentence[][],
  totalWeight: number,
  durationMs: number,
): boolean {
  let bestIndex = 0;
  let bestCost = Number.POSITIVE_INFINITY;
  for (let index = 0; index < groups.length - 1; index += 1) {
    const cost = mergeCost(
      groups[index]!,
      groups[index + 1]!,
      totalWeight,
      durationMs,
    );
    if (cost < bestCost) {
      bestIndex = index;
      bestCost = cost;
    }
  }
  groups.splice(bestIndex, 2, [
    ...groups[bestIndex]!,
    ...groups[bestIndex + 1]!,
  ]);
  return true;
}

function chooseSemanticGroups(
  sentences: readonly CanonicalSentence[],
  minGroups: number,
  maxGroups: number,
  durationMs: number,
): CanonicalSentence[][] {
  const totalWeight = sentenceWeight(sentences);
  const groups: CanonicalSentence[][] = [];
  let current: CanonicalSentence[] = [];

  for (const sentence of sentences) {
    if (current.length === 0) {
      current = [sentence];
      continue;
    }
    const currentDuration = estimatedGroupDurationMs(
      current,
      totalWeight,
      durationMs,
    );
    const withNextDuration = estimatedGroupDurationMs(
      [...current, sentence],
      totalWeight,
      durationMs,
    );
    const semanticChange = semanticBoundaryStrength(current.at(-1)!, sentence);
    const shouldCut =
      currentDuration >= MIN_SCENE_DURATION_MS &&
      (semanticChange >= 2 || withNextDuration > MAX_SCENE_DURATION_MS);
    if (shouldCut) {
      groups.push(current);
      current = [sentence];
    } else {
      current.push(sentence);
    }
  }
  groups.push(current);

  while (
    groups.length < minGroups &&
    splitLargestGroup(groups, totalWeight, durationMs)
  ) {
    // Split the longest remaining scene, preferring a semantic boundary.
  }
  while (
    groups.length > maxGroups &&
    mergeCheapestAdjacentGroups(groups, totalWeight, durationMs)
  ) {
    // Keep required bounds without casually merging across a subject change.
  }
  return groups;
}

export function createDeterministicStoryboard(input: {
  title: string;
  script: string;
  durationMs: number;
  sentences: readonly CanonicalSentence[];
  isPackaged?: boolean;
  sceneCountRange?: { min: number; max: number };
}): StoryboardDraft {
  if (input.sentences.length === 0) {
    throw new Error('Cannot build a storyboard from an empty canonical script');
  }

  const range =
    input.sceneCountRange ??
    (input.isPackaged !== undefined
      ? podcastEditorialSceneCountRange(
          input.durationMs,
          input.sentences.length,
          input.isPackaged,
        )
      : podcastContentSceneCountRange(
          input.durationMs,
          input.sentences.length,
          input.script,
        ));
  const groups = chooseSemanticGroups(
    input.sentences,
    range.min,
    range.max,
    input.durationMs,
  );
  const scenes = groups.map((group, index): StoryboardDraftScene => {
    const first = group[0]!;
    const last = group.at(-1)!;
    return {
      sceneId: stableSceneId(index),
      startSentenceId: first.id,
      endSentenceId: last.id,
    };
  });

  return { scenes };
}

const DETERMINISTIC_STORYBOARD_MODEL = 'deterministic-v1';

export function createDeterministicStoryboardProvider(): StoryboardProvider {
  return {
    name: 'deterministic',
    model: DETERMINISTIC_STORYBOARD_MODEL,
    generate(
      request: StoryboardProviderRequest,
    ): Promise<StoryboardProviderResult> {
      return Promise.resolve({
        draft: createDeterministicStoryboard(request),
        model: DETERMINISTIC_STORYBOARD_MODEL,
        usage: null,
      });
    },
  };
}
