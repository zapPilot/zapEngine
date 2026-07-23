-- ============================================================================
-- Migration 025: Permanently retire the unused DefiLlama pool APR dataset
-- ============================================================================
-- No archive is created. Recovery after this migration requires a Supabase
-- database backup. Unknown dependencies or lock contention fail closed.
-- ============================================================================

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

DO $$
DECLARE
  target_table regclass :=
    pg_catalog.to_regclass('alpha_raw.pool_apr_snapshots');
  dependency_names text[];
  matching_job record;
BEGIN
  IF target_table IS NULL THEN
    RAISE NOTICE
      'alpha_raw.pool_apr_snapshots is already absent; nothing to retire';
    RETURN;
  END IF;

  WITH dependencies AS (
    SELECT DISTINCT
      pg_catalog.format(
        'view %I.%I',
        dependent_namespace.nspname,
        dependent_relation.relname
      ) AS dependency_name
    FROM pg_catalog.pg_depend AS dependency
    JOIN pg_catalog.pg_rewrite AS rewrite
      ON rewrite.oid = dependency.objid
    JOIN pg_catalog.pg_class AS dependent_relation
      ON dependent_relation.oid = rewrite.ev_class
    JOIN pg_catalog.pg_namespace AS dependent_namespace
      ON dependent_namespace.oid = dependent_relation.relnamespace
    WHERE dependency.refobjid = target_table
      AND dependent_relation.oid <> target_table

    UNION

    SELECT DISTINCT
      pg_catalog.format(
        'function %I.%I(%s)',
        function_namespace.nspname,
        function_definition.proname,
        pg_catalog.pg_get_function_identity_arguments(
          function_definition.oid
        )
      )
    FROM pg_catalog.pg_proc AS function_definition
    JOIN pg_catalog.pg_namespace AS function_namespace
      ON function_namespace.oid = function_definition.pronamespace
    WHERE function_definition.prokind IN ('f', 'p')
      AND function_namespace.nspname NOT IN ('pg_catalog', 'information_schema')
      AND function_namespace.nspname NOT LIKE 'pg_toast%'
      AND pg_catalog.lower(
      pg_catalog.pg_get_functiondef(function_definition.oid)
      ) LIKE '%pool_apr_snapshots%'

    UNION

    SELECT DISTINCT
      pg_catalog.format(
        'foreign key %I on %s',
        constraint_definition.conname,
        constraint_definition.conrelid::regclass
      )
    FROM pg_catalog.pg_constraint AS constraint_definition
    WHERE constraint_definition.contype = 'f'
      AND constraint_definition.confrelid = target_table

    UNION

    SELECT DISTINCT
      pg_catalog.format(
        'trigger %I',
        trigger_definition.tgname
      )
    FROM pg_catalog.pg_trigger AS trigger_definition
    WHERE trigger_definition.tgrelid = target_table
      AND NOT trigger_definition.tgisinternal

    UNION

    SELECT DISTINCT
      pg_catalog.format(
        'row security policy %I',
        policy_definition.polname
      )
    FROM pg_catalog.pg_policy AS policy_definition
    WHERE policy_definition.polrelid = target_table
  )
  SELECT pg_catalog.array_agg(dependency_name ORDER BY dependency_name)
  INTO dependency_names
  FROM dependencies;

  IF COALESCE(pg_catalog.cardinality(dependency_names), 0) > 0 THEN
    RAISE EXCEPTION
      'Refusing to drop alpha_raw.pool_apr_snapshots; dependencies: %',
      pg_catalog.array_to_string(dependency_names, ', ');
  END IF;

  IF pg_catalog.to_regclass('cron.job') IS NOT NULL THEN
    FOR matching_job IN EXECUTE $query$
      SELECT jobid, jobname, command
      FROM cron.job
      WHERE position(
        'defillama' IN lower(coalesce(jobname, '') || ' ' || coalesce(command, ''))
      ) > 0
         OR position(
           'pool_apr_snapshots'
           IN lower(coalesce(jobname, '') || ' ' || coalesce(command, ''))
         ) > 0
      ORDER BY jobid
    $query$
    LOOP
      RAISE NOTICE
        'Unscheduling retired DefiLlama cron job % (%)',
        matching_job.jobid,
        matching_job.jobname;
      EXECUTE 'SELECT cron.unschedule($1)' USING matching_job.jobid;
    END LOOP;
  END IF;
END
$$;

-- Intentionally no CASCADE: an unanticipated dependency aborts the migration.
DROP TABLE IF EXISTS alpha_raw.pool_apr_snapshots;
