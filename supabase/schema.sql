
-- VALLE - Estrutura multiusuário Supabase
create extension if not exists pgcrypto;

do $$ begin
  create type public.user_role as enum ('admin','session','service');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  role public.user_role not null,
  session_user_id uuid references public.profiles(id) on delete cascade,
  created_by uuid references public.profiles(id),
  active boolean not null default true,
  valid_until date,
  admin_whatsapp text,
  user_theme text not null default 'auto' check (user_theme in ('auto','light','dark')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_requires_session check (role <> 'service' or session_user_id is not null)
);
create index if not exists profiles_session_idx on public.profiles(session_user_id);

create table if not exists public.service_permissions (
 service_user_id uuid primary key references public.profiles(id) on delete cascade,
 session_user_id uuid not null references public.profiles(id) on delete cascade,
 can_view_dashboard boolean not null default true,
 can_create_client boolean not null default true,
 can_edit_client boolean not null default true,
 can_delete_client boolean not null default false,
 can_create_vale boolean not null default true,
 can_edit_vale boolean not null default true,
 can_delete_vale boolean not null default false,
 can_receive_payment boolean not null default true,
 can_view_history boolean not null default true,
 can_view_reports boolean not null default true,
 can_manage_backup boolean not null default false,
 can_change_settings boolean not null default false,
 can_view_session_data boolean not null default false,
 updated_at timestamptz not null default now()
);


-- Configurações financeiras individuais de cada usuário de serviço.
alter table public.service_permissions add column if not exists interest_percent numeric not null default 30;
alter table public.service_permissions add column if not exists late_fee_type text not null default 'percentual';
alter table public.service_permissions add column if not exists late_fee_value numeric not null default 0;
alter table public.service_permissions drop constraint if exists service_permissions_late_fee_type_check;
alter table public.service_permissions add constraint service_permissions_late_fee_type_check check (late_fee_type in ('percentual','reais'));

create table if not exists public.workspace_states (
 service_user_id uuid primary key references public.profiles(id) on delete cascade,
 session_user_id uuid not null references public.profiles(id) on delete cascade,
 data jsonb not null default '{"settings":{},"clientes":[],"vales":[]}'::jsonb,
 updated_at timestamptz not null default now()
);
create index if not exists workspace_session_idx on public.workspace_states(session_user_id);

alter table public.profiles enable row level security;
alter table public.service_permissions enable row level security;
alter table public.workspace_states enable row level security;

create or replace function public.my_role() returns public.user_role language sql stable security definer set search_path=public as $$select role from public.profiles where id=auth.uid()$$;
create or replace function public.my_session_id() returns uuid language sql stable security definer set search_path=public as $$select case when role='session' then id when role='service' then session_user_id else null end from public.profiles where id=auth.uid()$$;

-- Perfis: o próprio usuário lê o perfil; sessão lê seus serviços; ADM lê a hierarquia de usuários.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (
 id=auth.uid() or
 (public.my_role()='session' and (session_user_id=auth.uid() or id=auth.uid())) or
 (public.my_role()='service' and (id=auth.uid() or id=public.my_session_id())) or
 public.my_role()='admin'
);
-- Alterações de perfis são feitas apenas pela Edge Function com service_role.

-- Permissões: sessão administra seus serviços; serviço lê as próprias permissões.
drop policy if exists permissions_select on public.service_permissions;
create policy permissions_select on public.service_permissions for select to authenticated using (
 service_user_id=auth.uid() or (public.my_role()='session' and session_user_id=auth.uid())
);
drop policy if exists permissions_insert on public.service_permissions;
create policy permissions_insert on public.service_permissions for insert to authenticated with check (
 public.my_role()='session' and session_user_id=auth.uid()
);
drop policy if exists permissions_update on public.service_permissions;
create policy permissions_update on public.service_permissions for update to authenticated using (
 public.my_role()='session' and session_user_id=auth.uid()
) with check (public.my_role()='session' and session_user_id=auth.uid());

-- Dados financeiros: serviço acessa só o próprio; sessão pode ler dados dos seus serviços; ADM não acessa.
drop policy if exists workspace_select on public.workspace_states;
create policy workspace_select on public.workspace_states for select to authenticated using (
 service_user_id=auth.uid() or (public.my_role()='session' and session_user_id=auth.uid())
);
drop policy if exists workspace_insert on public.workspace_states;
create policy workspace_insert on public.workspace_states for insert to authenticated with check (
 public.my_role()='service' and service_user_id=auth.uid() and session_user_id=public.my_session_id()
);
drop policy if exists workspace_update on public.workspace_states;
create policy workspace_update on public.workspace_states for update to authenticated using (
 public.my_role()='service' and service_user_id=auth.uid()
) with check (service_user_id=auth.uid() and session_user_id=public.my_session_id());

-- Depois de criar o primeiro usuário no Supabase Auth, promova-o manualmente:
-- insert into public.profiles(id,name,email,role,active)
-- values ('UUID_DO_USUARIO','Administrador','admin@exemplo.com','admin',true);


-- Atualização segura das funções auxiliares e da política de perfis.
-- Pode ser executada novamente em projetos já configurados.
create or replace function public.my_role()
returns public.user_role
language sql stable security definer set search_path=public
as $$ select role from public.profiles where id=auth.uid() $$;

create or replace function public.my_session_id()
returns uuid
language sql stable security definer set search_path=public
as $$
  select case when role='session' then id when role='service' then session_user_id else null end
  from public.profiles where id=auth.uid()
$$;

comment on column public.workspace_states.data is
'Banco completo do usuário de serviço: configurações, clientes, vales, pagamentos, observações e histórico.';


-- ================================================================
-- BANCO COMPARTILHADO POR SESSÃO
-- Cada sessão possui exatamente um conjunto de clientes, vales, histórico,
-- pagamentos e configurações, compartilhado por todos os usuários de serviço.
-- Sessões diferentes permanecem totalmente isoladas.
-- ================================================================
create table if not exists public.session_workspaces (
  session_user_id uuid primary key references public.profiles(id) on delete cascade,
  updated_by uuid references public.profiles(id) on delete set null,
  data jsonb not null default '{"settings":{},"clientes":[],"vales":[]}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.session_workspaces enable row level security;

drop policy if exists session_workspace_select on public.session_workspaces;
create policy session_workspace_select
on public.session_workspaces
for select
to authenticated
using (
  session_user_id = public.my_session_id()
  and public.my_role() in ('session','service')
);

drop policy if exists session_workspace_insert on public.session_workspaces;
create policy session_workspace_insert
on public.session_workspaces
for insert
to authenticated
with check (
  public.my_role() in ('session','service')
  and session_user_id = public.my_session_id()
  and updated_by = auth.uid()
);

drop policy if exists session_workspace_update on public.session_workspaces;
create policy session_workspace_update
on public.session_workspaces
for update
to authenticated
using (
  public.my_role() in ('session','service')
  and session_user_id = public.my_session_id()
)
with check (
  public.my_role() in ('session','service')
  and session_user_id = public.my_session_id()
  and updated_by = auth.uid()
);

comment on table public.session_workspaces is
'Banco único da sessão, compartilhado entre todos os usuários de serviço vinculados.';

-- Migração automática: em instalações que já usavam workspace_states,
-- copia para cada sessão o registro atualizado mais recentemente.
insert into public.session_workspaces(session_user_id, updated_by, data, updated_at)
select distinct on (w.session_user_id)
  w.session_user_id,
  w.service_user_id,
  w.data,
  w.updated_at
from public.workspace_states w
where w.session_user_id is not null
order by w.session_user_id, w.updated_at desc
on conflict (session_user_id) do nothing;


-- Tema individual por usuário. Não faz parte do banco compartilhado da sessão.
alter table public.profiles
  add column if not exists user_theme text not null default 'auto';

alter table public.profiles
  alter column user_theme set default 'auto';

alter table public.profiles drop constraint if exists profiles_user_theme_check;
alter table public.profiles
  add constraint profiles_user_theme_check check (user_theme in ('auto','light','dark'));

create or replace function public.set_my_theme(new_theme text)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if new_theme not in ('auto','light','dark') then
    raise exception 'Tema inválido';
  end if;
  update public.profiles
     set user_theme = new_theme, updated_at = now()
   where id = auth.uid();
  if not found then raise exception 'Perfil não encontrado'; end if;
  return new_theme;
end;
$$;
revoke all on function public.set_my_theme(text) from public;
grant execute on function public.set_my_theme(text) to authenticated;

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
