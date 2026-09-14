# 01 · MongoDB Atlas desde cero

MongoDB Atlas es MongoDB administrado en la nube: no instalas nada en tu PC y la API se conecta por internet.

## Paso 1. Crear la cuenta y el cluster gratuito

1. Entra a <https://cloud.mongodb.com> e inicia sesión (Google, GitHub o correo).
2. **Create** → elige el plan **Free (M0)**.
3. Proveedor **AWS** y la región más cercana (por ejemplo `us-east-1` o `us-west-2`).
4. Nombre del cluster, por ejemplo `ClusterLabServWeb`, y **Create Deployment**.

## Paso 2. Usuario de base de datos y acceso por IP

Atlas muestra el asistente *Connect to Cluster*:

1. **Database user**: crea un usuario y contraseña **solo para la base de datos** (no es tu cuenta de Atlas). Guárdalos en un lugar seguro.
2. **Network Access**: agrega tu IP actual. Para trabajar desde varias redes (casa, escuela) puedes usar `0.0.0.0/0` **solo en el cluster de práctica**.

> Nunca pongas este usuario y contraseña en el código, en capturas del reporte o en el chat del grupo. Van únicamente en tu archivo `.env`.

## Paso 3. Obtener la connection string

1. **Connect → Drivers → Node.js**.
2. Copia la cadena con este formato:

   ```
   mongodb+srv://<usuario>:<password>@<cluster>.xxxxx.mongodb.net/?appName=<AppName>
   ```

3. Pégala en `CONNECTION_STRING` de tu `.env`. Si tu contraseña tiene caracteres especiales (`@ : / ? #`), codifícalos (`@` → `%40`).

No hace falta crear la base de datos ni las colecciones a mano: Mongoose las crea en la primera inserción (o al correr `npm run seed`).

## Paso 4. Comprobar la conexión

```bash
cd catalogos-api
npm install
npm run seed
```

Debes ver `DB conectada a: CatalogosDB` y la lista de catálogos insertados.

## Paso 5. Ver los datos

- **Atlas web**: *Data Explorer* (o *Browse Collections*) → `CatalogosDB` → `catalogs`.
- **MongoDB Compass**: *New connection* → pega la misma connection string.

## Bases de datos que usa este repositorio

| Base de datos | Colecciones | Proyecto |
|---|---|---|
| `CatalogosDB` | `catalogs` | catalogos-api |
| `eEducationDB` | `Institutos`, `ProdServ` | eeducation-api |

## Si una contraseña se filtró

*Database Access* → usuario → **Edit** → **Edit Password** → actualiza el `.env` de todos los que usen ese usuario.
