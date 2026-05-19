create extension if not exists "pgcrypto";

create table if not exists public.script_jobs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'queued',
  current_stage text not null default 'queued',
  brief jsonb not null,
  selected_direction_id text,
  review_status text not null default 'unreviewed',
  human_rating int,
  human_verdict text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

alter table public.script_jobs
  add column if not exists selected_direction_id text,
  add column if not exists review_status text not null default 'unreviewed',
  add column if not exists human_rating int,
  add column if not exists human_verdict text,
  add column if not exists total_input_tokens bigint not null default 0,
  add column if not exists total_output_tokens bigint not null default 0,
  add column if not exists total_cost_usd numeric(10, 6) not null default 0,
  add column if not exists model_name text;

alter table public.script_jobs
  drop constraint if exists script_jobs_human_rating_range;

alter table public.script_jobs
  add constraint script_jobs_human_rating_range
  check (human_rating is null or (human_rating >= 1 and human_rating <= 5));

create table if not exists public.script_job_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.script_jobs(id) on delete cascade,
  stage text not null,
  level text not null default 'info',
  message text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);

alter table public.script_job_events
  add column if not exists payload jsonb,
  add column if not exists input_tokens integer,
  add column if not exists output_tokens integer,
  add column if not exists cost_usd numeric(10, 6),
  add column if not exists model_name text,
  add column if not exists duration_ms integer;

create table if not exists public.script_artifacts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.script_jobs(id) on delete cascade,
  type text not null,
  title text not null,
  content jsonb,
  markdown text,
  created_at timestamptz not null default now()
);

create table if not exists public.script_feedback (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.script_jobs(id) on delete cascade,
  artifact_id uuid references public.script_artifacts(id) on delete set null,
  rating int check (rating between 1 and 5),
  verdict text not null default 'needs_review',
  category text,
  comment text,
  suggested_fix text,
  promote_to_gold boolean not null default false,
  reviewer_name text,
  reviewer_email text,
  created_at timestamptz not null default now()
);

create table if not exists public.script_examples (
  id uuid primary key default gen_random_uuid(),
  project_name text not null,
  client text,
  quality text not null default 'usable',
  source_kind text not null default 'script-only',
  pairing_confidence text not null default 'unknown',
  tags text[] not null default '{}',
  brief_text text,
  script_text text,
  video_notes text,
  teaching_points text[] not null default '{}',
  source_files jsonb not null default '[]'::jsonb,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.script_gold_candidates (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.script_jobs(id) on delete cascade,
  artifact_id uuid references public.script_artifacts(id) on delete set null,
  reviewer_name text,
  reviewer_email text,
  brief_text text not null,
  agent_draft_markdown text,
  final_script_text text not null,
  final_script_filename text,
  final_script_media_type text,
  final_script_base64 text,
  why_gold text,
  what_changed text,
  status text not null default 'pending',
  reviewed_by text,
  reviewed_at timestamptz,
  rejection_reason text,
  promoted_example_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.script_gold_candidates
  drop constraint if exists script_gold_candidates_status_check;
alter table public.script_gold_candidates
  add constraint script_gold_candidates_status_check
  check (status in ('pending', 'approved', 'rejected', 'ingested'));

create index if not exists script_gold_candidates_status_idx
  on public.script_gold_candidates(status, created_at);

create index if not exists script_gold_candidates_job_id_idx
  on public.script_gold_candidates(job_id);

drop trigger if exists script_gold_candidates_touch_updated_at on public.script_gold_candidates;
create trigger script_gold_candidates_touch_updated_at
before update on public.script_gold_candidates
for each row execute function public.touch_script_job_updated_at();

create table if not exists public.script_job_example_usage (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.script_jobs(id) on delete cascade,
  example_key text not null,
  project_name text,
  relevance_score numeric,
  created_at timestamptz not null default now()
);

create index if not exists script_jobs_status_created_at_idx
  on public.script_jobs(status, created_at);

create index if not exists script_artifacts_job_id_created_at_idx
  on public.script_artifacts(job_id, created_at);

create index if not exists script_feedback_job_id_created_at_idx
  on public.script_feedback(job_id, created_at);

create index if not exists script_job_events_cost_idx
  on public.script_job_events(job_id) where cost_usd is not null;

create index if not exists script_examples_quality_status_idx
  on public.script_examples(quality, status);

create index if not exists script_job_example_usage_job_id_idx
  on public.script_job_example_usage(job_id);

create or replace function public.touch_script_job_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists script_jobs_touch_updated_at on public.script_jobs;
create trigger script_jobs_touch_updated_at
before update on public.script_jobs
for each row execute function public.touch_script_job_updated_at();

drop trigger if exists script_examples_touch_updated_at on public.script_examples;
create trigger script_examples_touch_updated_at
before update on public.script_examples
for each row execute function public.touch_script_job_updated_at();

create or replace function public.claim_next_script_job()
returns public.script_jobs
language plpgsql
security definer
as $$
declare
  job public.script_jobs;
begin
  select *
  into job
  from public.script_jobs
  where status = 'queued'
  order by created_at asc
  for update skip locked
  limit 1;

  if not found then
    return null;
  end if;

  update public.script_jobs
  set
    status = 'claimed',
    current_stage = 'claimed',
    started_at = coalesce(started_at, now())
  where id = job.id
  returning * into job;

  return job;
end;
$$;

-- ============================================================================
-- Storage: script-uploads bucket
-- Browser uploads PDFs/images directly here (bypassing Vercel's 4.5MB body
-- limit). The worker downloads them by storagePath when running a job.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'script-uploads',
  'script-uploads',
  false,
  104857600,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp'
  ]
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Anyone with the anon key (gated behind Vercel Password Protection at the
-- pilot URL) can upload to this bucket. Reads are restricted to service role.
drop policy if exists "anon can upload to script-uploads" on storage.objects;
create policy "anon can upload to script-uploads"
  on storage.objects for insert
  to anon
  with check (bucket_id = 'script-uploads');

drop policy if exists "anon can read own session uploads in script-uploads" on storage.objects;
create policy "anon can read own session uploads in script-uploads"
  on storage.objects for select
  to anon
  using (bucket_id = 'script-uploads');

-- Service role bypasses RLS automatically; no policy needed for the worker.
