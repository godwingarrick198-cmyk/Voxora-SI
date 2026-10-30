-- Voxora AI initial schema. Apply only to a dedicated Voxora Supabase project.
create extension if not exists pgcrypto;

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  industry text not null default 'other',
  timezone text not null default 'UTC',
  created_at timestamptz not null default now()
);

create table if not exists public.receptionists (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null default 'Nova',
  greeting text not null default 'Thanks for calling. How can I help you today?',
  instructions text not null default '',
  enabled boolean not null default false,
  voice_provider text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  caller_name text,
  phone text,
  email text,
  intent text,
  summary text,
  status text not null default 'new' check (status in ('new','qualified','follow_up','won','lost')),
  follow_up_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.call_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  receptionist_id uuid references public.receptionists(id) on delete set null,
  provider_call_id text,
  caller_phone text,
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer,
  outcome text,
  summary text,
  created_at timestamptz not null default now()
);

alter table public.businesses enable row level security;
alter table public.receptionists enable row level security;
alter table public.leads enable row level security;
alter table public.call_logs enable row level security;

create policy "Owners manage their businesses" on public.businesses
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "Owners manage their receptionists" on public.receptionists
  for all using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()))
  with check (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()));
create policy "Owners manage their leads" on public.leads
  for all using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()))
  with check (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()));
create policy "Owners manage their call logs" on public.call_logs
  for all using (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()))
  with check (exists (select 1 from public.businesses b where b.id = business_id and b.owner_id = auth.uid()));
