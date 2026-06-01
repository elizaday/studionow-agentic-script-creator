-- ============================================================================
-- Learning loop schema additions
-- Run after schema.sql. Safe to re-run (uses IF NOT EXISTS / ADD IF NOT EXISTS).
-- ============================================================================

-- 1. Add missing columns to script_examples for full example memory support.
alter table public.script_examples
  add column if not exists script_excerpt text,
  add column if not exists retrieval_text text,
  add column if not exists pairing_type text not null default 'unknown',
  add column if not exists notes text,
  add column if not exists source_gold_candidate_id uuid references public.script_gold_candidates(id) on delete set null;

-- 2. Learning rules table.
-- Accumulated feedback patterns promoted to hard constraints for agent prompts.
-- A rule is active once a curator (or automated process) sets status = 'active'.
create table if not exists public.learning_rules (
  id uuid primary key default gen_random_uuid(),
  rule text not null,
  category text not null default 'general',
  source text not null default 'feedback',
  applies_to text[] not null default '{}',
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.learning_rules.rule is 'The actual instruction, written as a directive the agent must follow.';
comment on column public.learning_rules.category is 'Grouping: voice, structure, runtime, production, tone, data, format, general.';
comment on column public.learning_rules.source is 'Where this rule came from: feedback, gold_review, manual.';
comment on column public.learning_rules.applies_to is 'Which agents this rule applies to. Empty = all agents. Values: planner, writer_producer, writer, critic, formatter.';
comment on column public.learning_rules.status is 'draft = not yet active. active = loaded into prompts. retired = no longer used.';

create index if not exists learning_rules_status_idx
  on public.learning_rules(status);

-- Trigger for updated_at
drop trigger if exists learning_rules_touch_updated_at on public.learning_rules;
create trigger learning_rules_touch_updated_at
before update on public.learning_rules
for each row execute function public.touch_script_job_updated_at();
