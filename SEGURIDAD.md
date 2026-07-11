# Seguridad — estado y plan

Estado tras la auditoría. Lo marcado ✅ ya está en producción; lo demás requiere
un paso tuyo (variable en Vercel / rotar token) y se hace **juntos**, porque ahí
un error tumba la app en vivo.

## ✅ Hecho (autónomo, verificado)

- **S5 — Fuga de datos en el portal del cliente.** El portal hacía `SELECT *`
  sobre `trabajos` y devolvía `telefono_cliente`, `email_cliente` y `firma_cliente`
  a cualquiera que conociera/adivinara una cédula. Ahora pide un `select=`
  explícito solo con las columnas que usa. Verificado en producción: esas 3 ya no
  salen. (`src/pages/PortalCliente.jsx`)
- **S4 — Gasto de nómina con monto negativo.** `api/cuentti-gasto.js` validaba que
  existiera `monto` pero no el signo; un negativo grababa un gasto invertido. Ahora
  rechaza `monto <= 0` con 400. (Sigue faltando auth en ese endpoint → ver S3.)

## 🔴 Pendiente — se hace JUNTOS (necesita variables en Vercel)

La raíz de casi todo es la misma: **la anon key de Supabase está en el bundle y
el RLS está apagado**, así que cualquiera puede leer/escribir las tablas directo,
saltándose cualquier candado que pongamos en los endpoints. Por eso el orden es:

### 1. RLS + service key (la base — arregla S1 y el fondo de S3)
1. En Vercel, agregar `SUPABASE_SERVICE_KEY` (service_role, **solo backend**, nunca en el cliente).
2. Cambiar `api/auth-setup.js`, `api/supabase.js` (proxy) y demás endpoints backend para usar la **service key** en vez de la anon key.
3. Encender **RLS** tabla por tabla empezando por `usuarios` (la más sensible):
   - Política: negar todo a `anon`; permitir solo vía service key (backend).
   - Probar EN STAGING que la app (login, Usuarios, portal, trabajos) sigue
     funcionando antes de tocar producción. El RLS mal puesto deja la app en blanco.
4. Recién con RLS en `usuarios`, el **candado admin a `/api/auth-setup` (S1)** tiene
   sentido: validar en el server que el caller es admin (re-auth con contraseña o
   sesión firmada, ver S6) antes de crear/editar/borrar. Sin RLS, ese candado es
   teatro (se salta con la anon key).

### 2. S2 — Rotar el token de Cuentti
- El token está hardcodeado en `src/services/cuentti.js` (viaja en el bundle).
- **Tú:** generar un token nuevo en Cuentti (el viejo queda comprometido).
- Moverlo a variable de Vercel y hacer que TODAS las llamadas a Cuentti pasen por
  un endpoint backend que lo inyecte (nunca el cliente). El proxy `/api/cuentti`
  ya existe; falta que exija el token del server y no lo acepte del cliente.

### 3. S3 — Proxy `/api/cuentti` y `/api/cuentti-gasto` sin auth
- Hoy cualquiera con la URL puede facturar/anular/gastar.
- Requiere una sesión válida (ver S6) + que el proxy inyecte credenciales del
  server. Va pegado a S2 (mismo endpoint).

### 4. S6 — Sesión falsificable
- La sesión vive en `localStorage` sin firmar: se puede editar `rol: 'admin'`.
- Fix: al hacer login, el server emite un token **firmado** (HMAC con un secreto
  de Vercel); el cliente lo guarda y lo manda; el server lo valida en cada acción
  sensible. Con esto, S1/S3 pueden confiar en "este caller es admin".

## Notas
- Trabajar en `maestro-repos` (no el clon de `~/Documents`).
- Probar cada cambio de RLS/auth en staging antes de producción.
