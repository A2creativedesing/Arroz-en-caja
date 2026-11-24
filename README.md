# Arroz en Caja · plantilla web con panel de administrador

Plantilla de una web de pedidos para un restaurante: carta por local, carrito, pedido de prueba y un **panel privado para el dueño**. Diseño cobre y crema, pensado para móvil.

**Web:** https://a2creativedesing.github.io/Arroz-en-caja/

## Qué es y qué no es

- Es una **plantilla / prototipo**. El pago es una demostración: no cobra, no pide datos de tarjeta y no avisa a ningún local real.
- La web es HTML, CSS y JavaScript sin servidor. **GitHub Pages solo guarda archivos**, así que el panel necesita un pequeño servidor aparte: aquí se usa [Supabase](https://supabase.com) (plan gratuito).
- Si `config.js` está vacío, la web funciona en **modo demostración** (sin panel, sin guardado) y el enlace «Acceso» no aparece.

## Cómo se protege el panel

- Entra solo el administrador, con **correo + contraseña + código de 6 cifras de una app de autenticador** (como una banca online). El teléfono lo recuerda 14 días si lo marcas.
- La protección está en el **servidor**, no en la página: unas reglas de Row Level Security (`backend/001_arroz_en_caja.sql`) hacen que solo una sesión de administrador con segundo factor pueda leer pedidos o cambiar textos, precios y estados. Un cliente solo puede guardar y leer **su propio pedido**.
- La clave que va en `config.js` es la **«publishable»**: es pública por diseño (cualquiera puede verla en el navegador). Sin las reglas no protegería nada; con ellas solo permite lo que dice el SQL. **Nunca pegues la clave `service_role` o `secret`** en este repositorio.
- Quien vea el código sabrá cómo funciona, pero no puede entrar sin tu contraseña y tu móvil.

## Puesta en marcha (una vez, ~15 minutos)

1. En Supabase crea un proyecto (región en la UE, por ejemplo París o Fráncfort).
2. En **SQL Editor** pega y ejecuta `backend/001_arroz_en_caja.sql`.
3. En **Authentication → Users → Add user → Create new user**: tu correo y una **contraseña larga que solo tú sepas** (marca «Auto Confirm User»).
4. En **SQL Editor** ejecuta `backend/002_alta_admin.sql` cambiando el correo por el tuyo.
5. En **Project Settings → API** copia la *Project URL* y la clave *publishable* y pégalas en `config.js`. Sube el cambio.
6. Recomendado, en **Authentication**: desactiva «Allow new users to sign up», sube la longitud mínima de contraseña a 12 y comprueba que el segundo factor TOTP está activado (los nombres de los ajustes pueden variar).
7. Abre la web → **Acceso** (pie de página) o `admin.html`. La primera vez te enseñará un QR: escanéalo con tu app de autenticador y escribe el código.

## Límites (para ser honestos)

- Los «14 días» de sesión los controla el navegador; si necesitas que el servidor cierre sesiones a la fuerza, hay que activarlo en los ajustes de Supabase (algunas opciones son de pago).
- Cualquiera puede enviar pedidos de prueba a la demo. Hay un freno de 40 por minuto, pero no sustituye a una protección antispam si lo usas en serio.
- Antes de usarla con clientes reales: política de privacidad (RGPD), pagos reales (por ejemplo Stripe Checkout) y copias de seguridad.

## Archivos

| Qué | Dónde |
| --- | --- |
| Página | `index.html`, `styles.css`, `app.js`, `art.js` |
| Textos y carta | `data/site.json`, `data/menu.json` |
| Imágenes e iconos | `img/`, `icons/` |
| Panel del dueño | `admin.html`, `panel/` (también se abre desde «Acceso») |
| Conexión con el servidor | `config.js` (datos públicos), `backend.js` |
| Servidor (Supabase) | `backend/001_arroz_en_caja.sql`, `backend/002_alta_admin.sql` |
| App instalable | `manifest.webmanifest`, `sw.js` |
