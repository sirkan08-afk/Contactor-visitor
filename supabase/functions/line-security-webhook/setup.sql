-- LINE Security Webhook inbox
-- Run once in the Patrol + Work Permit Supabase project (nldoneixnuapuzpeeznl).
-- This creates a separate inbox; it does not modify Patrol, Contractor, Work Permit,
-- or the existing Security Logbook table.

create table if not exists public.line_security_messages (
  id uuid primary key default gen_random_uuid(),
  line_event_id text not null unique,
  line_message_id text not null,
  source_type text not null check (source_type in ('group','room')),
  source_group_id text,
  sender_line_user_id text,
  message_text text not null,
  line_timestamp timestamptz,
  category text not null,
  destination text not null,
  status text not null default 'review_required'
    check (status in ('review_required','auto_saved','ignored','approved','rejected')),
  classification_reason text,
  raw_event jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id)
);

create index if not exists line_security_messages_created_at_idx
  on public.line_security_messages (created_at desc);
create index if not exists line_security_messages_status_idx
  on public.line_security_messages (status, created_at desc);
create index if not exists line_security_messages_category_idx
  on public.line_security_messages (category, line_timestamp desc);

alter table public.line_security_messages enable row level security;
-- Intentionally no client policies. Only the Edge Function service role can write/read
-- until a staff review screen with role-based access is implemented.
