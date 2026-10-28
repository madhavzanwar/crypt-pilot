-- Migration: 003_email_verification.sql
-- Add email verification support

-- Add email_verified and verification_token columns to users table
ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN verification_token TEXT;
ALTER TABLE users ADD COLUMN verification_token_expires INTEGER;

-- Create index for verification token lookups
CREATE INDEX idx_users_verification_token ON users(verification_token);
