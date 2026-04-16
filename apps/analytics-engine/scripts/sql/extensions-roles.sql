CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
DO $$BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='postgres') THEN CREATE ROLE postgres NOLOGIN; END IF; END$$;
DO $$BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='alpha_etl_user') THEN CREATE ROLE alpha_etl_user NOLOGIN; END IF; END$$;
DO $$BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='readonly_user') THEN CREATE ROLE readonly_user NOLOGIN; END IF; END$$;
DO $$BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF; END$$;
DO $$BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; END$$;
DO $$BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF; END$$;
