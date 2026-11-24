-- Paso 2: dar de alta al administrador.
-- Antes: crea tu usuario en Supabase → Authentication → Users → Add user → Create new user
--        (tu correo y una contraseña larga que solo tú sepas; marca «Auto Confirm User»).
-- Después: sustituye el correo y ejecuta esto en SQL Editor.

insert into public.admins (user_id)
select id from auth.users where email = 'CAMBIA-ESTO@tu-correo.com'
on conflict do nothing;

-- Comprobación: debe devolver una fila.
select a.user_id, u.email from public.admins a join auth.users u on u.id = a.user_id;
