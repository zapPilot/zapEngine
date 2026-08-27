import type { Locator, Page } from 'playwright-core';

import { convertTextToZhCN } from '../services/opencc.js';
import { SocialPublishError } from './publish-error.js';
import {
  isPublisherReady,
  UPLOAD_INPUT_SELECTOR,
  withRednotePublishPage,
} from './rednote-browser.js';
import type {
  PublishResult,
  RednotePublisher,
  RednotePublishInput,
} from './types.js';

const EDITOR_TIMEOUT_MS = 30_000;
const UPLOAD_TIMEOUT_MS = 600_000;
const SUCCESS_TIMEOUT_MS = 60_000;
const TOPIC_SUGGESTION_TIMEOUT_MS = 8_000;
const TOPIC_TYPING_DELAY_MS = 80;

// The creator UI is a Simplified-Chinese SPA whose class names are generated,
// so each field is located by several candidates and the first visible one wins.
// The editor is a TipTap/ProseMirror instance; its `data-placeholder` lives on
// the inner paragraph rather than on the editable element, which is why the
// placeholder candidates only ever matched a descendant. The note carries no
// prose body -- this editor only ever hosts the `#`-typed topic anchors
// `attachTopics` inserts, never any published text.
const BODY_SELECTORS = [
  '.tiptap.ProseMirror[contenteditable="true"]',
  '.ql-editor[contenteditable="true"]',
  '[contenteditable="true"]',
] as const;

// Rednote's own title field, filled last. Reading `inputValue()` back proves
// nothing: a write that lands while the form is re-rendering sets the DOM value
// without ever reaching the SPA's model, and the note is then created with
// `title: ""` while every DOM-level check passes. The field's own character
// counter is the SPA reading its own state, so that is what confirms the write.
const TITLE_SELECTORS = [
  'input[placeholder*="标题"]',
  'input[placeholder*="標題"]',
  '.title-input input',
] as const;

// Submitting goes through <xhs-publish-btn>, whose label lives in an attribute
// and whose buttons live in a shadow root (reopened in rednote-browser.ts). The
// host also reports readiness: `submit-disabled` flips to "false" only when the
// form will actually accept a submit, which is the one trustworthy enabled check
// — the button is never `disabled`, it is only styled differently. It tracks the
// upload settling, not the editor: it reads "true" for a while after the file
// finishes transferring and there is nothing the publisher can do to hurry it.
const PUBLISH_HOST_SELECTOR = 'xhs-publish-btn';
const SUBMIT_ENABLED_SELECTOR = 'xhs-publish-btn[submit-disabled="false"]';
// Exact match so it cannot hit the sidebar's "发布笔记" nav item.
const PUBLISH_BUTTON_SELECTOR = 'text="发布"';

// "重新上传" replaces "取消上传" only once the file is fully uploaded, and the
// submit control stays inert (styled, not `disabled`) until then — so Playwright
// actionability cannot see it and this wait is what prevents a no-op publish.
const UPLOAD_COMPLETE_SELECTOR = 'text="重新上传"';

// Both verified against the live form on 2026-08-27, which renders:
//   <div class="input">
//     <div class="d-input-wrapper ..."><input class="d-text"></div>
//     <div class="suffix"><div class="count-tip">11 / 20</div></div>
//   </div>
// The counter is a descendant of the same `.input` block as the field, and the
// whole `.count-tip` element is absent while the model holds no title -- the
// body's own `0 /1000` counter lives outside `.input`, so this scope cannot
// pick it up.
const TITLE_COUNTER_SELECTOR = '.count-tip';
const TITLE_CONTAINER_SELECTOR = '.input';
const TITLE_WRITE_ATTEMPTS = 3;
// Counted rather than measured against the clock: the counter is rendered on a
// framework tick, so the wait only has to outlast a render, and a fixed count
// keeps the retry deterministic.
const TITLE_ACCEPTED_POLLS = 12;
const TITLE_POLL_INTERVAL_MS = 250;

// Rednote's 社區公約 2.0 asks a creator to declare AI involvement, and every
// episode here carries an LLM-written script over synthesized narration. The
// control is a `d-select` whose options are in the DOM but hidden until the
// placeholder is clicked; selecting one replaces the placeholder with a
// `.d-select-description` carrying the chosen label, which is what proves it
// stuck.
const CONTENT_DECLARATION_SELECTOR = 'text="添加内容类型声明"';
const AI_CONTENT_LABEL = '笔记含AI合成内容';
const AI_CONTENT_OPTION_SELECTOR = `text="${AI_CONTENT_LABEL}"`;
const SELECTED_DECLARATION_SELECTOR = '.d-select-description';

// Typing "#" opens a topic suggestion popup rendered outside the editor. Its
// container carries a real id, which is the one stable handle on this form.
const TOPIC_PANEL_ROW_SELECTOR = '#creator-editor-topic-container .item';
const TOPIC_ROW_NAME_SELECTOR = '.name';
// A query that matches nothing still gets one row, offering to create the topic.
// Accepting it makes a brand-new topic with no audience and an empty link, which
// looks like success and delivers nothing — so this class is a rejection, not a
// candidate.
const TOPIC_ROW_NEW_TOPIC_SELECTOR = '.num.newTopic';
// What an accepted suggestion becomes. The same anchor is mirrored into a
// preview region outside the editor, so every read of it is scoped to the editor.
const EDITOR_TOPIC_SELECTOR = 'a.tiptap-topic';

export function createPlaywrightRednotePublisher(input?: {
  onLog?: (message: string) => void;
}): RednotePublisher {
  const log = input?.onLog ?? (() => void 0);
  return {
    async publishRednote(payload) {
      return withRednotePublishPage((page) => publish(page, payload, log));
    },
  };
}

async function publish(
  page: Page,
  input: RednotePublishInput,
  log: (message: string) => void,
): Promise<PublishResult> {
  await step('check_login', async () => {
    if (await isPublisherReady(page)) return;
    throw new Error(
      'Rednote is not logged in for the publisher profile. Run `pnpm social:login` first.',
    );
  });

  log('[rednote] Uploading video');
  await step('upload_video', () =>
    page.locator(UPLOAD_INPUT_SELECTOR).first().setInputFiles(input.videoPath),
  );

  await step('wait_upload_complete', () =>
    page
      .locator(UPLOAD_COMPLETE_SELECTOR)
      .first()
      .waitFor({ state: 'visible', timeout: UPLOAD_TIMEOUT_MS }),
  );
  log('[rednote] Upload complete');

  const body = await step('find_body', () =>
    firstVisible(page, BODY_SELECTORS, EDITOR_TIMEOUT_MS),
  );

  const hashtags = await step('attach_topics', () =>
    attachTopics(page, body, input.hashtags, log),
  );
  if (hashtags.length === 0) {
    throw new SocialPublishError(
      'rednote',
      'attach_topics',
      new Error(
        `None of the ${input.hashtags.length} generated hashtags matched a Rednote topic, so the note would carry no topic at all.`,
      ),
    );
  }
  log(`[rednote] Topics attached: ${hashtags.length}/${input.hashtags.length}`);

  await step('declare_ai_content', () => declareAiContent(page));
  log('[rednote] Declared AI-synthesized content');

  log('[rednote] Filling title');
  const title = await step('find_title', () =>
    firstVisible(page, TITLE_SELECTORS, EDITOR_TIMEOUT_MS),
  );
  await step('fill_title', () => writeTitle(title, input.title.trim(), log));

  log('[rednote] Publishing');
  await step('wait_submit_enabled', () =>
    page
      .locator(SUBMIT_ENABLED_SELECTOR)
      .waitFor({ state: 'visible', timeout: EDITOR_TIMEOUT_MS }),
  );
  await step('publish', () =>
    page
      .locator(PUBLISH_HOST_SELECTOR)
      .locator(PUBLISH_BUTTON_SELECTOR)
      .click(),
  );

  await step('confirm_success', () => waitForPublishSuccess(page));

  return {
    status: 'published',
    publishedAt: new Date().toISOString(),
    hashtags,
    body: '',
    ...(publicPostUrl(page.url()) ? { url: page.url() } : {}),
  };
}

/**
 * Turns each generated hashtag into a real Rednote topic entity, and returns the
 * ones that made it onto the note.
 *
 * A hashtag is never written as literal `#text`: on this platform that is
 * ordinary prose with no topic page behind it, which is what the note used to
 * ship. A tag with no matching topic is removed from the body instead — pressing
 * Escape leaves the typed characters in place, so backspacing them out is what
 * keeps the fallback from reappearing by accident.
 */
async function attachTopics(
  page: Page,
  body: Locator,
  hashtags: readonly string[],
  log: (message: string) => void,
): Promise<string[]> {
  const attached: string[] = [];
  for (const hashtag of hashtags) {
    const tag = hashtag.replace(/^#+/, '').trim();
    if (!tag) continue;
    if (await attachTopic(page, body, tag)) {
      attached.push(tag);
      continue;
    }
    log(`[rednote] topic_not_found: ${tag}`);
  }
  return attached;
}

async function attachTopic(
  page: Page,
  body: Locator,
  tag: string,
): Promise<boolean> {
  // Topic search is script-sensitive and the audience is on the Simplified side:
  // 「宏觀經濟」 and 「宏观经济」 are two different topics, and the Simplified one
  // carried 5.2亿 views against 8.3万 when this was measured. Copy stays
  // Traditional; only the topic query is converted.
  const query = convertTextToZhCN(tag);
  await body.click();
  await moveCaretToEnd(body);
  await page.keyboard.type(`#${query}`, { delay: TOPIC_TYPING_DELAY_MS });

  // The exact-name test has to run against the row's name element: a row's own
  // text is the name concatenated with its view count, which no anchored
  // pattern can match.
  const row = page
    .locator(TOPIC_PANEL_ROW_SELECTOR)
    .filter({
      has: page
        .locator(TOPIC_ROW_NAME_SELECTOR)
        .filter({ hasText: exactTopicName(query) }),
    })
    .filter({ hasNot: page.locator(TOPIC_ROW_NEW_TOPIC_SELECTOR) })
    .first();

  try {
    await row.waitFor({
      state: 'visible',
      timeout: TOPIC_SUGGESTION_TIMEOUT_MS,
    });
    await row.click();
  } catch {
    await discardTypedTopic(page, query);
    return false;
  }

  if (await editorTopics(page).then((names) => names.includes(query))) {
    return true;
  }
  await discardTypedTopic(page, query);
  return false;
}

// `hasText` is a substring match, so 「#支付」 would also select 「#支付产业链」.
// The row renders the name with its leading "#" and nothing else.
function exactTopicName(query: string): RegExp {
  return new RegExp(`^#${escapeRegExp(query)}$`, 'u');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

// Escape closes the suggestion popup but keeps what was typed, as plain text in
// the body. Removing it character by character is what makes a skipped tag
// leave no trace.
async function discardTypedTopic(page: Page, query: string): Promise<void> {
  await page.keyboard.press('Escape');
  // One keystroke per code point, plus the leading "#".
  const typed = Array.from(query).length + 1;
  for (let index = 0; index < typed; index += 1) {
    await page.keyboard.press('Backspace');
  }
}

/**
 * Names of the topics currently in the editor. The same anchor is mirrored into
 * a preview region, so this is deliberately scoped: an unscoped query reports
 * every topic several times.
 */
async function editorTopics(page: Page): Promise<string[]> {
  return page.evaluate(
    ([editorSelector, topicSelector]) =>
      [
        ...document.querySelectorAll(`${editorSelector} ${topicSelector}`),
      ].flatMap((element) => {
        try {
          const topic: unknown = JSON.parse(
            element.getAttribute('data-topic') ?? '{}',
          );
          const name = (topic as { name?: unknown }).name;
          return typeof name === 'string' ? [name] : [];
        } catch {
          return [];
        }
      }),
    ['.tiptap.ProseMirror', EDITOR_TOPIC_SELECTOR] as const,
  );
}

// Clicking the editor is what gives ProseMirror focus, but it puts the caret
// wherever the click landed -- the middle of a multi-paragraph body. Collapsing a
// range over the whole editable afterwards is the only placement independent of
// the body's shape; ProseMirror picks it up from `selectionchange`.
async function moveCaretToEnd(body: Locator): Promise<void> {
  await body.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    (element as HTMLElement).focus();
  });
}

/**
 * Declares the note as containing AI-synthesized content. It fails the publish
 * rather than logging and moving on: the declaration is a claim about the note
 * that only this step can make, and a skipped one is invisible afterwards --
 * exactly the silent failure mode the rest of this publisher is built against.
 */
async function declareAiContent(page: Page): Promise<void> {
  const placeholder = page.locator(CONTENT_DECLARATION_SELECTOR).first();
  await placeholder.scrollIntoViewIfNeeded();
  await placeholder.click();

  const option = page.locator(AI_CONTENT_OPTION_SELECTOR).first();
  await option.waitFor({ state: 'visible', timeout: EDITOR_TIMEOUT_MS });
  await option.click();

  await page
    .locator(SELECTED_DECLARATION_SELECTOR)
    .filter({ hasText: AI_CONTENT_LABEL })
    .first()
    .waitFor({ state: 'visible', timeout: EDITOR_TIMEOUT_MS });
}

/**
 * Writes the title and confirms the SPA actually took it.
 *
 * A write issued just after the topic panel and the declaration select close can
 * land on the input without reaching the model: the DOM value is set, the
 * character counter is not rendered at all, and the note is created with
 * `title: ""`. That failure is invisible to a DOM read-back, which only returns
 * what was just written -- which is why untitled notes shipped for weeks under a
 * check that never went red. Clearing and rewriting fixes it, so each attempt is
 * verified against the counter and the publish fails if the model never agrees.
 */
async function writeTitle(
  field: Locator,
  expected: string,
  log: (message: string) => void,
): Promise<void> {
  let last: TitleAcceptance | undefined;
  for (let attempt = 1; attempt <= TITLE_WRITE_ATTEMPTS; attempt += 1) {
    await field.click();
    await field.fill('');
    await field.fill(expected);
    last = await pollTitleAcceptance(field, expected, log);
    if (last.accepted) return;
  }

  // Line 1 is the human summary: `publicTelegramErrorMessage` forwards only
  // that. The evidence below it reaches stderr and `last_error`, so the next
  // drift in this form diagnoses itself instead of needing another live session.
  throw new Error(
    [
      `Rednote did not accept the title "${expected}" after ${TITLE_WRITE_ATTEMPTS} attempts.`,
      `  dom value: ${JSON.stringify(last?.value ?? null)}`,
      `  counter: ${last?.text === null || last?.text === undefined ? `not found in the field's ${TITLE_CONTAINER_SELECTOR} block` : JSON.stringify(last.text)}`,
    ].join('\n'),
  );
}

interface TitleAcceptance {
  accepted: boolean;
  value: string | null;
  text: string | null;
}

/**
 * Accepts on "the counter exists and is above zero", never on the counter
 * agreeing with our own character count.
 *
 * Rednote weights half-width characters at half a full-width one: the live form
 * counts `AI代理不等於公鏈繁榮？` -- twelve code points -- as `11 / 20`. Demanding
 * equality therefore made every title containing Latin text or digits fail
 * `fill_title` forever, and that step is fatal to the whole release cohort. The
 * counting model was never something this publisher needed to know: the bug the
 * check exists for shows up as an *absent or zero* counter, never as off-by-one.
 * A count that disagrees is logged so a real contract change stays visible.
 *
 * The DOM value is read in the same round trip as the counter, so a re-render
 * cannot tear the pair, and it is what still proves the platform kept the title
 * whole rather than truncating or rewriting it.
 */
async function pollTitleAcceptance(
  field: Locator,
  expected: string,
  log: (message: string) => void,
): Promise<TitleAcceptance> {
  const wanted = Array.from(expected).length;
  let last: TitleAcceptance = { accepted: false, value: null, text: null };

  for (let poll = 0; poll < TITLE_ACCEPTED_POLLS; poll += 1) {
    const probe = await field.evaluate(readTitleField, {
      container: TITLE_CONTAINER_SELECTOR,
      counter: TITLE_COUNTER_SELECTOR,
    });
    const counted = countedTitleCharacters(probe.text);
    last = { accepted: false, value: probe.value, text: probe.text };

    if (probe.value === expected && counted !== null && counted > 0) {
      if (counted !== wanted) {
        log(
          `[rednote] title_count_mismatch: platform counted ${counted}, this side counted ${wanted} ("${probe.text ?? ''}")`,
        );
      }
      return { ...last, accepted: true };
    }
    await field.page().waitForTimeout(TITLE_POLL_INTERVAL_MS);
  }
  return last;
}

/**
 * Reads the field's own value and its counter text in one round trip.
 *
 * Serialized by `Locator.evaluate` and executed in the page, so it has to stay
 * self-contained: no import, no module constant, no call to another function in
 * this file. Every bound arrives through `selectors`. Exported so a test can run
 * this exact traversal against the live form's markup, rather than against a
 * mock that agrees with it by construction.
 */
export function readTitleField(
  element: Element,
  selectors: { container: string; counter: string },
): { value: string | null; text: string | null } {
  const counter = element
    .closest(selectors.container)
    ?.querySelector(selectors.counter);
  return {
    value:
      'value' in element ? String((element as HTMLInputElement).value) : null,
    text: counter?.textContent ?? null,
  };
}

// `null` when the counter is absent, which is how the field renders an empty
// model -- indistinguishable from "0 / 20" for this purpose, and both mean the
// title did not arrive. Parsed here rather than in the page so the pattern lives
// beside the code that depends on it.
export function countedTitleCharacters(text: string | null): number | null {
  // Whitespace is stripped first so the pattern stays anchored and linear.
  const counted = /^(\d+)[/／]\d+$/u.exec((text ?? '').replace(/\s/gu, ''));
  return counted?.[1] === undefined ? null : Number(counted[1]);
}

// Publishing must be confirmed by the page, never by "click did not throw".
async function waitForPublishSuccess(page: Page): Promise<void> {
  try {
    await Promise.any([
      page
        .locator('text="发布成功"')
        .first()
        .waitFor({ state: 'visible', timeout: SUCCESS_TIMEOUT_MS }),
      page.waitForURL((url) => isPublishedUrl(url.href), {
        timeout: SUCCESS_TIMEOUT_MS,
      }),
    ]);
  } catch (error) {
    throw new Error(
      `Rednote did not confirm publish success; still at ${page.url()}`,
      { cause: error },
    );
  }
}

// Success either announces itself or leaves the publish form for the note
// manager. A redirect back to login is not success.
function isPublishedUrl(rawUrl: string): boolean {
  if (publicPostUrl(rawUrl) !== null) return true;
  try {
    const url = new URL(rawUrl);
    return (
      /^creator\.(rednote|xiaohongshu)\.com$/.test(url.hostname) &&
      !url.pathname.startsWith('/publish/publish') &&
      !url.pathname.includes('/login')
    );
  } catch {
    return false;
  }
}

function publicPostUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    const publicHost =
      url.hostname === 'xiaohongshu.com' ||
      url.hostname === 'rednote.com' ||
      url.hostname.endsWith('.xiaohongshu.com') ||
      url.hostname.endsWith('.rednote.com');
    const publicPath = /^\/(?:explore|discovery\/item)\/[^/]+\/?$/.test(
      url.pathname,
    );
    return publicHost && publicPath ? url.href : null;
  } catch {
    return null;
  }
}

async function firstVisible(
  page: Page,
  selectors: readonly string[],
  timeoutMs: number,
): Promise<Locator> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = new Error(
    `None of the expected selectors appeared: ${selectors.join(', ')}`,
  );

  while (Date.now() < deadline) {
    for (const selector of selectors) {
      const locator = page.locator(selector).first();
      try {
        await locator.waitFor({ state: 'visible', timeout: 2_000 });
        return locator;
      } catch (error) {
        lastError = error;
      }
    }
  }
  throw lastError;
}

async function step<T>(name: string, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw new SocialPublishError('rednote', name, error);
  }
}
