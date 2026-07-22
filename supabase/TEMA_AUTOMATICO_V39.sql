-- VALLE v39 — habilita o tema Automático no Supabase

alter table public.profiles
  add column if not exists user_theme text not null default 'auto';

alter table public.profiles
  alter column user_theme set default 'auto';

alter table public.profiles
  drop constraint if exists profiles_user_theme_check;

alter table public.profiles
  add constraint profiles_user_theme_check
  check (user_theme in ('auto','light','dark'));

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
