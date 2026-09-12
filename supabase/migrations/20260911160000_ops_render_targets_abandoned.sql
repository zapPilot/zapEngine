-- Expose the abandonment decision to the operator read model. Both retry RPCs
-- refuse an abandoned episode before their release fence, so a failed render on
-- one can never be requeued; without this column Control Center cannot tell that
-- apart from a render still waiting for an operator.
create or replace function from_fed_to_chain.ops_render_targets(p_localization_id uuid default null)
returns jsonb language sql security definer set search_path = '' stable as $$
  select coalesce(jsonb_agg(to_jsonb(r)), '[]') from (
    select v.episode_id as "episodeId", v.episode_localization_id as "localizationId",
      v.status as "renderStatus", v.completed_at as "renderCompletedAt", v.lease_expires_at as "renderLeaseExpiresAt",
      c.status as "visualStatus", c.visual_version as "visualVersion",
      c.abandoned_at as "abandonedAt",
      from_fed_to_chain.podcast_deployment_claims_open() as "deploymentOpen"
    from from_fed_to_chain.episode_videos v
    left join from_fed_to_chain.episode_video_visuals c on c.episode_id=v.episode_id
    where p_localization_id is null or v.episode_localization_id=p_localization_id
    order by (v.status='failed') desc, v.updated_at desc limit 100) r;
$$;
revoke all on function from_fed_to_chain.ops_render_targets(uuid) from public,anon,authenticated;
grant execute on function from_fed_to_chain.ops_render_targets(uuid) to service_role;
