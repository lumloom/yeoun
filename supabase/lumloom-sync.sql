-- Lumloom 앱 공용 동기화 스키마
-- Supabase SQL Editor에서 프로젝트당 한 번 실행합니다.

create table if not exists public.lumloom_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  app text not null,
  entity_type text not null,
  entity_id text not null,
  payload jsonb not null default '{}'::jsonb,
  version bigint not null default 1 check (version > 0),
  status text not null default 'active' check (status in ('active', 'deleted')),
  client_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, app, entity_type, entity_id)
);

alter table public.lumloom_records enable row level security;

revoke all on table public.lumloom_records from anon, authenticated;
grant select, insert, update, delete on table public.lumloom_records to authenticated;

drop policy if exists "lumloom_records_select_own" on public.lumloom_records;
create policy "lumloom_records_select_own"
  on public.lumloom_records for select
  using (auth.uid() = user_id);

drop policy if exists "lumloom_records_insert_own" on public.lumloom_records;
create policy "lumloom_records_insert_own"
  on public.lumloom_records for insert
  with check (auth.uid() = user_id);

drop policy if exists "lumloom_records_update_own" on public.lumloom_records;
create policy "lumloom_records_update_own"
  on public.lumloom_records for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "lumloom_records_delete_own" on public.lumloom_records;
create policy "lumloom_records_delete_own"
  on public.lumloom_records for delete
  using (auth.uid() = user_id);

create or replace function public.set_lumloom_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_lumloom_records_updated_at on public.lumloom_records;
create trigger set_lumloom_records_updated_at
before update on public.lumloom_records
for each row execute function public.set_lumloom_updated_at();

insert into storage.buckets (id, name, public)
values ('lumloom-assets', 'lumloom-assets', false)
on conflict (id) do update set public = false;

drop policy if exists "lumloom_assets_select_own" on storage.objects;
create policy "lumloom_assets_select_own"
  on storage.objects for select
  using (
    bucket_id = 'lumloom-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "lumloom_assets_insert_own" on storage.objects;
create policy "lumloom_assets_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'lumloom-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "lumloom_assets_update_own" on storage.objects;
create policy "lumloom_assets_update_own"
  on storage.objects for update
  using (
    bucket_id = 'lumloom-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'lumloom-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "lumloom_assets_delete_own" on storage.objects;
create policy "lumloom_assets_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'lumloom-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
