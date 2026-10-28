-- Migration: 005_rate_limiting.sql
-- Created at: 2025-10-06 06:20:00
-- Description: Adds a table for rate limiting actions like password reset and email verification resend.

CREATE TABLE IF NOT EXISTS rate_limits (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL,
    identifier TEXT NOT NULL, -- Can be user_id, email, or IP address
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_action_identifier_created_at
ON rate_limits (action, identifier, created_at);