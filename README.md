# Arroz en Caja · plantilla web

Plantilla de demostración de una web de pedidos para un restaurante: carta por local, carrito, pedido de prueba y un panel para el dueño. Diseño cobre y crema, pensada para móvil.

**Ver la web:** https://a2creativedesing.github.io/Arroz-en-caja/

## Qué es y qué no es

- Es una **plantilla / prototipo**. El pago es una demostración: no cobra, no pide datos de tarjeta y no envía ningún pedido a nadie.
- Es HTML, CSS y JavaScript sin servidor. No necesita instalar nada.
- El panel del dueño (`admin.html` y la carpeta `panel/`) **solo funciona dentro de Claude** (usa su base de datos y la cuenta del propietario). En esta versión de GitHub Pages queda cerrado y el enlace «Acceso» no aparece.
- Los textos, precios, fotos y el nombre «Arroz en Caja» son del ejemplo. Cámbialos por los tuyos antes de usarla con otro negocio.

## Archivos

| Qué | Dónde |
| --- | --- |
| Página | `index.html`, `styles.css`, `app.js`, `art.js` |
| Textos de la web | `data/site.json` |
| Carta y precios | `data/menu.json` |
| Imágenes e iconos | `img/`, `icons/` |
| Panel del dueño (solo en Claude) | `admin.html`, `panel/`, `manifest.webmanifest`, `sw.js` |

## Usarla como plantilla

1. Pulsa «Use this template» o descarga el repositorio.
2. Cambia `data/site.json` (textos, locales, horarios) y `data/menu.json` (platos y precios).
3. Sustituye las imágenes de `img/` y `icons/`.
4. Súbela a GitHub Pages: Settings → Pages → Deploy from a branch → `main` / raíz.

Para una tienda real hace falta un servidor con pagos (por ejemplo WooCommerce con Stripe) y un panel con acceso protegido. Esta plantilla solo muestra el diseño y el flujo.
