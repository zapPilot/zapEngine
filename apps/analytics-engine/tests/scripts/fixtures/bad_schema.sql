-- Intentionally broken schema for testing error handling
-- This file contains SQL syntax errors

CREATE TABLE bad_syntax_table (
    id UUID PRIMARY KEY,
    INVALID COLUMN DEFINITION HERE
);

-- Missing semicolon
CREATE TABLE another_bad_table (
    id UUID PRIMARY KEY
)

-- Invalid constraint
CREATE TABLE constraint_error (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES nonexistent_table(id)
);
