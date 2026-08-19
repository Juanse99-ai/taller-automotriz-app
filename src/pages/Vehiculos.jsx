import { useState, useMemo } from 'react'
import { fmtDate, fmt } from '../utils/helpers'
import { ESTADOS } from '../utils/constants'
import { useTecnicos } from '../services/tecnicos'

export default function Vehiculos({ vehiculos, clientes, trabajos = [], notify }) {
  const {
    vehiculos: vehiculosBase, buscarPorPlaca, buscarPorCedula,
    agregarVehiculo, agregarHistorial, actualizarVehiculo,
  } = vehiculos

  const { obtenerCliente, clientesTable } = clientes
  const TECNICOS = useTecnicos()

  // El historial de servicio se deriva de las OT COMPLETADAS de cada placa.
  // No se persiste en el vehiculo: siempre refleja los trabajos actuales.
  const historialPorPlaca = useMemo(() => {
    const nombreTecnico = (id) => {
      const t = TECNICOS.find(tc => tc.id === parseInt(id))
      return t ? t.nombre : ''
    }
    const map = {}
    trabajos.forEach(t => {
      if (t.estado !== ESTADOS.COMPLETADO) return
      const placa = (t.placa || '').trim().toUpperCase()
      if (!placa) return
      ;(map[placa] || (map[placa] = [])).push({
        id: t.id,
        trabajoId: t.otCodigo || t.id,
        fecha: t.fecha,
        kilometraje: t.kilometraje ?? null,
        tecnico: nombreTecnico(t.tecnicoId),
        total: t.total || 0,
        estado: t.estado,
        observaciones: t.observaciones || '',
      })
    })
    return map
  }, [trabajos, TECNICOS])

  // Vehiculos con su historial derivado inyectado (reemplaza el campo vacio de BD)
  const vehiculosList = useMemo(
    () => vehiculosBase.map(v => ({
      ...v,
      historial: historialPorPlaca[(v.placa || '').trim().toUpperCase()] || [],
    })),
    [vehiculosBase, historialPorPlaca],
  )

  const [busqueda, setBusqueda] = useState('')
  const [vehiculoSeleccionado, setVehiculoSeleccionado] = useState(null)

  // Metricas
  const totalVehiculos = vehiculosList.length
  const conHistorial = useMemo(
    () => vehiculosList.filter(v => v.historial && v.historial.length > 0).length,
    [vehiculosList],
  )
  const marcasUnicas = useMemo(() => {
    const marcas = new Set(vehiculosList.map(v => (v.marca || '').toLowerCase()).filter(Boolean))
    return marcas.size
  }, [vehiculosList])

  // Obtener nombre propietario
  const nombrePropietario = (cedulaPropietario) => {
    if (!cedulaPropietario) return '--'
    const c = obtenerCliente(cedulaPropietario)
    return c ? (c.nombre || '--') : '--'
  }

  // Ultimo servicio de un vehiculo
  const ultimoServicio = (v) => {
    if (!v.historial || v.historial.length === 0) return null
    const sorted = [...v.historial].sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
    return sorted[0]
  }

  // Filtrado por busqueda
  const vehiculosFiltrados = useMemo(() => {
    const term = busqueda.trim().toLowerCase()
    if (!term) return vehiculosList
    return vehiculosList.filter(v =>
      (v.placa || '').toLowerCase().includes(term) ||
      (v.marca || '').toLowerCase().includes(term) ||
      nombrePropietario(v.cedulaPropietario).toLowerCase().includes(term),
    )
  }, [vehiculosList, busqueda, clientesTable])

  // Cifra del pie de la tabla. No filtra ni cambia nada: cuenta las filas que
  // ya se estan pintando con "—" en Ultimo servicio, con ese mismo criterio.
  const sinServicio = useMemo(
    () => vehiculosFiltrados.filter(v => !ultimoServicio(v) && !v.fechaUltimoServicio).length,
    [vehiculosFiltrados],
  )

  const seleccionar = (vehiculo) => setVehiculoSeleccionado(vehiculo)
  const volver = () => setVehiculoSeleccionado(null)

  // --- VISTA DETALLE ---
  if (vehiculoSeleccionado) {
    const propietarioCedula = vehiculoSeleccionado.cedulaPropietario
    const propietarioNombre = nombrePropietario(propietarioCedula)
    const historial = vehiculoSeleccionado.historial || []
    const historialOrdenado = [...historial].sort((a, b) => new Date(b.fecha) - new Date(a.fecha))

    return (
      <div>
        <div className="pagehd">
          <div>
            <h2>{vehiculoSeleccionado.placa}</h2>
            <p className="sub">{vehiculoSeleccionado.marca} {vehiculoSeleccionado.modelo} {vehiculoSeleccionado.ano}</p>
          </div>
          <div className="actions">
            <button className="btn btn-outline btn-sm" onClick={volver}>← Volver</button>
          </div>
        </div>

        {/* Info del vehiculo + Propietario */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 16, marginBottom: 16 }}>
          <div className="card">
            <div className="card__h"><h3>Informacion del Vehiculo</h3></div>
            <div className="card__b">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field"><label>Placa</label><div className="input" style={{ background: 'var(--bg-subtle)', cursor: 'default' }}>{vehiculoSeleccionado.placa || '--'}</div></div>
                <div className="field"><label>Marca</label><div className="input" style={{ background: 'var(--bg-subtle)', cursor: 'default' }}>{vehiculoSeleccionado.marca || '--'}</div></div>
                <div className="field"><label>Modelo</label><div className="input" style={{ background: 'var(--bg-subtle)', cursor: 'default' }}>{vehiculoSeleccionado.modelo || '--'}</div></div>
                <div className="field"><label>Año</label><div className="input" style={{ background: 'var(--bg-subtle)', cursor: 'default' }}>{vehiculoSeleccionado.ano || '--'}</div></div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card__h"><h3>Propietario</h3></div>
            <div className="card__b">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field"><label>Cedula</label><div className="input" style={{ background: 'var(--bg-subtle)', cursor: 'default' }}>{propietarioCedula || '--'}</div></div>
                <div className="field"><label>Nombre</label><div className="input" style={{ background: 'var(--bg-subtle)', cursor: 'default' }}>{propietarioNombre}</div></div>
              </div>
            </div>
          </div>
        </div>

        {/* Historial de Servicio */}
        <div className="card">
          <div className="card__h"><h3>Historial de Servicio</h3><span className="badge badge-n">{historial.length}</span></div>
          <div className="card__b">
            {historialOrdenado.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-3)' }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 10, opacity: .8 }}>
                  <rect x="9" y="2" width="6" height="4" rx="1"/>
                  <path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/>
                </svg>
                <p>Sin historial de servicio</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {historialOrdenado.map((h, idx) => (
                  <div key={h.id || idx} style={{
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    padding: 16,
                    background: 'var(--bg-subtle)',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{fmtDate(h.fecha)}</span>
                      {h.estado && <span className="badge badge-n">{h.estado}</span>}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, fontSize: 13 }}>
                      <div><span style={{ color: 'var(--text-3)', fontWeight: 600 }}>Km: </span><span className="mono">{h.kilometraje != null ? h.kilometraje.toLocaleString('es-CO') : '--'}</span></div>
                      <div><span style={{ color: 'var(--text-3)', fontWeight: 600 }}>Tecnico: </span><span>{h.tecnico || '--'}</span></div>
                      <div><span style={{ color: 'var(--text-3)', fontWeight: 600 }}>Total: </span><span className="mono" style={{ fontWeight: 700, color: 'var(--green-600)' }}>{fmt(h.total)}</span></div>
                    </div>
                    {h.observaciones && (
                      <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-2)' }}>
                        <span style={{ color: 'var(--text-3)', fontWeight: 600 }}>Obs: </span>{h.observaciones}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // --- VISTA LISTA ---
  return (
    <div>
      {/* Las tres cifras eran una tarjeta hero gigante y dos mini: ~180px de alto
          para tres numeros que no se accionan. Bajan a linea de apoyo, y el
          buscador sale de su tarjeta propia y sube aqui. */}
      <div className="hd-head">
        <div className="hd-head__t">
          <h1>Vehículos</h1>
          <div className="hd-head__sub">
            {totalVehiculos.toLocaleString('es-CO')} placas registradas · {conHistorial} con historial · {marcasUnicas} marcas únicas
          </div>
        </div>
        <div className="hd-head__sp" />
        <div className="hd-head__right">
          <label className="hd-find" style={{ width: 330, background: 'var(--bg-raised)', border: '1px solid var(--border-input)' }}>
            <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input placeholder="Buscar por placa, marca o propietario..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
          </label>
        </div>
      </div>

      {/* Tabla
          El mockup abre la tarjeta DIRECTO en la banda de rotulos: no hay
          cabecera con titulo (ya esta arriba, a 40px) ni el conteo suelto.
          El conteo baja al pie, que es donde el diseño lo pone junto al unico
          dato que la lista no puede mostrar fila a fila. */}
      <div className="hd-card" style={{ marginTop: 10 }}>
        {vehiculosFiltrados.length === 0 ? (
          <div className="hd-void">
            <div className="hd-void__t">No se encontraron vehículos</div>
          </div>
        ) : (
          <>
            <div className="veh-scroll">
              <table className="tbl tbl-cards tbl-cards--veh">
                <thead>
                  <tr>
                    {/* 114 = 96 de columna + los 18 de sangría de la tarjeta;
                        40 = 22 del chevron + los 18 del otro lado. Con eso las
                        ocho columnas caen donde el mockup las pone. */}
                    <th style={{ width: 114 }}>Placa</th>
                    <th>Propietario</th>
                    <th style={{ width: 104 }}>Marca</th>
                    <th style={{ width: 104 }}>Modelo</th>
                    <th className="hd-n" style={{ width: 56 }}>Año</th>
                    <th className="hd-n" style={{ width: 66 }}>Visitas</th>
                    <th className="hd-n" style={{ width: 118 }}>Último servicio</th>
                    <th style={{ width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {vehiculosFiltrados.map(v => {
                    const ultimo = ultimoServicio(v)
                    return (
                      <tr key={v.placa} style={{ cursor: 'pointer' }} onClick={() => seleccionar(v)}>
                        <td className="c-name td-placa" data-label="Placa">{v.placa}</td>
                        <td className="td-dueno" data-label="Propietario">{nombrePropietario(v.cedulaPropietario)}</td>
                        {/* El "--" de ficha incompleta se pinta apagado para que no
                            compita con los que si tienen dato. */}
                        <td data-label="Marca" className={v.marca ? 'td-marca' : 'td-marca hd-empty'}>{v.marca || '—'}</td>
                        <td data-label="Modelo" className={v.modelo ? 'td-modelo' : 'td-modelo hd-empty'}>{v.modelo || '—'}</td>
                        <td data-label="Año" className={v.ano ? 'hd-n td-ano' : 'hd-n td-ano hd-empty'}>{v.ano || '—'}</td>
                        {/* Visitas en negrita solo cuando hay mas de una: es lo unico
                            que distingue a un cliente que vuelve. En 0, apagado. */}
                        <td data-label="Visitas" className="hd-n td-visitas" style={{
                          fontWeight: (v.historial || []).length > 1 ? 700 : 400,
                          color: (v.historial || []).length === 0 ? 'var(--text-empty)' : (v.historial || []).length > 1 ? 'var(--text)' : 'var(--text-3)',
                        }}>{(v.historial || []).length}</td>
                        {/* El tamaño y el color viven en la hoja de abajo, no aqui:
                            un color inline le ganaba a .hd-empty y el "—" salia
                            igual de oscuro que una fecha real. */}
                        <td data-label="Último servicio" className={ultimo || v.fechaUltimoServicio ? 'hd-n td-serv' : 'hd-n td-serv hd-empty'}>
                          {ultimo ? fmtDate(ultimo.fecha) : fmtDate(v.fechaUltimoServicio)}
                        </td>
                        <td className="td-chevron">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {/* Pie: el conteo que estaba en la cabecera de la tarjeta, y a la
                derecha lo unico que la lista no deja ver de un vistazo: cuantas
                placas nunca han pasado por el taller. */}
            <div className="hd-tbl__f">
              <span>{vehiculosFiltrados.length.toLocaleString('es-CO')} vehículo{vehiculosFiltrados.length === 1 ? '' : 's'}</span>
              <span className="hd-bar__sp" />
              <span>Sin servicio registrado</span>
              <b>{sinServicio.toLocaleString('es-CO')}</b>
            </div>
          </>
        )}
      </div>

      {/* Maquetacion de ESTA tabla. No va en index.css porque solo la usa
          Vehiculos; si se quiere mover, el bloque esta listo tal cual. */}
      <style>{`
        /* Las siete columnas fijas suman 602px. Entre 601 y ~830px de area util
           no caben: la tabla scrollea DENTRO de su tarjeta, nunca empuja la
           pagina de lado (min-width:0 es lo que impide que estire la tarjeta). */
        .veh-scroll{min-width:0;overflow-x:auto;-webkit-overflow-scrolling:touch}

        /* La placa es un codigo: monoespaciada en las dos vistas. */
        .tbl.tbl-cards--veh tbody td.td-placa{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
        .tbl.tbl-cards--veh tbody td.td-chevron svg{display:block}

        @media(min-width:601px){
          .tbl.tbl-cards--veh{table-layout:fixed;font-size:12.5px}

          /* Banda de rotulos de 30px: gris, versalitas de 9.5px, y la linea de
             1.5px que separa el rotulo del dato. Sin ella los titulos de columna
             se leian como una fila mas. */
          .tbl.tbl-cards--veh thead th{
            height:30px;padding:0;background:var(--bg-subtle);
            font-size:9.5px;line-height:1;font-weight:700;letter-spacing:.7px;
            color:var(--text-4);text-transform:uppercase;white-space:nowrap;
            border-bottom:1.5px solid var(--head-line);
          }
          .tbl.tbl-cards--veh thead th.hd-n{text-align:right}

          /* Fila de 38px con separador de 1px del color del handoff
             (el generico usaba el gris iOS, que raya la tabla). */
          .tbl.tbl-cards--veh tbody tr{height:var(--row-h)}
          .tbl.tbl-cards--veh tbody tr:hover{background:var(--bg-subtle)}
          /* Sin relleno entre columnas: el mockup las pega y deja que el
             propietario —el unico campo largo— se corte con puntos suspensivos.
             La sangria de 18px la ponen la primera y la ultima. */
          .tbl.tbl-cards--veh tbody td{
            padding:0;line-height:1.2;border-bottom:1px solid var(--row-line);
            white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
          }
          .tbl.tbl-cards--veh tbody tr:last-child td{border-bottom:none}
          .tbl.tbl-cards--veh thead th:first-child,
          .tbl.tbl-cards--veh tbody td:first-child{padding-left:18px}
          .tbl.tbl-cards--veh thead th:last-child,
          .tbl.tbl-cards--veh tbody td:last-child{padding-right:18px}

          .tbl.tbl-cards--veh tbody td.td-placa{
            font-size:13.5px;font-weight:700;letter-spacing:.3px;color:var(--text);
          }
          .tbl.tbl-cards--veh tbody td.td-dueno{font-weight:600;color:var(--text-2);padding-right:14px}
          .tbl.tbl-cards--veh tbody td.td-visitas{font-size:13px}
          .tbl.tbl-cards--veh tbody td.td-serv{font-size:12.5px;color:var(--text-3)}
          .tbl.tbl-cards--veh tbody td.td-serv.hd-empty{color:var(--text-empty)}
          .tbl.tbl-cards--veh tbody td.td-chevron{width:auto;padding-left:0;color:var(--text-5)}
          .tbl.tbl-cards--veh tbody td.td-chevron svg{margin-left:auto}
        }

        /* Movil: el diseño es UNA hoja blanca con las filas separadas por una
           linea, no una tarjeta por vehiculo dentro de otra tarjeta. */
        @media(max-width:600px){
          .tbl.tbl-cards--veh tbody tr{
            border:none;border-bottom:1px solid var(--row-line);border-radius:0;margin:0;
          }
          .tbl.tbl-cards--veh tbody tr:last-child{border-bottom:none}
        }
      `}</style>
    </div>
  )
}
