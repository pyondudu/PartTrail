-- 序號庫存：每個序號一列，追蹤在庫／已領用。
-- 序號仍在料件表單填寫（items.serials），由 trigger 自動同步到 serial_units：
--   新增的序號 → 在庫；從料件移除的序號 → 刪除（已領用的不能移除，存檔會被擋下）。
-- 只新增資料表與 trigger，不修改、不刪除 items 既有資料；在 SQL Editor 執行這一份即可（可重複執行）。

create table if not exists public.serial_units (
  id              uuid primary key default gen_random_uuid(),
  item_id         uuid not null references public.items(id) on delete cascade,
  serial          text not null,
  status          text not null default 'in_stock' check (status in ('in_stock', 'issued')),
  issued_to       text,   -- 領用人
  issued_project  text,   -- 領用專案
  issued_date     date,   -- 領用日
  note            text,   -- 備註（退回入庫時保留）
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (item_id, serial)
);
create index if not exists serial_units_status_idx on public.serial_units (status);

create or replace function public.serial_units_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists serial_units_touch on public.serial_units;
create trigger serial_units_touch before update on public.serial_units
  for each row execute function public.serial_units_touch();

-- items.serials（一行一個）→ serial_units
create or replace function public.items_sync_serials()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  s text[];
  blocked text;
begin
  select coalesce(array_agg(distinct btrim(x)), '{}') into s
  from unnest(string_to_array(coalesce(new.serials, ''), E'\n')) x
  where btrim(x) <> '';

  select string_agg(serial, '、') into blocked
  from serial_units where item_id = new.id and status = 'issued' and not (serial = any(s));
  if blocked is not null then
    raise exception '序號已領用，不能從料件移除：%（請先在庫存頁退回入庫）', blocked;
  end if;

  delete from serial_units where item_id = new.id and not (serial = any(s));
  insert into serial_units (item_id, serial)
  select new.id, x from unnest(s) x
  on conflict (item_id, serial) do nothing;
  return null;
end $$;

drop trigger if exists items_sync_serials on public.items;
create trigger items_sync_serials after insert or update of serials on public.items
  for each row execute function public.items_sync_serials();

-- 既有料件的序號全部轉為在庫
insert into public.serial_units (item_id, serial)
select distinct i.id, btrim(x)
from public.items i, unnest(string_to_array(i.serials, E'\n')) x
where i.serials is not null and btrim(x) <> ''
on conflict (item_id, serial) do nothing;

-- RLS：與其他資料表相同（editor 讀寫、viewer 唯讀）
alter table public.serial_units enable row level security;
drop policy if exists "read for members" on public.serial_units;
create policy "read for members" on public.serial_units
  for select using (public.my_role() in ('editor', 'viewer'));
drop policy if exists "write for editors" on public.serial_units;
create policy "write for editors" on public.serial_units
  for all using (public.my_role() = 'editor') with check (public.my_role() = 'editor');
