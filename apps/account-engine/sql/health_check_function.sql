-- Health check function for SELECT 1 test
-- This function can be created in your Supabase database to enable proper SELECT 1 testing

CREATE OR REPLACE FUNCTION select_one()
RETURNS INTEGER
LANGUAGE SQL
STABLE
AS $$
  SELECT 1;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION select_one() TO authenticated;
GRANT EXECUTE ON FUNCTION select_one() TO anon;

-- Comment for documentation
COMMENT ON FUNCTION select_one() IS 'Simple health check function that returns 1, equivalent to SELECT 1';
