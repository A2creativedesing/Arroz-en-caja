-- Arroz en Caja · servidor del panel (Supabase / Postgres)
-- Qué crea:
--   · public.admins  : quién es administrador (se rellena a mano, ver 002_alta_admin.sql)
--   · public.docs    : textos, carta, estados, pedidos y mensajes (una fila por documento)
--   · app.is_admin() : true solo si el usuario está en admins Y entró con contraseña + código del autenticador (aal2)
--   · visitor_get / visitor_save : lo único que pueden hacer los clientes sin cuenta (su propio pedido)
-- Seguridad: todo está protegido con Row Level Security. La clave "publishable" que lleva la web es pública
-- por diseño; sin las reglas de abajo no protegería nada, con ellas solo permite lo que ves aquí.

create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to anon, authenticated;

-- ---------------------------------------------------------------- administradores
create table if not exists public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;
grant select on public.admins to authenticated;
drop policy if exists admins_self_read on public.admins;
create policy admins_self_read on public.admins
  for select to authenticated using (user_id = (select auth.uid()));

-- Administrador de verdad = está en admins Y la sesión es aal2 (contraseña + código del autenticador).
create or replace function app.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins a where a.user_id = (select auth.uid()))
     and coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2';
$$;
revoke all on function app.is_admin() from public;
grant execute on function app.is_admin() to anon, authenticated;

-- ---------------------------------------------------------------- documentos
create table if not exists public.docs (
  path       text primary key,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint docs_path_ok check (path ~ '^[a-z][a-z0-9_-]{0,30}(/[^/[:space:]]{1,100}){1,2}$'),
  constraint docs_size_ok check (octet_length(data::text) <= 400000)
);
alter table public.docs enable row level security;
revoke all on public.docs from anon, authenticated;
grant select on public.docs to anon, authenticated;
grant insert, update, delete on public.docs to authenticated;

create or replace function app.touch()
returns trigger language plpgsql
set search_path = ''
as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists docs_touch on public.docs;
create trigger docs_touch before insert or update on public.docs
  for each row execute function app.touch();

drop policy if exists docs_public_read   on public.docs;
drop policy if exists docs_admin_read    on public.docs;
drop policy if exists docs_admin_insert  on public.docs;
drop policy if exists docs_admin_update  on public.docs;
drop policy if exists docs_admin_delete  on public.docs;

-- Lo que ve cualquier visitante: textos de la web, estados de pedido (solo id -> estado) y carta.
create policy docs_public_read on public.docs
  for select to anon, authenticated
  using (path in ('site/config', 'site/order-status') or path like 'menu/%');
-- Todo lo demás (pedidos, mensajes, solicitudes, registros) y toda escritura: solo el administrador con 2º factor.
create policy docs_admin_read   on public.docs for select to authenticated using ((select app.is_admin()));
create policy docs_admin_insert on public.docs for insert to authenticated with check ((select app.is_admin()));
create policy docs_admin_update on public.docs for update to authenticated using ((select app.is_admin())) with check ((select app.is_admin()));
create policy docs_admin_delete on public.docs for delete to authenticated using ((select app.is_admin()));

-- ---------------------------------------------------------------- clientes sin cuenta
-- Cada navegador lleva un identificador aleatorio largo (no adivinable). Solo puede leer y escribir
-- sus propios pedidos/solicitudes, y leer los mensajes que el local le escribe. Nada más.
create or replace function public.visitor_get(p_kind text, p_uid text)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if p_kind not in ('orders', 'msgs', 'leads') or p_uid is null or p_uid !~ '^[A-Za-z0-9_-]{16,64}$' then
    return null;
  end if;
  return (select d.data from public.docs d where d.path = p_kind || '/' || p_uid);
end $$;

create or replace function public.visitor_save(p_kind text, p_uid text, p_data jsonb)
returns void
language plpgsql volatile security definer
set search_path = ''
as $$
declare n integer;
begin
  if p_kind is null or p_kind not in ('orders', 'leads') then raise exception 'tipo no permitido' using errcode = '22023'; end if;
  if p_uid is null or p_uid !~ '^[A-Za-z0-9_-]{16,64}$' then raise exception 'identificador no válido' using errcode = '22023'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object'
     or coalesce(jsonb_typeof(p_data -> 'items'), '') <> 'array'
     or jsonb_array_length(p_data -> 'items') > 30
     or octet_length(p_data::text) > 120000 then
    raise exception 'datos no válidos' using errcode = '22023';
  end if;
  -- freno global contra inundaciones: como mucho 40 escrituras de clientes por minuto y tipo
  select count(*) into n from public.docs d
   where d.path like p_kind || '/%' and d.updated_at > now() - interval '1 minute';
  if n >= 40 then raise exception 'demasiadas peticiones, inténtalo en un minuto' using errcode = '54000'; end if;
  insert into public.docs (path, data)
  values (p_kind || '/' || p_uid, jsonb_build_object('items', p_data -> 'items'))
  on conflict (path) do update set data = excluded.data;
end $$;

revoke all on function public.visitor_get(text, text)        from public;
revoke all on function public.visitor_save(text, text, jsonb) from public;
grant execute on function public.visitor_get(text, text)        to anon, authenticated;
grant execute on function public.visitor_save(text, text, jsonb) to anon, authenticated;
