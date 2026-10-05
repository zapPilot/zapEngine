import { LOCALES } from '../story/locales';
export const MEDIA_BASE = 'https://media.kokode.xyz';
export const RENDER_COMMAND =
  'pnpm sales:render kokode && pnpm sales:publish kokode';
export const artifacts = Object.fromEntries(
  LOCALES.flatMap((locale) =>
    [
      {
        id: `film.${locale}`,
        file: `../video/out/kokode-clinic/kokode-clinic.${locale}.mp4`,
        object: `kokode-clinic.${locale}.mp4`,
        contentType: 'video/mp4' as const,
      },
      {
        id: `poster.${locale}`,
        file: `../video/out/kokode-clinic/kokode-clinic.${locale}.poster.jpg`,
        object: `kokode-clinic.${locale}.poster.jpg`,
        contentType: 'image/jpeg' as const,
      },
      {
        id: `doctorDeck.${locale}`,
        file: `output/kokode-pitch.${locale}.pdf`,
        object: `kokode-pitch.${locale}.pdf`,
        contentType: 'application/pdf' as const,
        disposition: 'attachment',
      },
      {
        id: `partnerDeck.${locale}`,
        file: `output/kokode-pitch-partner.${locale}.pdf`,
        object: `kokode-pitch-partner.${locale}.pdf`,
        contentType: 'application/pdf' as const,
        disposition: 'attachment',
      },
    ].map((entry) => [
      entry.id,
      {
        disposition: undefined as string | undefined,
        ...entry,
        renderCommand: RENDER_COMMAND,
      },
    ]),
  ),
);
