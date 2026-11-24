-- Server-built snapshot of only the corrections selected at approval.
-- Remains intact on registration/email retries; not exposed by company portal DTOs.
alter table public.requests add column approval_email_corrections jsonb not null default '[]'::jsonb check(jsonb_typeof(approval_email_corrections)='array' and jsonb_array_length(approval_email_corrections)<=100);
comment on column public.requests.approval_email_corrections is 'Approved, selected customer-facing before/after correction snapshot for approval email retries.';
