-- Stage 1 Voxora browser-demo lead intake. Run only in the dedicated Voxora project.
create table if not exists public.demo_leads (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  caller_name text,
  phone text,
  email text,
  intent text,
  summary text,
  transcript jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.demo_leads enable row level security;
drop policy if exists "Public can submit demo leads" on public.demo_leads;
create policy "Public can submit demo leads" on public.demo_leads
  for insert to anon with check (
    length(business_name) between 1 and 120
    and (caller_name is null or length(caller_name) <= 120)
    and (phone is null or length(phone) <= 40)
    and (email is null or length(email) <= 254)
    and (intent is null or length(intent) <= 300)
    and (summary is null or length(summary) <= 2000)
    and jsonb_typeof(transcript) = 'array'
  );
grant insert on public.demo_leads to anon;
