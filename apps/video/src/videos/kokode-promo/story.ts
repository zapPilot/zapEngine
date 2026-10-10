// The promo's words come from the Kokode story (packages/kokode-story/src), the
// source the landing page, the decks and the clinic film render too. This is
// the only import across the workspace boundary; it re-exports what the promo uses.
export type {
  DisclaimerId,
  InterestId,
  PromoSceneId,
} from '@zapengine/kokode-story';
export { PROMO, PROMO_ORDER } from '@zapengine/kokode-story';
export type { PromoBeatId } from '@zapengine/kokode-story/promo-story';
export { promoStory } from '@zapengine/kokode-story/promo-story';
