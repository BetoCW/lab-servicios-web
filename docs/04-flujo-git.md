# 04 · Flujo de trabajo en Git

## Ramas

- `main`: versión estable que se entrega. **Nadie hace push directo a `main`.**
- Una rama por integrante:

| Rama | Integrante |
|---|---|
| `ocegueda-antony` | Antony Daniel Ocegueda Ruelas |
| `perez-kevin` | Kevin Alberto Pérez Solís |
| `garcia-edgar` | Edgar Daniel García Vázquez |
| `garnica-gustavo` | Gustavo Adolfo Garnica Talavera |
| `cardenas-samir` | Samir Adrián Cárdenas Gámez |
| `camarena-jose` | José Alfredo Camarena Martínez |
| `castellanos-edwin` | Edwin Uriel Castellanos Machuca |

## Primera vez

```bash
git clone https://github.com/BetoCW/lab-servicios-web.git
cd lab-servicios-web
git switch perez-kevin          # tu rama
git config user.name "Tu Nombre"
git config user.email "tu-correo@ejemplo.com"
```

## Cada vez que trabajes

```bash
git switch perez-kevin
git pull origin main            # trae lo último de main a tu rama
# ... programas ...
git add .
git commit -m "feat(catalogos): valida parentId al mover valores"
git push origin perez-kevin
```

Luego en GitHub: **Compare & pull request** → base `main` ← compare `tu-rama` → describe qué hiciste → *Create pull request*. Otro integrante revisa y hace *Merge*.

## Mensajes de commit

Formato corto `tipo(alcance): qué hiciste`:

| Tipo | Cuándo |
|---|---|
| `feat` | Funcionalidad nueva |
| `fix` | Corrección de error |
| `docs` | Documentación |
| `refactor` | Reorganizar código sin cambiar comportamiento |
| `chore` | Dependencias, configuración |

## Reglas del equipo

1. **Nunca** agregues un `.env` (el `.gitignore` ya lo impide; no uses `git add -f`).
2. Antes de abrir un PR, corre `npm run dev` y prueba tus endpoints en Postman.
3. Si hay conflicto al hacer `git pull origin main`, resuélvelo en VS Code (*Accept Current / Incoming / Both*), prueba y vuelve a hacer commit.
