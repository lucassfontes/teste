-- Execute este arquivo no SQL Editor do Supabase.
-- Auditoria detalhada e permanente dos usuários de serviço
create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  session_user_id uuid not null references public.profiles(id) on delete restrict,
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  actor_name text not null,
  actor_role public.user_role not null,
  action text not null,
  module text not null default 'SISTEMA',
  title text not null default 'Ação registrada',
  description text not null default '',
  entity_type text not null,
  entity_id text not null default '',
  client_name text,
  vale_number text,
  old_data jsonb,
  new_data jsonb,
  changes jsonb not null default '{}'::jsonb,
  details jsonb not null default '{}'::jsonb,
  signature text not null,
  created_at timestamptz not null default now()
);
alter table public.audit_logs add column if not exists module text not null default 'SISTEMA';
alter table public.audit_logs add column if not exists title text not null default 'Ação registrada';
alter table public.audit_logs add column if not exists description text not null default '';
alter table public.audit_logs add column if not exists client_name text;
alter table public.audit_logs add column if not exists vale_number text;
alter table public.audit_logs add column if not exists old_data jsonb;
alter table public.audit_logs add column if not exists new_data jsonb;
alter table public.audit_logs add column if not exists changes jsonb not null default '{}'::jsonb;
alter table public.audit_logs add column if not exists signature text;
update public.audit_logs set signature=coalesce(signature, md5(id::text || created_at::text)) where signature is null;
alter table public.audit_logs alter column signature set not null;
create index if not exists audit_logs_session_date_idx on public.audit_logs(session_user_id, created_at desc);
create index if not exists audit_logs_actor_idx on public.audit_logs(actor_user_id);
create index if not exists audit_logs_action_idx on public.audit_logs(action);
create index if not exists audit_logs_module_idx on public.audit_logs(module);
create index if not exists audit_logs_entity_idx on public.audit_logs(entity_type, entity_id);
alter table public.audit_logs enable row level security;
drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs for select to authenticated using (
  actor_user_id=auth.uid() or (public.my_role()='session' and session_user_id=auth.uid())
);
drop policy if exists audit_logs_insert on public.audit_logs;
create policy audit_logs_insert on public.audit_logs for insert to authenticated with check (
  actor_user_id=auth.uid() and session_user_id=public.my_session_id()
);
-- Não existem policies de UPDATE ou DELETE: o histórico é permanente.
comment on table public.audit_logs is 'Histórico imutável e detalhado: criação, edição, exclusão, quitação e pagamentos.';
