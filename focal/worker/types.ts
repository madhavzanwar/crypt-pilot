// Backend Type Definitions for Focal Finance Tracker

export interface Env {
    DB: D1Database;
    ASSETS?: Fetcher; // Optional in development (Vite serves frontend)
    JWT_SECRET: string;
    ENCRYPTION_KEY: string;
    NODE_ENV: string;
    BREVO_API_KEY?: string; // Optional: Brevo API key for sending transactional emails
    APP_URL?: string; // Optional: Application URL for email links (defaults to localhost in dev)
    ADMIN_EMAIL?: string; // Optional: Email address with admin access

    // AI Provider Configuration
    AI_PROVIDER?: string; // AI provider to use: 'gemini' | 'openai' | 'nvidia' | 'groq' (defaults to 'gemini')
    AI_MODEL?: string; // Optional: Override default model for the provider

    // AI Provider API Keys (configure the one matching your AI_PROVIDER)
    GEMINI_API_KEY?: string; // For Google Gemini (gemini-2.5-flash, gemini-2.5-pro, etc.)
    GEMINI_API_KEY_2?: string; // Fallback Gemini API key for rate limit/error scenarios
    GITHUB_TOKEN?: string; // For GitHub Models (OpenAI GPT-4o)
    GITHUB_TOKEN_2?: string; // Fallback GitHub token for rate limit/error scenarios
    NVIDIA_API_KEY?: string; // For Nvidia NIM (llama-3.2-90b-vision-instruct)
    NVIDIA_API_KEY_2?: string; // Fallback Nvidia API key for rate limit/error scenarios
    GROQ_API_KEY?: string; // For Groq (llama-3.3-70b-versatile, etc.)
    GROQ_API_KEY_2?: string; // Fallback Groq API key for rate limit/error scenarios

    // Azure Computer Vision (required for Groq provider OCR)
    AZURE_VISION_ENDPOINT?: string; // Azure Computer Vision endpoint
    AZURE_VISION_KEY?: string; // Azure Computer Vision API key
}

export interface User {
    id: string;
    email: string;
    password_hash: string;
    email_verified?: number; // 0 or 1 (SQLite boolean)
    verification_token?: string | null;
    verification_token_expires?: number | null;
    created_at: number;
    updated_at: number;
}

export interface ApiKey {
    id: string;
    user_id: string;
    encrypted_key: string;
    default_currency: string;
    ai_provider?: string; // User's preferred AI provider: 'gemini' | 'openai' | 'nvidia' | 'groq'
    created_at: number;
}

export interface Expense {
    id: string;
    user_id: string;
    merchant: string;
    date: string;
    total: number;
    currency: string;
    category: string;
    created_at: number;
    updated_at: number;
}

export interface LineItem {
    id: string;
    expense_id: string;
    description: string;
    quantity: number;
    price: number;
}

export interface Session {
    id: string;
    user_id: string;
    token: string;
    expires_at: number;
    created_at: number;
}

export interface JWTPayload {
    userId: string;
    email: string;
    iat?: number;
    exp?: number;
}

export interface APIResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
}
