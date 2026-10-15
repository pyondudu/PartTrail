-- 應付帳款（發票）功能：只「新增」資料表與可為空的欄位，不修改、不刪除任何既有資料。
-- 已在用的資料庫只要在 SQL Editor 執行這一份即可（可重複執行）；內容與 schema.sql 相同部分一致。

create table if not exists public.invoices (
  id            uuid primary key default gen_random_uuid(),
  vendor        text not null,
  quote_no      text,
  invoice_date  date not null,
  invoice_no    text not null,
  amount        numeric not null,  -- 含稅，以發票為準
  items_text    text,              -- 寫進試算表「品項」欄的文字
  pr_no         text,              -- 請購單號
  payment_terms text,              -- 交易條件，例：Net 90days
  pay_method    text,              -- 付款方式，接在預計付款日後（例：匯款）
  pay_due_date  date,              -- 預計付款日
  sheet_row     int,               -- 未使用（保留）
  exported_at   timestamptz,       -- 已貼到試算表的時間
  created_at    timestamptz not null default now()
);

alter table public.items   add column if not exists invoice_id uuid references public.invoices(id) on delete set null;
alter table public.vendors add column if not exists payment_terms text;
create index if not exists items_invoice_idx on public.items (invoice_id);

alter table public.invoices enable row level security;

drop policy if exists "read for members" on public.invoices;
create policy "read for members" on public.invoices
  for select using (public.my_role() in ('editor', 'viewer'));
drop policy if exists "write for editors" on public.invoices;
create policy "write for editors" on public.invoices
  for all using (public.my_role() = 'editor') with check (public.my_role() = 'editor');
