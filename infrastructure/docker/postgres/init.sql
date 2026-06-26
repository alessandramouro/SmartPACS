-- SmartPACS - PostgreSQL initialization
-- Enables required extensions

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   -- For fuzzy text search
CREATE EXTENSION IF NOT EXISTS "btree_gin"; -- For GIN index on arrays

-- Enable row-level security (future use for RLS multi-tenancy)
-- ALTER DATABASE smartpacs SET row_security = on;
