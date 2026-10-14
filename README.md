# Literalia

Sitio estático para publicar poemas y reflexiones.

## Estructura

- `index.html`: listado, búsqueda, filtro de favoritos y poema al azar.
- `poema.html`: vista individual de cada poema.
- `contacto.html`: formulario de contacto preparado para un endpoint externo.
- `poemas.txt`: fuente de contenido.
- `poems.js`: utilidades compartidas para cargar poemas, generar ids, buscar, copiar y guardar favoritos.
- `app.js`: lógica del listado.
- `poema.js`: lógica de la vista individual.
- `contacto.js`: lógica del formulario.
- `styles.css`: estilos globales.
- `legacy/`: versiones antiguas conservadas como referencia.

## Ejecutar localmente

El sitio usa `fetch()` para leer `poemas.txt`, por eso debe abrirse desde un servidor local o desde hosting.

Con Node instalado:

```bash
npx serve .
```

También puedes usar cualquier servidor estático equivalente.

## Agregar poemas

Cada entrada en `poemas.txt` usa este formato:

```txt
title: Título del poema
author: Autor: IF-
year: 2026
tags: Poema, Reflexión

Contenido del poema...

---
```

## Contacto

El formulario está listo para usar un servicio externo como Formspree. Para activarlo, coloca el endpoint real en `data-endpoint` dentro de `contacto.html`.

## Analítica local

El sitio incluye un tracking ligero para servidores con PHP:

- `analytics.js` envía eventos de visita.
- `track.php` recibe eventos y escribe archivos fuera del sitio público, en `/var/log/literalia-analytics`.
- `/var/log/literalia-analytics/events.log` guarda cada evento en formato JSON por línea.
- `/var/log/literalia-analytics/summary.txt` muestra un resumen fácil de leer por SSH.
- `/var/log/literalia-analytics/summary.json` conserva los conteos estructurados.

Los archivos generados quedan fuera del repositorio para no exponerse por navegador ni sobrescribirse durante actualizaciones automáticas.
