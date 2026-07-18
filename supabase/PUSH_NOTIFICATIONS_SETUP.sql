-- VALLE — banco para notificações Web Push
create extension if not exists pgcrypto;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_session_idx on public.push_subscriptions(session_user_id) where enabled;

create table if not exists public.push_delivery_log (
  id bigint generated always as identity primary key,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  vale_id text not null,
  due_date date not null,
  notification_date date not null default current_date,
  kind text not null default 'OVERDUE',
  delivered_at timestamptz not null default now(),
  unique(subscription_id, vale_id, due_date, notification_date, kind)
);

alter table public.push_subscriptions enable row level security;
alter table public.push_delivery_log enable row level security;

drop policy if exists push_subscriptions_select_own on public.push_subscriptions;
create policy push_subscriptions_select_own on public.push_subscriptions for select
to authenticated using (user_id = auth.uid());

drop policy if exists push_subscriptions_insert_own on public.push_subscriptions;
create policy push_subscriptions_insert_own on public.push_subscriptions for insert
to authenticated with check (
  user_id = auth.uid()
  and session_user_id = public.my_session_id()
);

drop policy if exists push_subscriptions_update_own on public.push_subscriptions;
create policy push_subscriptions_update_own on public.push_subscriptions for update
to authenticated using (user_id = auth.uid())
with check (user_id = auth.uid() and session_user_id = public.my_session_id());

drop policy if exists push_subscriptions_delete_own on public.push_subscriptions;
create policy push_subscriptions_delete_own on public.push_subscriptions for delete
to authenticated using (user_id = auth.uid());

-- O log é escrito somente pela Edge Function usando SERVICE_ROLE.
revoke all on public.push_delivery_log from anon, authenticated;
