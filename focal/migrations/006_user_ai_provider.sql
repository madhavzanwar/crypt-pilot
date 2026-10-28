-- Migration: 006_user_ai_provider.sql
-- Description: Add AI provider preference to user settings (api_keys table)

-- Add ai_provider column to store user's preferred AI provider
ALTER TABLE api_keys ADD COLUMN ai_provider TEXT DEFAULT 'gemini';

-- Note: The api_keys table is being used as user_settings 
-- (encrypted_key is no longer used but kept for backward compatibility)
