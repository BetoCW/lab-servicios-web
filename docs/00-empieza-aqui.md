# Empieza aquí

Esta guía es para quien llega nuevo a la materia o al equipo. Léela en orden.

## 1. ¿Qué actividad me toca?

El docente indicó que:

- Los equipos con **al menos un integrante que ya llevó clase con él** hacen el **Catálogo de catálogos** (etiquetas → valores). → [`catalogos-api`](../catalogos-api) · guía [02](02-guia-catalogos-api.md)
- Los **demás** hacen **Institutos y Productos/Servicios**. → [`eeducation-api`](../eeducation-api) · guía [03](03-guia-eeducation-api.md)
- Para las actividades de esta unidad se usa **solo MongoDB Atlas**. El **proyecto final** será con **dos motores** (MongoDB y PostgreSQL/Supabase), por eso ya está el esquema SQL en [`database/postgres`](../database/postgres).

Como el Equipo 4 tiene integrantes de los dos casos, el repositorio trae **las dos actividades separadas**.

## 2. Instala las herramientas

| Herramienta | Para qué | Comprobar |
|---|---|---|
| [Node.js 22 LTS](https://nodejs.org) | Ejecutar las APIs | `node -v` |
| [Git](https://git-scm.com) | Clonar y subir cambios | `git --version` |
| [VS Code](https://code.visualstudio.com) | Editor | — |
| [Postman](https://www.postman.com/downloads/) | Probar endpoints | — |
| [MongoDB Compass](https://www.mongodb.com/products/compass) (opcional) | Ver la base de datos | — |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) (opcional) | Mongo y Postgres locales | `docker -v` |

## 3. Orden de lectura

1. [01 · MongoDB Atlas desde cero](01-mongodb-atlas.md)
2. [02 · Guía catalogos-api](02-guia-catalogos-api.md) **o** [03 · Guía eeducation-api](03-guia-eeducation-api.md)
3. [04 · Flujo de trabajo en Git (ramas del equipo)](04-flujo-git.md)
4. [05 · Bases de datos locales con Docker y PostgreSQL](05-bases-locales-docker.md)
5. [06 · Diseño de datos (modelos y esquemas)](06-diseno-de-datos.md)

## 4. Errores comunes

| Síntoma | Causa probable | Solución |
|---|---|---|
| `Falta CONNECTION_STRING en el archivo .env` | No copiaste `.env.example` a `.env` | `cp .env.example .env` y llénalo |
| `querySrv ENOTFOUND` / timeout al conectar | Tu IP no está permitida en Atlas o no hay internet | Atlas → *Network Access* → agrega tu IP |
| `bad auth : authentication failed` | Usuario o contraseña del **usuario de base de datos** incorrectos | Atlas → *Database Access* |
| `EADDRINUSE :3020` | Ya tienes el servidor corriendo en otra terminal | Ciérralo o cambia `PORT` en `.env` |
| `Cannot use import statement outside a module` | Ejecutaste `node src/index.js` en vez de `npm run dev` | Usa `npm run dev` (Babel) |
| 409 al crear | Ya existe ese `key` / `IdInstitutoOK` / `IdProdServOK` | Usa otro identificador |
