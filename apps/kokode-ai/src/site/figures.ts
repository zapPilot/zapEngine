import { type Story } from '@zapengine/kokode-story/localized';
import type { DemoId } from '@zapengine/kokode-story/ja/demos';
import type { FigureId } from '@zapengine/kokode-story/types';
import { ICONS, SKETCH } from './icons';
import { markup, type Markup } from './markup';

const HARDWARE_ASSETS = [
  { name: 'studio', width: 420, height: 245 },
  { name: 'rack', width: 460, height: 191 },
  { name: 'infra', width: 640, height: 549 },
] as const;

export function createFigures(story: Story) {
  const { CHAT_UI, DEMO_FIGURES, DEMOS, footnote, FIGURES } = story;
  // Diagrams shared by the landing page and the decks. Sizes inside use
  // container-query units (src/styles/figures.css), so one markup scales from a
  // phone column to a 16:9 slide. Labels are real text with a figcaption.

  const steps = (items: readonly string[]): Markup =>
    markup`<ol class="flow-steps">${items.map((item) => markup`<li>${item}</li>`)}</ol>`;

  function beforeAfter(): Markup {
    const { before, after, inside } = FIGURES.beforeAfter;
    return markup`<div class="flow-row is-before">
      <span class="flow-label">${before.label}</span>${steps(before.steps)}
    </div>
    <div class="flow-row is-after">
      <span class="flow-label">${after.label}</span>
      <div class="zone"><span class="zone-label">${inside}</span>${steps(after.steps)}</div>
    </div>`;
  }

  function boundary(): Markup {
    const f = FIGURES.boundary;
    const [pc = '', tablet = ''] = f.devices;
    return markup`<div class="zone bd-inside">
      <span class="zone-label">${f.inside}</span>
      <div class="bd-net">
        <span class="bd-net-label">${ICONS.wifi}${f.network}</span>
        <ul class="bd-devices">
          <li>${ICONS.pc}${pc}</li>
          <li>${ICONS.tablet}${tablet}</li>
        </ul>
        <span class="bd-login">${ICONS.lock}${f.login}</span>
        <span class="bd-server">${ICONS.server}${f.server}</span>
      </div>
      <div class="bd-guest">${ICONS.wifi}${f.guest}<span class="bd-no">${ICONS.blocked}</span></div>
    </div>
    <div class="bd-outside">
      <span class="bd-outside-label">${ICONS.phone}${f.outside}</span>
      <span class="bd-blocked">${ICONS.blocked}${f.blocked}</span>
    </div>`;
  }

  const windowBar = (): Markup =>
    markup`<div class="window-bar"><span class="window-dots" aria-hidden="true"></span><span class="window-address">${DEMOS.chat.address}</span></div>`;

  const userMessage = (text: string): Markup =>
    markup`<p class="msg is-user">${text}</p>`;

  function chatDemo(): Markup {
    const demo = DEMOS.chat;
    return markup`<div class="window">
      ${windowBar()}
      <div class="chat">
        ${userMessage(demo.prompt)}
        <div class="msg is-ai">
          <span class="msg-name">${CHAT_UI.assistant}</span>
          ${demo.reply.map((line) => markup`<span class="msg-line">${line}</span>`)}
        </div>
      </div>
    </div>`;
  }

  function patientDemo(): Markup {
    const demo = DEMOS.patient;
    return markup`<div class="window">
      ${windowBar()}
      <div class="chat">
        <div class="record">
          <span class="card-title">${demo.record.title}</span>
          ${demo.record.lines.map((line) => markup`<span>${line}</span>`)}
        </div>
        ${userMessage(demo.prompt)}
        <div class="msg is-ai is-draft">
          <span class="msg-name">${demo.reply.title}</span>
          ${demo.reply.lines.map((line) => markup`<span class="msg-line">${line}</span>`)}
        </div>
      </div>
    </div>`;
  }

  function imageDemo(): Markup {
    const demo = DEMOS.image;
    const [sketchStep = '', slideStep = ''] = demo.steps;
    return markup`<div class="window">
      ${windowBar()}
      <div class="chat">
        ${userMessage(demo.prompt)}
        <div class="image-flow">
          <div class="image-step">
            <div class="sketch-card" role="img" aria-label="${demo.sketch}">${SKETCH}</div>
            <span class="step-label">${sketchStep}</span>
          </div>
          <span class="image-arrow">${ICONS.arrow}</span>
          <div class="image-step">
            <div class="slide-thumb">
              <span class="slide-thumb-title">${demo.slide.title}</span>
              ${SKETCH}
              <span class="slide-thumb-note">${demo.slide.note}</span>
            </div>
            <span class="step-label">${slideStep}</span>
          </div>
        </div>
      </div>
    </div>`;
  }

  function turnkey(): Markup {
    const { layers, hardwareAlt } = FIGURES.turnkey;
    const last = layers.length - 1;
    return markup`<ol class="stack">${layers.map(
      (layer, index) =>
        markup`<li class="stack-layer">
        <strong>${layer.title}</strong><span>${layer.text}</span>
        ${index === last ? markup`<img class="stack-hardware" src="/assets/studio.webp" alt="${hardwareAlt}" />` : null}
      </li>`,
    )}</ol>`;
  }

  function hardware(): Markup {
    return markup`<ul class="hw">${HARDWARE_ASSETS.map((asset, index) => {
      const size = FIGURES.hardware.sizes[index]!;
      return markup`<li class="${index === 0 ? 'is-start' : ''}"><div class="hw-image"><img src="/assets/${asset.name}.webp" width="${asset.width}" height="${asset.height}" alt="${size.alt}" loading="lazy" decoding="async" /></div><strong>${size.label}</strong><span>${size.note}</span></li>`;
    })}</ul>`;
  }

  function partnerRoles(): Markup {
    const { client, partner, kokode } = FIGURES.partnerRoles;
    const node = (role: { readonly title: string; readonly text: string }) =>
      markup`<div class="role"><strong>${role.title}</strong><span>${role.text}</span></div>`;
    return markup`<div class="roles">
      <div class="roles-team">${node(partner)}<span class="roles-plus" aria-hidden="true">+</span>${node(kokode)}</div>
      <span class="roles-arrow">${ICONS.arrow}</span>
      ${node(client)}
    </div>`;
  }

  const DIAGRAMS: { readonly [Id in FigureId]: () => Markup } = {
    beforeAfter,
    boundary,
    experience: chatDemo,
    demoPatient: patientDemo,
    demoImage: imageDemo,
    turnkey,
    partnerRoles,
    hardware,
  };

  function caption(id: FigureId, demo: DemoId | undefined): string {
    if (demo) return DEMOS[demo].caption;
    const captions: Record<
      Exclude<FigureId, 'experience' | 'demoPatient' | 'demoImage'>,
      string
    > = {
      beforeAfter: FIGURES.beforeAfter.caption,
      boundary: FIGURES.boundary.caption,
      turnkey: FIGURES.turnkey.caption,
      partnerRoles: FIGURES.partnerRoles.caption,
      hardware: FIGURES.hardware.caption,
    };
    if (id === 'experience' || id === 'demoPatient' || id === 'demoImage') {
      throw new Error(`Missing demo caption for ${id}`);
    }
    return captions[id];
  }

  /**
   * A figure with its caption. Demo screens carry `data-demo` and print every
   * disclaimer their demo declares; tests and the PDF export check both.
   */
  function renderFigure(id: FigureId): Markup {
    const demo = DEMO_FIGURES[id];
    const notes = demo ? DEMOS[demo].disclaimers : [];
    return markup`<figure class="fig fig-${id}" data-figure="${id}"${
      demo
        ? markup` data-demo="${demo}" data-disclaimer="${notes.join(' ')}"`
        : null
    }>
    <div class="fig-body">${DIAGRAMS[id]()}</div>
    <figcaption>
      <span class="fig-caption">${caption(id, demo)}</span>
      ${notes.map((note) => markup`<small class="fig-note" data-note="${note}">${footnote(note)}</small>`)}
    </figcaption>
  </figure>`;
  }

  return { renderFigure };
}
