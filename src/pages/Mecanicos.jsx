import { useMemo, useState } from 'react'
import { fmt } from '../utils/helpers'
import { COMISION, ESTADOS } from '../utils/constants'
import { manoObraBase } from '../utils/comision'
import { useTecnicos, tecnicosActivos, agregarTecnico, actualizarTecnico, setTecnicoActivo, eliminarTecnico } from '../services/tecnicos'
import ConfirmDialog from '../components/ConfirmDialog'
import { Button, Badge, IconX, IconEdit } from '../components/ui'

const ACTIVOS = [ESTADOS.PENDIENTE, ESTADOS.EN_DIAGNOSTICO, ESTADOS.ESPERANDO_REPUESTOS, ESTADOS.EN_PROGRESO]

export default function Mecanicos({ trabajos, onNavigate, notify }) {
  const TECNICOS = useTecnicos()
  const [vistaAgenda, setVistaAgenda] = useState(false)
  const [editando, setEditando] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [agregando, setAgregando] = useState(false)
  const [nuevoForm, setNuevoForm] = useState({ nombre: '', especialidad: '', telefono: '', cedula: '' })
  const [confirmCfg, setConfirmCfg] = useState(null)

  const tecnicosData = useMemo(() => {
    return TECNICOS.map((tec, idx) => {
      const misTrab = trabajos.filter(t => parseInt(t.tecnicoId) === tec.id)
      const completados = misTrab.filter(t => t.estado === ESTADOS.COMPLETADO)
      const activos = misTrab.filter(t => ACTIVOS.includes(t.estado))

      const now = new Date()
      const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1)
      const completadosMes = completados.filter(t => new Date(t.fecha) >= inicioMes)
      // Base SIN IVA (igual que Liquidación) para que la tarjeta muestre lo que se paga.
      const comisionMes = completadosMes.reduce((s, t) => s + manoObraBase(t) * COMISION.TOTAL, 0)

      return {
        ...tec,
        idx,
        totalTrabajos: misTrab.length,
        activosCount: activos.length,
        completadosMes: completadosMes.length,
        comisionMes,
        libre: activos.length === 0,
      }
    })
  }, [trabajos, TECNICOS])

  const equipoActivo = tecnicosData.filter(t => !t.eliminado && t.activo !== false)
  const equipoInactivo = tecnicosData.filter(t => !t.eliminado && t.activo === false)
  const totalActivos = equipoActivo.reduce((s, t) => s + t.activosCount, 0)
  const totalComisionesMes = equipoActivo.reduce((s, t) => s + t.comisionMes, 0)

  const initials = (nombre) => nombre.split(' ').map(x => x[0]).slice(0, 2).join('')

  const handleAgregar = (e) => {
    e?.preventDefault?.()
    if (!nuevoForm.nombre.trim()) { notify?.('Escribe el nombre del técnico', 'error'); return }
    agregarTecnico(nuevoForm)
    setNuevoForm({ nombre: '', especialidad: '', telefono: '', cedula: '' })
    setAgregando(false)
    notify?.('Técnico agregado al equipo', 'success')
  }

  const handleGuardarEdicion = () => {
    if (!editando) return
    if (!editForm.nombre?.trim()) { notify?.('El nombre no puede quedar vacío', 'error'); return }
    actualizarTecnico(editando.id, {
      nombre: editForm.nombre.trim(),
      especialidad: (editForm.especialidad || '').trim() || 'General',
      telefono: (editForm.telefono || '').trim(),
      cedula: (editForm.cedula || '').trim(),
    })
    setEditando(null)
    notify?.('Técnico actualizado', 'success')
  }

  const handleDesactivar = () => {
    if (!editando) return
    setTecnicoActivo(editando.id, false)
    setEditando(null)
    notify?.(`${editando.nombre} marcado como inactivo`, 'info')
  }

  const handleEliminar = () => {
    if (!editando) return
    const tec = editando
    const otsHistoria = trabajos.filter(t => parseInt(t.tecnicoId) === tec.id).length
    const lead = otsHistoria > 0
      ? `Tiene ${otsHistoria} OT${otsHistoria !== 1 ? 's' : ''} en el historial: su nombre se conserva ahí, pero sale del equipo, los selects y la liquidación.`
      : 'No tiene OTs, se borra por completo.'
    setConfirmCfg({
      title: `Eliminar a ${tec.nombre}`,
      lead,
      confirmLabel: 'Eliminar',
      tone: 'danger',
      onConfirm: () => {
        eliminarTecnico(tec.id, trabajos)
        setEditando(null)
        notify?.(`${tec.nombre} eliminado del equipo`, 'info')
      },
    })
    return
  }

  return (
    <>
    <style>{ESTILOS}</style>
    <div>
      {/* La comision del mes se queda como cifra grande — es la que el dueño
          revisa. "Tecnicos activos" y "trabajos en curso" eran dos tarjetas mini
          de 180px para dos numeros de un digito: bajan a linea de apoyo. */}
      <div className="hd-head mec-head">
        <div className="hd-head__t">
          <h1>Equipo técnico</h1>
          <div className="hd-head__sub">
            {equipoActivo.length} técnico{equipoActivo.length !== 1 ? 's' : ''} activo{equipoActivo.length !== 1 ? 's' : ''}
            {' · '}{equipoActivo.reduce((a, t) => a + t.activosCount, 0)} trabajos en curso
            {' · '}{equipoActivo.reduce((a, t) => a + t.completadosMes, 0)} completados este mes
          </div>
        </div>
        <div className="hd-head__sp" />
        <div className="hd-head__right">
          <div className="hd-fig mec-fig">
            <div className="hd-fig__l">COMISIONES DEL MES</div>
            <div className="hd-fig__v">{fmt(totalComisionesMes)}</div>
            <div className="hd-fig__s">Acumulado por liquidar a técnicos</div>
          </div>
          <div className="hd-head__div" />
          <div className="hd-seg mec-seg">
            <button type="button" className={`hd-seg__i${!vistaAgenda ? ' on' : ''}`} onClick={() => setVistaAgenda(false)}>Tarjetas</button>
            <button type="button" className={`hd-seg__i${vistaAgenda ? ' on' : ''}`} onClick={() => setVistaAgenda(true)}>Agenda</button>
          </div>
          <Button
            variant="primary"
            className="mec-add"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>}
            onClick={() => setAgregando(true)}
          >Agregar técnico</Button>
        </div>
      </div>

      {vistaAgenda ? (
        <AgendaSemanal trabajos={trabajos} onNavigate={onNavigate} tecnicos={TECNICOS} />
      ) : (
        <>
        {/* Tres tarjetas identicas repetian nueve rotulos (ACTIVOS / ESTE MES /
            COMISION, tres veces) para nueve numeros. En filas el rotulo se
            escribe una vez, en la cabecera, y las columnas se comparan de un
            vistazo — que es lo unico que se hace en esta pantalla. */}
        <div className="hd-card mec-card">
          <div className="hd-tbl mec-tbl">
            <div className="hd-tbl__h">
              <span className="mec-col-tec">TÉCNICO</span>
              <span className="mec-col-est">ESTADO</span>
              <span className="mec-col-tel">TELÉFONO</span>
              <span className="mec-col-nums">
                <span className="mec-col-act">ACTIVOS</span>
                <span className="mec-col-mes">ESTE MES</span>
                <span className="mec-col-com">COMISIÓN</span>
              </span>
              <span className="mec-col-btn" />
            </div>
            <div className="hd-tbl__b">
              {equipoActivo.map(tec => (
                <div key={tec.id} className="hd-row mec-row">
                  <div className="mec-col-tec">
                    <span className={`av av-${(tec.idx % 5) + 1} mec-av`}>{initials(tec.nombre)}</span>
                    <span style={{ minWidth: 0 }}>
                      <span className="hd-clip mec-name">{tec.nombre}</span>
                      <span className="hd-clip hd-sub mec-esp">Especialidad · {tec.especialidad}</span>
                    </span>
                  </div>
                  <div className="mec-col-est">
                    <span className={`hd-chip mec-chip hd-chip--${tec.libre ? 'ok' : 'warn'}`}>{tec.libre ? 'LIBRE' : 'OCUPADO'}</span>
                  </div>
                  {/* El rotulo de cada columna baja dentro de la fila en movil,
                      donde la cabecera de la tabla ya no esta. */}
                  <div className="mec-col-tel mec-tel">
                    <span className="mec-lbl mec-lbl--i">Teléfono</span>
                    {tec.telefono || <span className="hd-empty">—</span>}
                  </div>
                  <div className="mec-col-nums">
                    {/* ACTIVOS se colorea solo cuando hay carga; en 0 se apaga. */}
                    <div className="hd-n mec-col-act mec-num" style={{ fontWeight: tec.activosCount > 0 ? 700 : 400, color: tec.activosCount > 0 ? 'var(--warn-fg)' : 'var(--text-5)' }}>
                      <span className="mec-lbl">Activos</span>{tec.activosCount}
                    </div>
                    <div className="hd-n mec-col-mes mec-num" style={{ fontWeight: 600, color: 'var(--text)' }}>
                      <span className="mec-lbl">Este mes</span>{tec.completadosMes}
                    </div>
                    <div className="hd-n mec-col-com mec-num" style={{ fontWeight: 700, color: 'var(--text)' }}>
                      <span className="mec-lbl">Comisión</span>{fmt(tec.comisionMes)}
                    </div>
                  </div>
                  {/* Ver trabajos se hace a diario; editar un tecnico, una vez al
                      año. Dejaban de ser dos botones del mismo tamaño. */}
                  <div className="mec-col-btn">
                    <Button variant="outline" size="sm" className="mec-ver" onClick={() => onNavigate && onNavigate('trabajos')}>Ver trabajos</Button>
                    <Button variant="ghost" size="sm" className="btn-icon mec-edit" aria-label="Editar técnico" title="Editar técnico"
                      onClick={() => { setEditando(tec); setEditForm({ nombre: tec.nombre, especialidad: tec.especialidad, telefono: tec.telefono, cedula: tec.cedula || '' }) }}>
                      <IconEdit />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            {/* El pie suma CADA columna bajo su columna, no un total suelto
                pegado al borde derecho. */}
            <div className="hd-tbl__f mec-f">
              <span className="mec-col-tec">{equipoActivo.length} técnico{equipoActivo.length !== 1 ? 's' : ''}</span>
              <span className="mec-col-nums">
                <span className="hd-n mec-col-act mec-f__v"><span className="mec-lbl">Activos</span>{totalActivos}</span>
                <span className="hd-n mec-col-mes mec-f__v"><span className="mec-lbl">Este mes</span>{equipoActivo.reduce((a, t) => a + t.completadosMes, 0)}</span>
                <span className="hd-n mec-col-com mec-f__v mec-f__v--com"><span className="mec-lbl">Total del mes</span>{fmt(totalComisionesMes)}</span>
              </span>
              <span className="mec-col-btn" />
            </div>
          </div>
        </div>

        {/* Reparto del mes: la unica grafica de la pantalla. Reparte la misma
            cifra de la cabecera entre quienes la generaron, sin recalcular
            nada: el ancho es la parte que le toca a cada uno. */}
        {equipoActivo.length > 0 && (
          <div className="hd-card mec-panel">
            <div className="mec-panel__h">
              <span className="mec-panel__t">Reparto del mes</span>
              <span className="hd-bar__sp" />
              <span className="mec-panel__s">sobre {fmt(totalComisionesMes)}</span>
            </div>
            <div className="mec-rep">
              {equipoActivo.map((tec, i) => {
                const pct = totalComisionesMes > 0 ? Math.round(tec.comisionMes / totalComisionesMes * 100) : 0
                return (
                  <div key={tec.id} className="mec-rep__r">
                    <span className="hd-clip mec-rep__n">{tec.nombre}</span>
                    <span className="mec-rep__t">
                      <span className="mec-rep__f" style={{ width: `${pct}%`, background: i === 0 ? 'var(--accent)' : i === 1 ? 'var(--text-4)' : 'var(--border-strong)' }} />
                    </span>
                    <span className="hd-n mec-rep__p">{pct}%</span>
                    <span className="hd-n mec-rep__v">{fmt(tec.comisionMes)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Inactivos: visibles pero apagados, con reactivación a un clic */}
        {equipoInactivo.length > 0 && (
          <div style={{ marginTop: 22 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 10 }}>
              Inactivos ({equipoInactivo.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {equipoInactivo.map(tec => (
                <div key={tec.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                  background: 'var(--bg-raised)', border: '1px dashed var(--border-strong)',
                  borderRadius: 12, opacity: .75,
                }}>
                  <span className={`av av-${(tec.idx % 5) + 1}`} style={{ width: 36, height: 36, fontSize: 12, flexShrink: 0, filter: 'grayscale(1)' }}>{initials(tec.nombre)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{tec.nombre}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{tec.especialidad} · {tec.totalTrabajos} OT{tec.totalTrabajos !== 1 ? 's' : ''} en historial</div>
                  </div>
                  <Badge tone="n">Inactivo</Badge>
                  <Button variant="outline" size="sm" onClick={() => { setTecnicoActivo(tec.id, true); notify?.(`${tec.nombre} reactivado`, 'success') }}>Reactivar</Button>
                  <Button
                    variant="outline"
                    size="sm"
                    style={{ color: 'var(--red-600)', borderColor: 'rgba(220,38,38,.35)' }}
                    onClick={() => {
                      setConfirmCfg({
                        title: `Eliminar a ${tec.nombre}`,
                        lead: tec.totalTrabajos > 0
                          ? `Su nombre se conserva en las ${tec.totalTrabajos} OT${tec.totalTrabajos !== 1 ? 's' : ''} del historial, pero sale del equipo.`
                          : 'No tiene OTs, se borra por completo.',
                        confirmLabel: 'Eliminar',
                        tone: 'danger',
                        onConfirm: () => {
                          eliminarTecnico(tec.id, trabajos)
                          notify?.(`${tec.nombre} eliminado del equipo`, 'info')
                        },
                      })
                      return
                    }}
                  >Eliminar</Button>
                </div>
              ))}
            </div>
          </div>
        )}
        </>
      )}

      {/* Modal Editar Técnico */}
      {editando && (
        <div className="modal-overlay" onClick={() => setEditando(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal__h">
              <h3>Editar técnico</h3>
              <button className="icobtn" onClick={() => setEditando(null)} aria-label="Cerrar"><IconX /></button>
            </div>
            <div className="modal__b" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="field">
                <label>Nombre</label>
                <input className="input" value={editForm.nombre || ''} onChange={e => setEditForm(f => ({ ...f, nombre: e.target.value }))} />
              </div>
              <div className="field">
                <label>Especialidad</label>
                <input className="input" value={editForm.especialidad || ''} onChange={e => setEditForm(f => ({ ...f, especialidad: e.target.value }))} placeholder="Frenos, Motor, General..." />
              </div>
              <div className="field">
                <label>Teléfono</label>
                <input className="input" value={editForm.telefono || ''} onChange={e => setEditForm(f => ({ ...f, telefono: e.target.value }))} placeholder="300 000 0000" />
              </div>
              <div className="field">
                <label>Cédula <span style={{ fontWeight: 400, color: 'var(--text-3)' }}>(para registrar el gasto en Cuentti)</span></label>
                <input className="input" value={editForm.cedula || ''} onChange={e => setEditForm(f => ({ ...f, cedula: e.target.value }))} placeholder="Sin puntos ni comas" />
              </div>

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Zona de salida</div>
                <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0 }}>
                  Si el técnico ya no trabaja en el taller, márcalo inactivo: deja de aparecer
                  para asignar trabajos y liquidar, pero sus OTs del historial conservan su nombre.
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button variant="outline" size="sm" style={{ flex: 1, color: 'var(--amber-600)', borderColor: 'rgba(245,158,11,.4)' }} onClick={handleDesactivar}>
                    Marcar inactivo
                  </Button>
                  <Button variant="outline" size="sm" style={{ flex: 1, color: 'var(--red-600)', borderColor: 'rgba(220,38,38,.35)' }} onClick={handleEliminar}>
                    Eliminar
                  </Button>
                </div>
              </div>
            </div>
            <div className="modal__f">
              <Button variant="outline" size="sm" onClick={() => setEditando(null)}>Cancelar</Button>
              <Button variant="primary" size="sm" onClick={handleGuardarEdicion}>Guardar cambios</Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Agregar Técnico */}
      {agregando && (
        <div className="modal-overlay" onClick={() => setAgregando(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal__h">
              <h3>Agregar técnico</h3>
              <button className="icobtn" onClick={() => setAgregando(false)} aria-label="Cerrar"><IconX /></button>
            </div>
            <form onSubmit={handleAgregar}>
              <div className="modal__b" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="field">
                  <label>Nombre completo <span className="req">*</span></label>
                  <input className="input" value={nuevoForm.nombre} onChange={e => setNuevoForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Nombre y apellido" autoFocus />
                </div>
                <div className="field">
                  <label>Especialidad</label>
                  <input className="input" value={nuevoForm.especialidad} onChange={e => setNuevoForm(f => ({ ...f, especialidad: e.target.value }))} placeholder="Frenos, Motor, General..." />
                </div>
                <div className="field">
                  <label>Teléfono</label>
                  <input className="input" value={nuevoForm.telefono} onChange={e => setNuevoForm(f => ({ ...f, telefono: e.target.value }))} placeholder="300 000 0000" />
                </div>
                <div className="field">
                  <label>Cédula <span style={{ fontWeight: 400, color: 'var(--text-3)' }}>(para Cuentti)</span></label>
                  <input className="input" value={nuevoForm.cedula} onChange={e => setNuevoForm(f => ({ ...f, cedula: e.target.value }))} placeholder="Sin puntos ni comas" />
                </div>
                <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0 }}>
                  Quedará disponible de inmediato para asignar trabajos y liquidar comisiones ({COMISION.TOTAL * 100}%).
                </p>
              </div>
              <div className="modal__f">
                <Button type="button" variant="outline" size="sm" onClick={() => setAgregando(false)}>Cancelar</Button>
                <Button type="submit" variant="primary" size="sm">Agregar al equipo</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
    <ConfirmDialog cfg={confirmCfg} onClose={() => setConfirmCfg(null)} />
    </>
  )
}

function AgendaSemanal({ trabajos, onNavigate, tecnicos = [] }) {
  const dias = useMemo(() => {
    const hoy = new Date()
    const lunes = new Date(hoy)
    lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7))
    lunes.setHours(0, 0, 0, 0)

    const nombres = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom']
    const result = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(lunes)
      d.setDate(lunes.getDate() + i)
      const fin = new Date(d)
      fin.setHours(23, 59, 59, 999)
      const trabajosDia = trabajos.filter(t => {
        const f = new Date(t.fecha)
        return f >= d && f <= fin && t.estado !== ESTADOS.COMPLETADO && t.estado !== ESTADOS.CANCELADO
      })
      result.push({
        nombre: nombres[i],
        num: d.getDate(),
        esHoy: d.toDateString() === hoy.toDateString(),
        trabajos: trabajosDia,
      })
    }
    return result
  }, [trabajos])

  return (
    <div className="card" style={{ marginTop: 10 }}>
      <div className="card__h"><h3>Agenda de la Semana</h3></div>
      <div className="card__b">
        <div className="calendar-week">
          {dias.map((dia, i) => (
            <div key={i} className={`calendar-day ${dia.esHoy ? 'today' : ''}`}>
              <div className="calendar-day-header">{dia.nombre}</div>
              <div className="calendar-day-num">{dia.num}</div>
              {dia.trabajos.map(t => {
                const tec = tecnicos.find(tc => tc.id === parseInt(t.tecnicoId))
                return (
                  <div key={t.id} className="calendar-task"
                    style={{ cursor: 'pointer' }}
                    onClick={() => onNavigate && onNavigate('trabajos')}
                    title={`${t.placa} - ${t.cliente} (${tec?.nombre || 'Sin asignar'})\nClick para ver trabajos`}>
                    {t.placa} {tec ? `- ${tec.nombre.split(' ')[0]}` : ''}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ============================================================
   Maquetacion propia de Mecanicos (mockup de 1280 y de 390).
   Vive aqui, con prefijo `.mec-`, porque las medidas del handoff
   para ESTA pantalla no son las genericas: la fila mide 62px (hay
   avatar de 38 y dos lineas de texto) contra los 38px de --row-h,
   la cabecera 30 contra 28 y el margen lateral 20 contra 18. Si se
   metieran en .hd-tbl moverian las otras doce tablas.
   Mismo patron que Cotizaciones y Liquidacion.
   ============================================================ */
const ESTILOS = `
/* --- Barra de titulo --- */
/* El mockup separa cabecera y tarjeta 10px (columna con gap:10). */
.mec-card{margin-top:10px}
.mec-panel{margin-top:10px;padding:15px 20px}
.btn.mec-add{height:40px;padding:0 18px;font-size:13.5px;font-weight:700;gap:8px;box-shadow:var(--accent-shadow)}
.btn.mec-add svg{width:17px;height:17px;stroke-width:2.4}
/* El riel del segmentado tiene que HUNDIRSE respecto al fondo de la
   pagina: --chip (#f1f5f9) es mas claro que --bg (#e9edf2) y brillaba.
   --border es el token mas cercano al #e6eaf0 del mockup. */
.mec-seg{height:40px;background:var(--border)}
.mec-seg .hd-seg__i{height:34px;padding:0 17px;font-size:13px}
.mec-fig .hd-fig__v{font-size:27px}

/* --- Tabla: cabecera 30, fila 62, pie 40, margen lateral 20 --- */
.mec-tbl .hd-tbl__h{height:30px;padding:0 20px;border-top:none}
.hd-row.mec-row{height:62px;padding:0 20px;cursor:default}
.mec-tbl .mec-f{height:40px;padding:0 20px;gap:0;border-top:none}

/* --- Columnas: una sola definicion para cabecera, filas y pie, para
       que los subtotales caigan exactamente bajo su columna --- */
.mec-col-tec{flex:1;min-width:0}
.mec-row .mec-col-tec{display:flex;align-items:center;gap:12px}
.mec-col-est{width:92px;flex:none}
.mec-col-tel{width:124px;flex:none}
.mec-col-nums{width:292px;flex:none;display:flex}
.mec-col-act{width:74px;flex:none;text-align:right}
.mec-col-mes{width:88px;flex:none;text-align:right}
.mec-col-com{width:130px;flex:none;text-align:right}
.mec-col-btn{width:200px;flex:none;display:flex;justify-content:flex-end;gap:8px}

/* --- Celdas --- */
.av.mec-av{width:38px;height:38px;flex:none;font-size:13.5px;font-weight:700;letter-spacing:normal}
.mec-name{display:block;font-size:14.5px;line-height:1.2;font-weight:700;color:var(--text)}
.mec-esp{display:block;font-size:11.5px;line-height:1.3;margin-top:2px}
.hd-chip.mec-chip{font-size:10.5px;letter-spacing:.5px;padding:6px 10px}
.mec-tel{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-variant-numeric:tabular-nums;font-size:12.5px;color:var(--text-3)}
.mec-num{font-size:15px}
.mec-lbl{display:none;font-family:var(--font);font-size:9.5px;line-height:1;font-weight:700;letter-spacing:.7px;text-transform:uppercase;color:var(--text-4)}
.mec-f__v{font-size:13px;font-weight:700;color:var(--text)}
.mec-f__v--com{font-size:13.5px}

/* La accion diaria lleva el unico acento de la fila; editar se queda
   en un aro fino para que la celda no pierda contorno. */
.btn.mec-ver{height:38px;padding:0 16px;font-size:12.5px;font-weight:700;background:var(--accent-soft);color:var(--accent);border-color:transparent;box-shadow:none}
.btn.mec-ver:hover:not(:active){background:var(--accent-tint)}
.btn.mec-edit{width:38px;height:38px;padding:0;border:1.5px solid var(--border-input);color:var(--text-3)}
.btn.mec-edit:hover:not(:active){background:var(--bg-subtle);color:var(--text-2)}
.btn.mec-edit svg{width:15px;height:15px}

/* --- Reparto del mes --- */
.mec-panel__h{display:flex;align-items:center;gap:9px}
.mec-panel__t{font-size:13.5px;line-height:1;font-weight:700;color:var(--text)}
.mec-panel__s{font-size:11.5px;line-height:1;color:var(--text-3)}
.mec-rep{display:flex;flex-direction:column;gap:11px;margin-top:13px}
.mec-rep__r{display:flex;align-items:center;gap:12px}
.mec-rep__n{width:132px;flex:none;font-size:12.5px;line-height:1;font-weight:600;color:var(--text-2)}
.mec-rep__t{flex:1;min-width:0;height:9px;border-radius:var(--radius-pill);background:var(--chip);overflow:hidden}
.mec-rep__f{display:block;height:9px;border-radius:var(--radius-pill)}
.mec-rep__p{width:44px;flex:none;font-size:12px;line-height:1;font-weight:600;color:var(--text-3)}
.mec-rep__v{width:104px;flex:none;font-size:13px;line-height:1;font-weight:700;color:var(--text)}

@media (max-width:960px){
  /* Cabecera: la cifra pasa a tarjeta blanca y los controles ocupan
     el ancho completo, como en el mockup de 390. */
  .mec-head .hd-head__right{flex-direction:column;align-items:stretch;gap:10px}
  .hd-fig.mec-fig{text-align:left;background:var(--bg-raised);border-radius:var(--radius-card);padding:11px 14px}
  .mec-fig .hd-fig__l{font-size:10px}
  .mec-fig .hd-fig__v{font-size:26px;margin-top:5px}
  .mec-fig .hd-fig__s{font-size:12px;line-height:1.35;margin-top:4px}
  .mec-seg{height:var(--tap);border-radius:14px;padding:4px;gap:4px}
  .mec-seg .hd-seg__i{height:36px;border-radius:11px;font-size:13.5px}
  .btn.mec-add{width:100%;height:var(--tap-lg);font-size:15px}

  /* La fila tenia 698px de anchos fijos dentro de una tarjeta con
     overflow:hidden, asi que a 390 se comia la botonera. Aqui se
     reparte en cuatro renglones tocables y no se pierde ningun dato:
     los rotulos de la cabecera bajan dentro de cada celda. */
  .hd-row.mec-row{height:auto;min-height:0;flex-wrap:wrap;align-items:center;padding:11px 14px}
  .mec-row .mec-col-tec{order:1;flex:1 1 auto}
  .mec-col-est{order:2;width:auto;margin-left:auto}
  .mec-col-tel{order:3;width:auto;flex:1 0 100%;margin-top:7px}
  .mec-row .mec-col-nums{order:4;width:auto;flex:1 0 100%;gap:14px;align-items:flex-end;margin-top:9px;padding-top:9px;border-top:1px solid var(--row-line)}
  .mec-row .mec-col-nums > *{width:auto;flex:none;text-align:left}
  .mec-row .mec-col-nums > :last-child{flex:1;text-align:right}
  .mec-row .mec-col-btn{order:5;width:auto;flex:1 0 100%;justify-content:flex-start;margin-top:9px}
  .mec-num{font-size:17px}
  .mec-row .mec-lbl{display:block;margin-bottom:4px}
  .mec-row .mec-lbl--i{display:inline;margin:0 7px 0 0}
  .av.mec-av{width:42px;height:42px;font-size:15px}
  .mec-name{font-size:15px}
  .btn.mec-ver{flex:1;height:var(--tap-lg);border-radius:13px;background:var(--accent);color:#fff;font-size:14px;box-shadow:var(--accent-shadow)}
  .btn.mec-ver:hover:not(:active){background:var(--primary-hover)}
  .btn.mec-edit{width:var(--tap-lg);height:var(--tap-lg);border-radius:13px}

  /* Pie: los subtotales se etiquetan porque la cabecera ya no esta. */
  .mec-tbl .mec-f{height:auto;min-height:40px;flex-wrap:wrap;row-gap:6px;padding:10px 14px}
  .mec-f .mec-col-nums{width:auto;flex:1 0 100%;gap:12px;justify-content:space-between}
  .mec-f .mec-col-nums > *{width:auto;flex:none;text-align:right}
  .mec-f .mec-lbl{display:inline;margin-right:6px}
  .mec-f .mec-col-btn{display:none}

  /* Reparto: el nombre encoge y el importe deja de tener ancho fijo. */
  .mec-panel{padding:13px 14px}
  .mec-rep__n{width:92px}
  .mec-rep__v{width:auto}
}
`
