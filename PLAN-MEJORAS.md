# Plan de mejoras — Auditoría 2026-07-19

> Auditoría hecha por Claude (Fable 5) con 4 revisores en paralelo (plata, trabajos/OT,
> API/portal, visual) + verificación manual contra la base real. **Este documento es el
> encargo para ejecutar (Opus 4.8): trabaja tanda por tanda, en orden.**

## Reglas para el ejecutor

- Repo de trabajo: `/Users/juansecp12/maestro-repos/taller-automotriz-app` (NUNCA el clon de iCloud en ~/Documents).
- Una tanda = commits pequeños + `npm run build` + eslint de los archivos tocados. Verificar en el preview (config **"maestro"**, puerto 5175) lo que sea visible; lo de plata se prueba con datos de prueba que luego se borran (patrón ya usado: crear → verificar → anular/borrar).
- Vercel Hobby: máximo 12 funciones — **NO crear archivos nuevos en `/api`** (plegar en existentes por query param).
- No cambiar la fórmula de comisión (40% M.O. sin IVA, compartido 20/20 con `splitComision`, diario 40/60) — los fixes son de robustez, no de fórmula.
- Los hallazgos traen `archivo:línea` de la fecha de auditoría; si el archivo cambió, buscar el patrón, no la línea.
- Al terminar cada tanda: commit + push (deploy) y anotar en este archivo `[HECHO]` con el hash.

---

## TANDA 0 — URGENTE: hueco de pago en Wompi (plata real) 🔴 — [HECHO] commit `1268409`
> Verificado en prod: firma con monto alterado (100) → firma el total real (1000000);
> inexistente → 404; ya pagada → 409. Migración `add_wompi_tx_id_a_trabajos` aplicada.

**0.1 [CRÍTICO] La firma acepta cualquier monto — un cliente puede "pagar" $1 y quedar Pagado.**
`api/cuentti.js:41-45` (rama `?wompi=firma`): firma el `montoCentavos` que mande el navegador sin
compararlo con la factura. El webhook (`:111,139-143`) registra en Cuentti `valor = trabajo.total`
(no lo que entró) y marca `pagado=true`.
- Fix en `firma`: buscar el trabajo por `referencia` en Supabase (URL/anon hardcodeadas del proyecto
  `hpndvrjjizzkusuuhefb`, patrón del webhook), firmar `Math.round(trabajo.total*100)` ignorando el
  monto del cliente; 404 si no existe, 400 si `total<=0` o ya `pagado`.
- Fix en `webhook`: comparar `transaction.amount_in_cents` con `Math.round(trabajo.total*100)`;
  si es menor NO marcar pagado ni registrar en Cuentti (log fuerte y 200 para que Wompi no reintente eterno).
- Prueba: pago sandbox no aplica (webhook solo prod); probar con una OT de prueba de $2.000 reales
  como se hizo en la validación original, y anular después.

**0.2 [ALTO] Ventana de doble registro en el webhook.**
`api/cuentti.js:133-143`: si `agregarPagoTransacion` OK pero el PATCH `pagado=true` falla (ni se
chequea `res.ok`), el retry de Wompi vuelve a registrar el pago en Cuentti.
- Fix: guardar `wompi_tx_id` en el trabajo (nueva columna o reusar campo libre) ANTES de registrar el
  pago en Cuentti; al inicio del webhook, si `trabajo.wompi_tx_id === transaction.id` → responder 200
  sin re-registrar. Chequear `res.ok` del PATCH y loguear si falla.

**0.3 [MEDIO] Doble cobro si el webhook tarda >9s.**
`src/pages/PortalCliente.jsx:223-229`: `confirmandoPago` se apaga a los 9s y el botón "Pagar"
reaparece → el cliente puede pagar DOS veces (doble cargo real en su tarjeta).
- Fix: persistir en localStorage las referencias con pago iniciado (`t.id` + timestamp al volver con
  `?id=`); mientras el trabajo no esté `pagado` y la marca tenga <30 min, mostrar "Confirmando pago…"
  deshabilitado en vez de "Pagar". Seguir re-consultando (cada ~10s hasta 2 min).

**0.4 [BAJO, 5 min] `timingSafeEqual` para el checksum del webhook** (`api/cuentti.js:70,90`) —
defensa en profundidad, cambio de 3 líneas.

---

## TANDA 1 — Liquidación: doble pago / pérdida de registros 🔴 — [HECHO]
> useLiquidacion reescrito con colas pendientes/lápidas (movimientos + compartidos).
> agregarLiquidados fusiona (no des-liquida ajeno); desliquidarPorTrabajo cierra sobre
> prev; agregarHistorial reconcilia por id tras timeout; nextLiqIdSeguro consulta el
> servidor; guard compartido-sin-compañero; repartir() exacto; label 40/60; prompt→dialog.
> Verificado: Liquidación monta con el hook nuevo, sin errores de consola.

**1.1 [CRÍTICO] `guardarLiquidados` puede des-liquidar OTs de otro dispositivo → doble pago.**
`Liquidacion.jsx:699-700` pasa `[...liquidados, ...nuevasLiq]` con closure viejo;
`useLiquidacion.js:215-224` BORRA del servidor todo id que esté en `prev` y no en el array.
- Fix: separar caminos. Para agregar: `setLiquidados(prev => [...new Set([...prev, ...nuevas])])` y
  solo `sbUpsertLiquidado` de las nuevas (nunca delete). El delete queda solo en el flujo explícito
  de des-liquidar uno.

**1.2 [ALTO] `movimientos_tecnicos` sin cola/lápidas → cargo que resucita (doble descuento) o se pierde.**
`useLiquidacion.js:205-213` + `Liquidacion.jsx:704,707-716`: `sbDeleteMov`/`upsertMovimiento`
devuelven `false` silencioso; el siguiente sync repone/borra según el servidor.
- Fix: replicar el mecanismo `PENDING_KEY`/`TOMBS_KEY` que ya existe en `usePrestamos` (mismo patrón,
  mismo archivo de referencia) para movimientos: pendientes se reintentan, lápidas filtran el sync.

**1.3 [ALTO] Pago no atómico: timeout del historial deja OTs pagadas pero no marcadas → se pueden volver a liquidar.**
`Liquidacion.jsx:672-700`: si `agregarHistorial` devuelve `null` por timeout (pero el POST SÍ llegó),
se aborta antes de `guardarLiquidados`.
- Fix mínimo: si `agregarHistorial` falla, RE-CONSULTAR por `id` (`liquidacion_historial?id=eq.<id>`):
  si existe, continuar el flujo como éxito (reconciliación); si no existe, abortar como hoy.
  Marcar liquidados inmediatamente después del historial confirmado, antes de los pasos secundarios.

**1.4 [MEDIO] Colisión de `nextLiqId` entre dispositivos el mismo día** (`Liquidacion.jsx:572-580`):
el upsert por PK sobrescribe un pago del otro dispositivo.
- Fix: antes de grabar, consultar el servidor por ids `LQ-<base>%` y ajustar el sufijo; o agregar
  sufijo corto aleatorio `-x7k` cuando el registro no exista aún localmente. Mantenerlo legible.

**1.5 [MEDIO] Compartido SIN compañero: al pagarle al asignado su 20%, el trabajo desaparece y el otro 20% se pierde.**
`Liquidacion.jsx:261-266,315-329`.
- Fix: bloquear "Generar pago" si algún seleccionado es compartido sin compañero (mensaje: "elige el
  compañero del OT-XXXX o desmárcalo como compartido").

**1.6 [MEDIO] `mergeCompartidos` descarta claves locales no confirmadas** (`useLiquidacion.js:33-41`):
un `upsertCompartido` fallido revierte a "no compartido" → se paga 40% en vez de 20/20.
- Fix: en el merge, conservar claves locales con pendiente de subida (mini-cola como 1.2, o reintento
  con backoff + conservar en merge mientras exista el pendiente).

**1.7 [BAJO] `repartirDiario` redondea mal** (`Liquidacion.jsx:551-567`): usar `repartir(total, ids.map(()=>1))`
de `utils/money.js` (allocate exacto) en vez de `Math.round(total/n)` para todos.

**1.8 [BAJO] Rótulo dice "50/50" pero el reparto real del diario es 40/60** (`Liquidacion.jsx:1372` vs
`APORTE_ADMIN_SPLIT=0.40` en `:51`): unificar el texto derivándolo de la constante.

**1.9 [BAJO] `prompt()` nativo para borrar historial** (`Liquidacion.jsx:1714`): reemplazar por el
`ConfirmDialog` propio (consistencia iOS + funciona en móvil).

---

## TANDA 2 — Trabajos / Ficha del técnico / Video 🟠 — [HECHO]
> 2.1 firmaTrabajo compara TODOS los campos sincronizados en el poll. 2.2 videos
> huérfanos: se registran por sesión y se borran al cancelar o al quitarlos antes de
> guardar (+ path en la evidencia). 2.3 puedeCrearOT bloquea numerar sin haber visto
> el servidor. 2.4 ficha re-sincroniza con props. 2.5 checklist por item.id (+ compat
> índices, PDF). 2.6 cronómetro cap 12h. 2.7 carpeta de video por OT. 2.8 toggleTarea
> fuera del updater. 2.9 Recepción anti doble-submit. 2.10 nº de OT por máximo real.
> 2.11 handleCompletar factura con estado ya completado.
> Verificado: 86 OT cargan/renderizan, Ficha abre con checklist por id, sin crash.

**2.1 [ALTO] El poll solo compara 7 campos → el avance del técnico se pisa entre dispositivos.**
`useTrabajos.js:186-198,297-313`: cambios de `tareasHechas`, `crono_*`, `items`, `evidencias`,
`observaciones` hechos en otro dispositivo no refrescan este; la siguiente edición local los
sobreescribe con datos viejos (checklist y cronómetro del técnico se pierden).
- Fix: comparar el objeto completo normalizado (hash/`JSON.stringify` de campos sincronizados) para
  decidir `changed`, respetando el guard `dirtyRef`/TTL existente para no pisar ediciones locales
  recientes. Cuidado con `evidencias` (grande): comparar longitud + ids en vez del blob.

**2.2 [ALTO] Videos huérfanos** (`Trabajos.jsx:1019-1053,425-431`): se suben al elegirse; Cancelar,
cerrar, o quitar-antes-de-guardar los deja en el bucket; `quitarFoto` no borra del bucket.
- Fix: (a) `quitarFoto` de un `tipo==='video'`: recordar la URL en una lista `pendienteBorrar` del
  form y ejecutarla SOLO al guardar (persistir primero, borrar después); (b) al Cancelar, borrar los
  videos subidos en ESTA sesión de edición que no estaban en el trabajo original; (c) guardar `path`
  en la evidencia (lo devuelve `subirVideoEvidencia`) y usarlo en el borrado en vez de parsear la URL.

**2.3 [ALTO] `nextOtCodigo` colisiona entre dispositivos y arranca en OT-0001 si el fetch inicial falló.**
`useTrabajos.js:76-88`.
- Fix mínimo (sin RPC): si `connectionError` o la carga inicial no completó, bloquear "crear OT" con
  aviso ("sin conexión, no se puede numerar la OT"). Para la colisión entre dispositivos: al crear,
  re-consultar el máximo `ot_codigo` del servidor justo antes del insert y si el propio ya existe,
  saltar al siguiente (best-effort; la solución perfecta es secuencia en Postgres, opcional).

**2.4 [MEDIO] La Ficha no re-sincroniza con props** (`FichaTecnico.jsx:28-31`): modal abierto muestra
datos viejos y al guardar pisa (last-write-wins).
- Fix: `useEffect` que actualice `hechas/cronoInicio/acumulado` cuando cambie `t.id` o los campos, si
  el usuario no tiene cambios locales sin guardar.

**2.5 [MEDIO] Checklist por índice** (`FichaTecnico.jsx:43-49,65` + `fichaPdf.js`): reordenar/borrar
items corre las marcas a otra tarea.
- Fix: `tareasHechas` por `item.id` (migración suave: si el array guardado son números, tratarlo como
  índices legacy una vez y convertir al guardar). Actualizar también el PDF (`didDrawCell` usa index).

**2.6 [MEDIO] Cronómetro sin tope** (`FichaTecnico.jsx:41,56-60`): si el técnico no pausa, al volver
días después se acumula un tiempo gigante permanente.
- Fix: cap de 12h por sesión de cronómetro: al calcular `segActuales` y al pausar,
  `Math.min(delta, 12*3600)`; si `cronoInicio` es de >12h atrás, auto-pausar con el cap y avisar.

**2.7 [MEDIO] El video siempre cae en la carpeta `sin-ot`** (`Trabajos.jsx:934-967,1034`): el form no
tiene `otCodigo` ni `id` ni editando.
- Fix: pasar `trabajo?.otCodigo || trabajo?.id` como prop al form y usarlo en `addVideo`; fallback
  `placa` y último recurso `sin-ot`.

**2.8 [BAJO] `toggleTarea` llama `guardar()` dentro del updater** (`FichaTecnico.jsx:43-49`): sacarlo
del updater (warning de React + doble upsert en StrictMode).

**2.9 [BAJO] Recepción: doble-submit crea 2 OTs** (`Recepcion.jsx:38-92`): flag `enviando` que
deshabilite "Recibir Vehículo"/"Generar OT" durante el await.

**2.10 [BAJO] "OT asignada" del resumen no coincide con el código real** (`Recepcion.jsx:125,145`):
usar la misma lógica de `nextOtCodigo` para mostrar, o no mostrar número hasta crear.

**2.11 [BAJO] `handleCompletar` factura con snapshot viejo** (`Trabajos.jsx:150-156`): construir el
objeto con `{...actual, estado: COMPLETADO}` en vez de `trabajos.find` del closure.

---

## TANDA 3 — Endurecer API (sin romper la app) 🟠 — [HECHO] (3.1/3.2/3.3; 3.4 diferido)
> Verificado en prod: Cuentti whitelist (path real→200, no permitido→403); storage
> delete (video referenciado→403, no referenciado→200); gasto idempotente por idemKey.
> 3.4 [HECHO] commit `6f4df16`: bcrypt con migración perezosa. Verificado en prod:
> usuario bcrypt (login OK / clave mala rechazada); usuario legacy SHA-256 (login OK
> y migró solo a $2b$). Sin lockout. (La falta de auth en /api/auth-setup sigue siendo
> deuda S1 aparte.)

**3.1 [ALTO] `?storage=delete` público permite borrar TODOS los videos de evidencia.**
`api/supabase.js:116-136`. Los paths son enumerables (las URLs viven en `trabajos.evidencias`,
legible por el proxy abierto). Un header secreto NO sirve (iría en el bundle).
- Fix elegido (barato y sin auth): validación server-side de no-referencia — antes de borrar,
  consultar `trabajos?evidencias=like.*<path>*&select=id&limit=1`; si el path AÚN está referenciado
  por algún trabajo → 403. Requiere reordenar el cliente a persistir-primero-borrar-después (encaja
  con el fix 2.2). Así el endpoint solo puede borrar archivos ya desreferenciados (huérfanos), que es
  exactamente su propósito.

**3.2 [ALTO] Proxy Cuentti reenvía CUALQUIER path con el token del servidor.**
`api/cuentti.js:155-209`: con curl se puede anular facturas, emitir FE, etc.
- Fix: `ALLOWED_PATHS` (prefijos) con los ~10 endpoints que la app usa de verdad (grep de
  `src/services/cuentti.js` + `CONFIG.paths`); 403 para el resto. Verificar después que TODA la app
  siga funcionando (facturar, clientes, inventario, pagos, gasto).

**3.3 [MEDIO] Idempotencia server-side del gasto de nómina.**
`api/cuentti-gasto.js` + `api/_lib/gasto.js:121`: reintento tras timeout = gasto doble (hoy solo
guard de UI). La bitácora `gastos_registrados` ya existe (la usa el MCP).
- Fix: aceptar `idemKey` (= id de la liquidación, p.ej. `LQ-PB260719`) en el body; antes de
  `enviarGasto`, consultar la bitácora por esa clave; si existe → devolver el registro existente
  (200, `dedup:true`). Guardar la clave al registrar. El frontend la manda desde `registrarEnCuentti`.

**3.4 [MEDIO] Login: hash débil** (`api/auth.js:18-24`): SHA-256 con sal global estática.
- Fix: bcryptjs (sal por usuario) con migración perezosa: al validar con el hash viejo OK →
  re-hashear y guardar. No romper sesiones existentes.

**3.5 [INFO] Bucket `evidencias`: límites ya configurados** (75MB, mime image/video) — verificado en
la creación. Nada que hacer, solo no quitarlos.

**3.6 [PENDIENTE DEL DUEÑO — no código] Rotar las llaves de PRODUCCIÓN de Wompi** (se pegaron en el
chat durante la integración). Recordárselo al usuario al ejecutar la Tanda 0: se rotan en el panel de
Wompi → actualizar `WOMPI_*` en Vercel → redeploy. 10 minutos.

---

## TANDA 4 — Visual / UX 🟠 — [HECHO: dark-mode + tokens + 4.5 badges + cierres/botones del portal + audit de botones]
> 2026-07-20: pulidas las X de cierre del portal (visor .lb-ctl + X en cabecera del modal, commit `c0ee1c0`),
> unificados los ✕ de "limpiar búsqueda" en .input-clear (Clientes/CRM/Inventario) y grid del portal 228→200px
> (commit `70c5340`). Auditoría de botones: el resto de la app YA usa el sistema (.btn/<Button>, .icobtn, chips
> .on); 4.6/4.7 (chips internos de Liquidación + overlays) quedan como micro-pulido opcional, bajo valor.
> HECHO: 4.0 remap de rampa en dark (verde/rojo/ámbar-700 + blue-600 → texto legible;
> los -600 de relleno NO se tocan). 4.1 ConfirmDialog + toggle segmentado con tokens
> reales (ya no caja blanca). 4.2 Cotizaciones (dropdown clientes + modal productos).
> 4.3 --amber-700 + tintes -50/-200 definidos (el ámbar ya se ve). 4.4 ref chip (via
> remap). 4.8 fallback global button:focus-visible + #999→token.
> Verificado en vivo dark: Liquidación (TOTAL verde legible), Dashboard, Recepción.
> PENDIENTE (polish menor): 4.5 badges del portal, 4.6 migrar botones inline a <Button>,
> 4.7 unificar el resto de overlays.

**4.0 [MÁXIMA PALANCA — hacer PRIMERO] La rampa de color no se remapea en modo oscuro.**
El bloque `[data-theme="dark"]` (`src/index.css:107-138`) redefine `--text/--bg/--primary` pero NO
la rampa fija (`--green-700`, `--red-700`, `--blue-600`, `--amber-600`), usada inline como color de
texto **82 veces**, casi siempre en cifras de plata → verde/rojo oscuros sobre fondo casi negro
(~2.3:1). Fix de 1 línea dentro del bloque dark:
`--green-700:#4ade80;--green-600:#4ade80;--red-700:#fca5a5;--red-600:#fca5a5;--blue-600:#93c5fd;--amber-600:#fbbf24;--amber-700:#fbbf24;`
Esto repara de una el hero de Liquidación (`Liquidacion.jsx:1116` a 58px, `:1519-1533`) y la mayoría
de la categoría dark.

**4.1 [ALTO] `ConfirmDialog` usa tokens que NO existen** (`src/components/ConfirmDialog.jsx:34-35`):
`var(--surface,#fff)` y `var(--text-1,#101725)` no están definidos en ningún lado → el diálogo que
confirma PAGOS de liquidación sale como caja blanca con texto oscuro en modo oscuro. Mismo bug en el
toggle segmentado de `Liquidacion.jsx:1057-1058`. Fix: `var(--bg-raised)` y `var(--text)`.

**4.2 [ALTO] Cotizaciones en dark: buscador ilegible.**
`Cotizaciones.jsx:546`: dropdown de clientes con `background:'#fff'` pero texto `--text` (casi
blanco en dark) → **nombres invisibles** al cotizar. Y el modal de búsqueda de productos
(`:664,668,674,689`) hardcodea `#fff/#f8fafc/#1e293b` → isla clara en app oscura.
Fix: `var(--bg-raised)` / `var(--bg-subtle)` / `var(--border)`.

**4.3 [MEDIO] `--amber-700` NO está definido y se usa 13×** (`Liquidacion.jsx:1122,1372,1384,1394,
1573,1631,1677…`, `CRM.jsx:665`, `Inspecciones.jsx:246`): el énfasis ámbar (diario/aportes/saldos)
colapsa en silencio al color heredado — nunca se ve ámbar. `Inspecciones.jsx:246` también referencia
tintes inexistentes (`--green-50/-200`, `--amber-50/-200`, `--red-50/-200`) → chips sin relleno.
Fix: definir `--amber-700:#b45309` (light) + remap dark, y los tokens de tinte faltantes.

**4.4 [MEDIO] Chip "Ref. #…" ilegible en dark** (`Liquidacion.jsx:1226,1520`): `--blue-600` (#1E3A8A
sin remapear) sobre tinte azul 10%. Es la referencia que se copia a Cuentti. Fix: `var(--primary)`
(+ el remap de 4.0 lo termina de arreglar).

**4.5 [MEDIO] Portal del cliente (pantalla de pago):**
- [HECHO] commit `0060d45`: badges de estado ya no usan `est.color+'20'` con texto del mismo tono
  (~2.8:1). Mapeados a las clases del sistema (`.badge-s/w/i/d/n/p`), theme-aware. Rótulo grande
  "Estado actual" con color `ink` adaptable. Ámbar/verde 2.8→6.4:1 en badges; añadido `--purple-700`.
  Verificado en vivo (light+dark).
- Labels de sección a 11px en `--text-3` (`:609,670,674,681,917,924,938`): pequeño para el dueño 40+
  en celular. Fix: 12.5px y `--text-2`.
- Cero `<Button>` del sistema: 10 `className="btn"` crudos + 16 botones inline (`:561,621,979,982`).
  Migrar al menos los de pago/acción a `<Button>` (paridad visual).
- Grid de vehículos `minmax(228px,1fr)` apretado en 320px → `minmax(200px,1fr)`.

**4.6 [MEDIO] Botones fuera del sistema (paridad visual, no cambiar look):**
- WhatsApp (`Trabajos.jsx:673,830`): `.btn btn-sm` pisado con inline (`height:32`, verde propio) →
  crear variante `.btn-success` y quitar overrides.
- Chips de Liquidación (`:1201,1662`): ~20px de alto (bajo mínimo táctil) y sin focus ring →
  `<Button size="sm" variant="ghost">`.
- Píldoras inline de aporte (`:1342-1354`) y destino de diferencia (`:1574-1582`) → `<Button>`.
- `CuenttiPanel.jsx`: ~20 hex crudos → tokens. `Vehiculos.jsx`: 0 componentes del sistema.
- Excepciones intencionales que NO tocar: firma sobre `#fff` (`Trabajos.jsx:858`), fondo `#000` de
  miniaturas de video (`:1903`), hero navy del portal.

**4.7 [BAJO] Overlays inconsistentes:** `.modal-overlay` estándar es `rgba(13,27,53,.72)`
(`index.css:153`) pero `ConfirmDialog.jsx:26` usa `.42`, `PortalCliente.jsx:864` `.45`,
`Cotizaciones.jsx:661` `rgba(0,0,0,.3)`. Fix: reusar `.modal-overlay` + `.modal`.

**4.8 [BAJO] A11y barato:** fallback global `button:focus-visible` (hoy los `<button>` crudos no
muestran foco: `PortalCliente.jsx:979,982`, filas de búsqueda de Cotizaciones, chips de Liquidación);
y `color:'#999'` hardcodeado → `var(--text-3)` (`Trabajos.jsx:1638`, `Cotizaciones.jsx:656`).

**Verificación Tanda 4:** capturas light + dark de Liquidación (hero y generar pago), Cotizaciones
(ambos buscadores abiertos), ConfirmDialog, y portal; móvil a 375px. El look en light NO debe
cambiar perceptiblemente (paridad), salvo los bugs corregidos.

---

## TANDA 5 — Performance 🟢 — [HECHO: 5.1 lazy + 5.2 cleanup parcial]
> 5.1 [HECHO] commit `30a11c6`: React.lazy por página → bundle inicial 1.417kB→373kB
> (419→115 gzip, -73%); jspdf/gsap salen del bundle inicial. Verificado en vivo.
> 5.2 [PARCIAL]: quitadas variables muertas (loadLogo, ‘i’, emptySlots). Los 2
> Date.now() en render se dejan (react-hooks/purity; funcionalmente inofensivos,
> moverlos cambiaría el comportamiento de "obsoleto" — la memoria dice no perseguirlos).

## Pendientes menores (cosmético, no crítico)
> 4.5 badges del portal (contraste texto-sobre-tinte del mismo color: requiere lógica
> por color, no un simple alpha). 4.6 migrar botones inline a <Button> (paridad visual,
> grande y de bajo valor). 4.7 unificar el resto de overlays.
> No hecho: 5.1 (React.lazy por página + import() de jspdf/gsap) toca el routing de
> App.jsx, que es load-bearing y ya arrastra la fragilidad de rules-of-hooks (early
> return antes de hooks). Rushearlo al final de una sesión larga arriesga regresar una
> app que funciona, por una ganancia SOLO de rendimiento (hoy 419KB gzip, aceptable).
> Recomendación: hacerlo como cambio enfocado y aislado, con verificación dedicada del
> tamaño de chunks y de que todos los PDFs sigan saliendo. 5.2 (limpieza eslint de los
> 4 preexistentes: loadLogo/‘i’ sin usar, 2×Date.now en render) tampoco bloquea el
> deploy; ir con 5.1. El resto de las tandas (0-4) SÍ está hecho y desplegado.

**5.1 El bundle principal pesa 1.42 MB (gzip 419 KB) y no hay lazy loading.**
- `React.lazy()` + `Suspense` por página en `src/App.jsx` (todas las pages).
- `import()` dinámico de `jspdf`/`jspdf-autotable` en los 6 archivos que lo usan estático
  (`fichaPdf.js`, `Reportes.jsx`, `PortalCliente.jsx`, `Liquidacion.jsx`, `Cotizaciones.jsx`,
  `Trabajos.jsx`) — es la librería más pesada y solo se usa al exportar.
- `gsap` dinámico en `PortalCliente.jsx` (solo el portal lo usa).
- Meta: chunk inicial < 500 KB. Verificar que los PDFs sigan saliendo (probar 1 de cada tipo).

**5.2 Limpieza eslint (132 errores):** catch vacíos → `catch { /* razón */ }` comentada, variables
sin usar (`loadLogo` en `Trabajos.jsx:164`, `i` en `:1662`), y los 2 `Date.now()` en render de
`Trabajos.jsx` (~619/741) → moverlos a `useMemo`/estado. No perseguir los warnings del compilador
de React si exigen refactors grandes.

---

## Orden de ejecución y verificación

1. **Tanda 0 hoy mismo** (es plata expuesta). Verificar: intento de firma con monto alterado → 400;
   pago real de prueba chico → OK y anular.
2. Tanda 1 (probar liquidando con datos de prueba y dos pestañas abiertas).
3. Tanda 2 (probar ficha en dos dispositivos/pestañas; video: subir→cancelar→verificar bucket limpio).
4. Tanda 3 (curl de los endpoints bloqueados → 403; flujo completo de la app → sigue OK).
5. Tandas 4 y 5 (visual: screenshots light/dark, móvil 375px; perf: tamaño de chunks en el build).

## Fuera de alcance (decisión del dueño, NO hacer sin pedirla)
- Cierre total del proxy Supabase / RLS (deuda conocida; requiere plan mayor con auth real).
- Carrito + Wompi del sitio web (proyecto aparte, 4 decisiones pendientes).
- Endpoint de historial de facturas por cliente en Cuentti (no existe API; pendiente externo).
