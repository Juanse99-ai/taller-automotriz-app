# Sistema de diseño — Multidiagnósticos AS

Referencia del sistema visual de la app del taller. Los **tokens** viven en
`src/index.css` (`:root`) y los **componentes** en `src/components/ui/`. Los
componentes **envuelven clases que ya existen** en `index.css`: adoptarlos
reduce el estilo inline repetido **sin cambiar el look**.

> Principio anti-"look de IA" (preferencia del usuario): tipografía clara y con
> buen contraste, **sin** glassmorphism, **sin** degradados de texto, **sin**
> franjas laterales de color (`border-left` decorativo). Jerarquía por tamaño y
> peso, no por efectos.

## Tokens (en `src/index.css`)

**Tipografía:** `--font` = Inter (fallback al sistema). Números con
`font-variant-numeric: tabular-nums` (clase `.mono`).

**Color (rampas):** `--navy-950..600`, `--blue-700..50`, `--amber-600..100`,
`--red-700..100`, `--green-700..100`, `--slate-50..900`.
**Semánticos (light/dark):** `--bg`, `--bg-raised`, `--bg-subtle`, `--border`,
`--border-strong`, `--text`, `--text-2/3/4`, `--primary`, `--accent`,
`--danger`, `--success`. El modo oscuro (`[data-theme="dark"]`) redefine estos
semánticos: **usa siempre los semánticos, no los hex crudos.**

**Radios:** `--radius-sm 6` · `--radius 10` · `--radius-lg 14` · `--radius-xl 18`.
**Sombras:** `--shadow-sm/shadow/md/lg` (en dark la elevación es superficie + borde).
**Easing:** `--ease-out`, `--ease-in-out`, `--ease-drawer` (easeOutExpo).

## Componentes (`src/components/ui/`)

Importar desde el barril:

```jsx
import { Card, Button, Badge, Field, Input, Select, Textarea, Toolbar } from '../components/ui'
```

### `<Button>` — envuelve `.btn` / `.btn-*`
`variant`: `primary` (def) · `outline` · `ghost` · `danger` · `accent` · `success` · `warning`.
`size`: `'sm'`. `icon`: nodo antes del texto. Resto de props pasan al `<button>`.

```jsx
<Button variant="primary" onClick={guardar}>Guardar</Button>
<Button variant="ghost" size="sm" icon={<IconTrash/>}>Eliminar</Button>
```

### `<Badge>` — envuelve `.badge` / `.badge-*`
`tone`: `success` · `warning` · `info` · `danger` · `neutral` (def) · `purple`
(acepta alias `s|w|i|d|n|p`).

```jsx
<Badge tone="success">Completado</Badge>
```

### `<Card>` — envuelve `.card`
`title` + `icon` (encabezado `.card-title`), `actions` (nodos a la derecha del
título), `pad` (padding del cuerpo en px, `18` por def; `0` para tablas a sangre).

```jsx
<Card title="Trabajos del día" icon={<IconWrench/>} actions={<Button size="sm">Nuevo</Button>}>
  …contenido…
</Card>
<Card pad={0}><table className="tbl tbl-cards">…</table></Card>
```

### `<Field>` + `<Input>` / `<Select>` / `<Textarea>` — envuelven `.field` / `.input`
`Field`: `label`, `required`, `help`, `error`, `htmlFor`. Los controles pasan
todas sus props al elemento nativo.

```jsx
<Field label="Placa" required help="Sin espacios">
  <Input value={placa} onChange={e => setPlaca(e.target.value)} />
</Field>
```

### `<Toolbar>` — cabecera de sección / barra de acciones
`left` (título/filtros/buscador) y `right` (botones). Reemplaza el patrón
inline `display:flex; justify-content:space-between` que se repite en las páginas.

```jsx
<Toolbar left={<h2 className="card-title">Cotizaciones</h2>} right={<Button>Nueva</Button>} />
```

## Adopción

Migración **incremental** y de **paridad visual**: al tocar una pantalla, cambia
el markup repetido por el componente equivalente (mismo resultado visual, menos
inline). No es un reemplazo masivo de una sola vez. Prioriza `Button`/`Badge`
(salida idéntica) y usa `Card` con `pad` acorde a la tarjeta original.

**Existentes que ya funcionan como sistema (no duplicar):** `.kpi`/`.kpi-ind`
(indicadores), `.tbl` + `.tbl-cards` (tablas → tarjetas en móvil, con
`data-label`), `.av` (avatares con iniciales), `ConfirmDialog` (diálogos de
confirmación, reemplaza `confirm()` nativo).
