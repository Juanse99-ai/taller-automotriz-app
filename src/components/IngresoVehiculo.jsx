import { INVENTARIO_ITEMS, NIVEL_COMBUSTIBLE, ingresoVacio } from '../utils/ingreso'

// Captura del estado de ingreso del vehículo: nivel de combustible (medidor de
// octavos), daños visibles, e inventario (qué trae el carro). Controlado:
// recibe `value` (objeto ingreso) y emite `onChange(nuevoIngreso)`.
export default function IngresoVehiculo({ value, onChange }) {
  const ing = value || ingresoVacio()
  const inv = new Set(ing.inventario || [])
  const comb = ing.combustible // 0..8 | null | undefined
  const patch = (p) => onChange({ ...ing, ...p })
  const toggle = (key) => {
    const next = new Set(inv)
    next.has(key) ? next.delete(key) : next.add(key)
    patch({ inventario: [...next] })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Nivel de combustible — medidor de octavos, tocar para fijar */}
      <div className="field">
        <label>
          Nivel de combustible
          {comb != null && <span style={{ color: 'var(--green-700)', fontWeight: 700 }}> · {NIVEL_COMBUSTIBLE[comb]}</span>}
        </label>
        <div style={{ display: 'flex', gap: 3 }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Combustible ${NIVEL_COMBUSTIBLE[i + 1]}`}
              onClick={() => patch({ combustible: comb === i + 1 ? i : i + 1 })}
              style={{
                flex: 1, height: 16, borderRadius: 4, border: 'none', cursor: 'pointer', padding: 0,
                background: comb != null && i < comb ? 'var(--green-600)' : 'var(--fill)',
                transition: 'background .12s',
              }}
            />
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--text-4)', marginTop: 3, fontWeight: 600 }}>
          <span>E</span><span>¼</span><span>½</span><span>¾</span><span>F</span>
        </div>
      </div>

      {/* Estado general / daños visibles */}
      <div className="field">
        <label>Estado general / daños visibles</label>
        <textarea
          className="input" rows={2} style={{ resize: 'none' }}
          value={ing.estado || ''}
          onChange={(e) => patch({ estado: e.target.value })}
          placeholder="Ej: raya en puerta derecha, rin rayado, farola opaca…"
        />
      </div>

      {/* Inventario del vehículo */}
      <div>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-3)', marginBottom: 6 }}>
          Inventario del vehículo <span style={{ color: 'var(--text-4)', fontWeight: 500 }}>· lo que trae al ingresar</span>
        </label>
        <div className="ingreso-inv-grid">
          {INVENTARIO_ITEMS.map((it) => {
            const on = inv.has(it.key)
            return (
              <label key={it.key} className="ingreso-chk">
                <input
                  type="checkbox" checked={on} onChange={() => toggle(it.key)}
                  style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
                />
                <span className={`ingreso-box${on ? ' on' : ''}`}>
                  {on && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                  )}
                </span>
                {it.label}
              </label>
            )
          })}
        </div>
      </div>
    </div>
  )
}
