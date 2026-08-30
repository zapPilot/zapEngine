-- Durable ingest recovery must never hand an empty/non-HTTP source URL or an
-- empty Telegram chat id back to the pipeline. Keep any pre-existing poison
-- rows for diagnosis, but make them terminal so recovery cannot reclaim them.
update from_fed_to_chain.podcast_ingest_jobs
set
  status = 'failed',
  lease_owner = null,
  lease_expires_at = null,
  last_error = coalesce(
    nullif(btrim(last_error), ''),
    'Invalid durable ingest job envelope'
  ),
  updated_at = now()
where status <> 'failed'
  and (
    btrim(source_url) = ''
    or source_url !~* '^https?://[^[:space:]]+$'
    or btrim(telegram_chat_id) = ''
  );

alter table from_fed_to_chain.podcast_ingest_jobs
  add constraint podcast_ingest_jobs_source_url_http_check
    check (
      status = 'failed'
      or source_url ~* '^https?://[^[:space:]]+$'
    ),
  add constraint podcast_ingest_jobs_telegram_chat_id_nonempty_check
    check (
      status = 'failed'
      or btrim(telegram_chat_id) <> ''
    );
