-- Migration: 004_reset_password.sql
-- Add password reset support

-- Add reset_token and reset_token_expires columns to users table
ALTER TABLE users ADD COLUMN reset_token TEXT;
ALTER TABLE users ADD COLUMN reset_token_expires INTEGER;

-- Create index for reset token lookups
CREATE INDEX idx_users_reset_token ON users(reset_token);