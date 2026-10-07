-- PartTrail 資料庫結構
-- 在 Supabase Dashboard → SQL Editor 貼上整份執行即可（可重複執行）。

-- ─────────────────────────────────────────────
-- 使用者角色
-- ─────────────────────────────────────────────
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  display_name text,
  role         text not null default 'viewer' check (role in ('editor', 'viewer')),
  created_at   timestamptz not null default now()
);

-- 新使用者建立時自動產生 profile（預設 viewer）
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 目前登入者角色（security definer 避免 RLS 遞迴）
create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

-- ─────────────────────────────────────────────
-- 料件
-- status: quoted 已報價 / ordered 已下單（已用印回傳、交期已確認）/ received 已收貨
-- ─────────────────────────────────────────────
create table if not exists public.items (
  id                 uuid primary key default gen_random_uuid(),
  project            text,
  part_name          text not null,
  spec               text,
  qty                numeric,
  unit               text default 'pcs',
  vendor             text not null,
  vendor_contact     text,
  requester          text,
  quote_no           text,
  quote_amount       numeric,
  quote_date         date,
  status             text not null default 'quoted' check (status in ('quoted', 'ordered', 'received')),
  order_date         date,
  due_date           date,
  received_date      date,
  note               text,
  due_change_reason  text,  -- 僅供 trigger 傳遞交期變更原因，寫入後自動清空
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists items_status_due_idx on public.items (status, due_date);

-- 後加欄位（舊資料庫重跑本檔時補上）；專案必填由前端檢查
alter table public.items add column if not exists project text;

create table if not exists public.due_date_history (
  id          bigint generated always as identity primary key,
  item_id     uuid not null references public.items(id) on delete cascade,
  old_due     date,
  new_due     date,
  reason      text,
  changed_at  timestamptz not null default now(),
  changed_by  uuid references auth.users(id)
);
create index if not exists due_date_history_item_idx on public.due_date_history (item_id);

create table if not exists public.status_log (
  id           bigint generated always as identity primary key,
  item_id      uuid not null references public.items(id) on delete cascade,
  from_status  text,
  to_status    text not null,
  changed_at   timestamptz not null default now()
);
create index if not exists status_log_item_idx on public.status_log (item_id);

create table if not exists public.attachments (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null references public.items(id) on delete cascade,
  file_path    text not null,
  file_name    text not null,
  mime         text,
  uploaded_at  timestamptz not null default now()
);
create index if not exists attachments_item_idx on public.attachments (item_id);

-- 廠商清單（新增料件時的下拉選單；items.vendor 存名稱）
create table if not exists public.vendors (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  created_at  timestamptz not null default now()
);

-- 需求人清單（新增料件時的下拉選單；items.requester 存名稱）
create table if not exists public.requesters (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  created_at  timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- Triggers：交期歷史、狀態紀錄、updated_at
-- ─────────────────────────────────────────────
-- 交期變更：前端在 update 時一併送出 due_change_reason，由 BEFORE trigger 寫入歷史後清空。
-- 新增時 due_date_history 的 FK 需要 items 已存在，故 INSERT 的紀錄放在 AFTER trigger。
create or replace function public.items_before_write()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    new.updated_at := now();
    if new.due_date is distinct from old.due_date then
      insert into due_date_history (item_id, old_due, new_due, reason, changed_by)
      values (new.id, old.due_date, new.due_date,
              coalesce(new.due_change_reason, case when old.due_date is null then '初次確認交期' end),
              auth.uid());
    end if;
    new.due_change_reason := null;
  end if;
  return new;
end $$;

create or replace function public.items_after_write()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into status_log (item_id, from_status, to_status) values (new.id, null, new.status);
    if new.due_date is not null then
      insert into due_date_history (item_id, old_due, new_due, reason, changed_by)
      values (new.id, null, new.due_date, coalesce(new.due_change_reason, '初次確認交期'), auth.uid());
      update items set due_change_reason = null where id = new.id and due_change_reason is not null;
    end if;
  elsif new.status is distinct from old.status then
    insert into status_log (item_id, from_status, to_status) values (new.id, old.status, new.status);
  end if;
  return null;
end $$;

drop trigger if exists items_before_write on public.items;
create trigger items_before_write before insert or update on public.items
  for each row execute function public.items_before_write();

drop trigger if exists items_after_write on public.items;
create trigger items_after_write after insert or update on public.items
  for each row execute function public.items_after_write();

-- ─────────────────────────────────────────────
-- RLS：editor 可讀寫；viewer 唯讀；未登入不可存取
-- ─────────────────────────────────────────────
alter table public.profiles         enable row level security;
alter table public.items            enable row level security;
alter table public.due_date_history enable row level security;
alter table public.status_log       enable row level security;
alter table public.attachments      enable row level security;
alter table public.vendors          enable row level security;
alter table public.requesters       enable row level security;

drop policy if exists "profiles self read" on public.profiles;
create policy "profiles self read" on public.profiles
  for select using (id = auth.uid() or public.my_role() = 'editor');

do $$
declare t text;
begin
  foreach t in array array['items', 'due_date_history', 'status_log', 'attachments', 'vendors', 'requesters'] loop
    execute format('drop policy if exists "read for members" on public.%I', t);
    execute format('create policy "read for members" on public.%I for select using (public.my_role() in (''editor'', ''viewer''))', t);
    execute format('drop policy if exists "write for editors" on public.%I', t);
    execute format('create policy "write for editors" on public.%I for all using (public.my_role() = ''editor'') with check (public.my_role() = ''editor'')', t);
  end loop;
end $$;

-- ─────────────────────────────────────────────
-- Storage：私有 bucket「attachments」
-- ─────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

drop policy if exists "attachments read for members" on storage.objects;
create policy "attachments read for members" on storage.objects
  for select using (bucket_id = 'attachments' and public.my_role() in ('editor', 'viewer'));

drop policy if exists "attachments write for editors" on storage.objects;
create policy "attachments write for editors" on storage.objects
  for insert with check (bucket_id = 'attachments' and public.my_role() = 'editor');

drop policy if exists "attachments delete for editors" on storage.objects;
create policy "attachments delete for editors" on storage.objects
  for delete using (bucket_id = 'attachments' and public.my_role() = 'editor');

-- ─────────────────────────────────────────────
-- Realtime：items 異動即時推播
-- ─────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'items'
  ) then
    alter publication supabase_realtime add table public.items;
  end if;
end $$;

-- ─────────────────────────────────────────────
-- 建立帳號後，把自己設為 editor（把 email 換成你的）：
--   update public.profiles set role = 'editor' where email = 'you@example.com';
-- ─────────────────────────────────────────────
