begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- 43 episodes ingested between 2026-08-09 and 2026-08-23, verified on
-- 2026-09-05: all three localizations completed, the visual plan completed on
-- podcast-image-visual-plan.v5, and exactly one episode_videos row -- zh-Hant,
-- completed. The ja/en rows were never enqueued, because per-language render
-- lanes only started on 2026-08-24. Restarting them would materialize the two
-- missing lanes and, since v5 no longer matches the deployed visual version,
-- re-plan all three renders; 28 of them have already published their zh-Hant
-- social cohort, so the restart would also re-open a closed release window.
--
-- Both statements are idempotent and match nothing outside production.
update from_fed_to_chain.episode_video_visuals
set abandoned_at = now(),
    abandoned_reason = 'Legacy zh-Hant-only render: ja/en were never rendered and zh-Hant was already released; closed by operator on 2026-09-05'
where abandoned_at is null
  and episode_id in (
    '050f66f7-f1f5-466b-bbfe-efe84294e7ba',
    '06672a93-de96-4545-9976-7985a7094ef0',
    '0db54633-b506-459f-86d8-4efe57b3ba03',
    '13fb7be9-d322-4393-a9a1-1a85303e1885',
    '14038b9a-1781-4870-9d6e-bfe17aa860f1',
    '1668b918-7a0f-4c5c-8d9f-b879a03352ad',
    '18d3bcd8-0d13-4539-822c-7ccc3f587179',
    '1b28640e-4bad-4fd9-9baf-6b021f938f6a',
    '1b4c7b34-2584-4584-bb75-b9dccec9d52a',
    '1ee725ae-5934-44c4-835a-6ff7b7d4d6da',
    '20e917b3-ba2c-4cc4-a9cd-f530d553d8d0',
    '23501136-58bd-4b25-aafd-0ea6e0c48101',
    '32a7eba3-df43-404d-98fe-40688d8f6b04',
    '36224eed-accf-4e43-9096-a49734197274',
    '4e1dac22-1c34-42af-a866-7bd5c58c810c',
    '4e4f446b-e7fd-42c2-9c6a-2ef2a9c9d945',
    '554bb3cd-6da6-4c94-a43f-338d47e64dbd',
    '5c4e8c70-3e66-4894-91d7-15873788d370',
    '68531634-b20d-404d-a3c3-8fd2150d6cce',
    '6b73afdb-edf6-4bf1-9025-ad35fd51dfc9',
    '72eb74b5-6218-4ccc-a0cf-46ea3ff8d39b',
    '740307dc-2238-4e59-966e-7b8a60367328',
    '7e7ec8d8-1407-48b7-8af4-3a8c469bb282',
    '8a64e749-9f62-4118-bd07-821d10d77303',
    '8ad77805-b0e1-4519-8f91-670b41e5a8aa',
    '8f53bc5a-9ed0-4d6e-918c-224fd015e500',
    '92aed5c8-d95e-42d7-bd35-c77b20fa38d8',
    '99a7e9e9-35ee-443e-a561-1fa507684e39',
    '9d2792dd-9d37-4970-b748-d80cf7cc5b25',
    'a2e55bb9-fb42-4b03-afe3-a6ef17d8ad07',
    'a46c6b2a-8eb1-47b6-bef2-a942edc93798',
    'a4f8baf1-3acf-4a7d-8bd9-c395c4f17d95',
    'a53d1b62-deb7-4458-8535-e32caaca42b2',
    'ab927147-d70a-451f-beb5-d2af42b4434d',
    'b386fe8a-2ecc-4549-836b-a36d20a66d0c',
    'c1b8adfe-0dce-4f75-a49e-3ccdfbac03bf',
    'c570aeaa-035d-4427-b94e-bf08c4dec667',
    'cf972cf2-1a0f-48d4-8b56-f7fef2e0814d',
    'd10d5a81-66f6-436b-a173-1dde478fd561',
    'e32d666c-e07e-413a-aa56-378deb196b07',
    'e920b24a-5b74-4c85-a9fb-fe291c1477ab',
    'ed918fb5-d721-400f-9c11-7c9f73bf919f',
    'f93fd836-8dfa-43d6-bac6-9cf04caa9144'
  );

-- The storyboard cuts scenes from the canonical zh-Hant script and sizes the
-- scene count off zh-Hant audio, so a heavily condensed translation can end up
-- with fewer sentences than scenes. This episode has 62 scenes against 46 ja
-- sentences, and proportional alignment refuses to leave a scene without a
-- sentence -- a pure count mismatch that no retry or re-plan can change. Its
-- "successful" en render is untranslated zh-Hant text, so there is nothing to
-- salvage there either.
update from_fed_to_chain.episode_video_visuals
set abandoned_at = now(),
    abandoned_reason = 'ja render cannot align (46 localized sentences < 62 storyboard scenes) and the en localization is untranslated zh-Hant text; closed by operator on 2026-09-05'
where abandoned_at is null
  and episode_id = '67613f01-4532-454b-85fc-4f2a6f06f49b';

commit;
