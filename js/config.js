// Supabase connection. The publishable key is meant to be public
// (access is governed by the row-level-security policies in supabase/schema.sql).
// Leave both empty to fall back to local same-device mode.
export const SUPABASE_URL = 'https://dzocbkqenbfugynhbhby.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_p91ewJf5csKB0J7F2eBQug_AjfO1mhb';

// SHA-256 of the admin-host password (the password itself is in .admin-pass, not committed).
// Client-side gate only — real protection comes with server-side auth.
export const ADMIN_PASS_SHA256 = 'b375c23a606796d25ec3aec13e39692de00a738ce56af48466db53cfd93619d5';
