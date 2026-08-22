// Cliente a traves de proxy backend para evitar CORS
const proxy = (table) => `/api/supabase?table=${table}`
const baseProxy = proxy('trabajos')
const REQUEST_TIMEOUT_MS = 12000

// Sube un VIDEO de evidencia al bucket de Supabase Storage. El video es muy
// grande para la columna y para el límite de 4.5MB de una función, así que:
//   1) el servidor firma una URL de subida (con la llave, que nunca sale al cliente),
//   2) el navegador sube el archivo DIRECTO a esa URL.
// Devuelve { url } público para guardar en la evidencia y reproducir en el portal.
// Sin timeout: subir un video puede tardar; un corte mataría la subida a medias.
// El cuerpo de verdad. Sirve igual para un video y para una foto: el bucket es
// el mismo y el firmador de /api/supabase?storage=sign no mira el tipo.
async function subirAEvidencias(file, trabajoId, extDefecto, mimeDefecto) {
  const ext = ((file.name || '').split('.').pop() || extDefecto).toLowerCase().replace(/[^a-z0-9]/g, '') || extDefecto
  const rand = Math.random().toString(36).slice(2, 8)
  const carpeta = String(trabajoId || 'sin-ot').replace(/[^\w-]/g, '')
  const path = `${carpeta}/${Date.now()}-${rand}.${ext}`
  const sr = await fetch('/api/supabase?storage=sign', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  })
  const sd = await sr.json().catch(() => null)
  if (!sr.ok || !sd?.signedUrl) throw new Error(sd?.error || 'No se pudo preparar la subida')
  const up = await fetch(sd.signedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || mimeDefecto },
    body: file,
  })
  if (!up.ok) {
    // Supabase devuelve el 413 ("EntityTooLarge") envuelto en un HTTP 400, y en
    // Safari la peticion se corta antes y solo se ve "Load failed". Se lee el
    // cuerpo para poder decir de verdad que paso.
    const txt = await up.text().catch(() => '')
    if (up.status === 413 || /EntityTooLarge|too large/i.test(txt)) {
      throw new Error('el archivo pesa más de lo que acepta el servidor (50 MB)')
    }
    throw new Error(`Falló la subida (${up.status})`)
  }
  return { url: sd.publicUrl, path }
}

export function subirVideoEvidencia(file, trabajoId) {
  return subirAEvidencias(file, trabajoId, 'mp4', 'video/mp4')
}

// Las fotos iban en base64 DENTRO de la fila de la OT. Medido en produccion: 14
// ordenes cargaban 6,2 MB asi, y la mas pesada 1 MB. Esa fila entera viaja en
// cada guardado y en cada lectura, que es lo que se sentia como "demora para
// guardar la OT". Subiendola aqui, en la orden solo queda el enlace.
export function subirFotoEvidencia(file, trabajoId) {
  return subirAEvidencias(file, trabajoId, 'jpg', 'image/jpeg')
}

// Borra el archivo de un video de evidencia del bucket (al quitarlo de una OT o
// al eliminar la OT). Recibe la evidencia (o su url/path). Silencioso: si falla
// solo deja un huérfano, no rompe el guardado. Solo actúa sobre videos.
export async function borrarVideoEvidencia(evid) {
  const url = typeof evid === 'string' ? evid : (evid?.url || '')
  const path = evid?.path || (url.includes('/evidencias/') ? url.split('/evidencias/')[1] : '')
  if (!path) return false
  try {
    const r = await fetch('/api/supabase?storage=delete', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: decodeURIComponent(path) }),
    })
    return r.ok
  } catch { return false }
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`Tiempo de espera agotado (${REQUEST_TIMEOUT_MS}ms)`)
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

// ---------- TRABAJOS ----------

// Columnas de la LISTA de trabajos: todas las que usa la app MENOS `evidencias`
// (fotos base64: megas). Con select=* esa columna viajaba en cada poll y era el
// ~98% del Fast Origin Transfer de Vercel (2 GB/día). Las fotos de una OT se
// cargan al abrirla con fetchEvidenciasTrabajo().
// OJO: si agregas una columna nueva a la tabla y el front la necesita, súmala aquí.
const TRABAJOS_COLS = [
  'id', 'created_at', 'fecha', 'cedula_cliente', 'cliente', 'telefono_cliente',
  'email_cliente', 'placa', 'marca', 'modelo', 'ano', 'cilindraje', 'kilometraje',
  'tecnico_id', 'estado', 'observaciones', 'items', 'mano_obra', 'mano_obra_extra',
  'subtotal_sin_iva', 'total_iva', 'total', 'pagado', 'metodo_pago', 'ot_codigo',
  'cuentti_id_transacion', 'facturado_en', 'cuentti_resolucion', 'firma_cliente',
  'tipo_aceite', 'proximo_km', 'proxima_visita', 'notas_proximo_mant',
  'sin_vehiculo', 'deleted', 'tareas_hechas', 'crono_inicio', 'crono_acumulado',
  'ingreso',
].join(',')

export async function fetchTrabajos() {
  const url = `${baseProxy}&select=${TRABAJOS_COLS}&order=fecha.desc&limit=500`
  const res = await fetchWithTimeout(url)

  // Si el proxy devuelve error (502 = Supabase error, 503 = conexion fallida)
  if (!res.ok) {
    let detail = ''
    try {
      const err = await res.json()
      detail = err.detail || err.error || ''
    } catch {
      detail = await res.text()
    }
    throw new Error(`Supabase no disponible (${res.status}): ${detail}`)
  }

  return await res.json()
}

// Trae SOLO las evidencias (fotos/videos) de UNA OT, bajo demanda. La lista
// general ya no las incluye (ver TRABAJOS_COLS). Devuelve siempre un array.
export async function fetchEvidenciasTrabajo(id) {
  if (!id) return []
  const res = await fetchWithTimeout(`${baseProxy}&id=eq.${encodeURIComponent(id)}&select=id,evidencias&limit=1`)
  if (!res.ok) throw new Error(`Supabase evidencias error (${res.status})`)
  const rows = await res.json()
  const val = rows?.[0]?.evidencias
  if (!val) return []
  if (Array.isArray(val)) return val
  try { const arr = JSON.parse(val); return Array.isArray(arr) ? arr : [] } catch { return [] }
}

export async function upsertTrabajo(trabajo, opts = {}) {
  const maxRetries = opts.retries ?? 2
  // Despues de migracion: id es text — enviar id del front directamente
  const row = {
    id: trabajo.id,
    plate: trabajo.placa || null,
    fecha: trabajo.fecha,
    cedula_cliente: trabajo.cedula || '',
    cliente: trabajo.cliente || '',
    telefono_cliente: trabajo.telefonoCliente || '',
    email_cliente: trabajo.emailCliente || '',
    placa: trabajo.placa || '',
    marca: trabajo.marca || '',
    modelo: trabajo.modelo || '',
    ano: trabajo.ano || null,
    cilindraje: trabajo.cilindraje || null,
    kilometraje: trabajo.kilometraje || null,
    tecnico_id: trabajo.tecnicoId || null,
    estado: trabajo.estado || 'Pendiente',
    observaciones: trabajo.observaciones || '',
    items: JSON.stringify(trabajo.items || []),
    mano_obra: trabajo.manoObra || 0,
    // M.O. adicional (no facturada): base extra que se le paga al técnico sin
    // cobrarla al cliente. Se persiste para no perderla al re-guardar. En OTs
    // viejas = 0.
    mano_obra_extra: trabajo.manoObraExtra || 0,
    subtotal_sin_iva: trabajo.subtotalSinIva || 0,
    total_iva: trabajo.totalIva || 0,
    total: trabajo.total || 0,
    pagado: trabajo.pagado || false,
    metodo_pago: trabajo.metodoPago || null,
    ot_codigo: trabajo.otCodigo || '',
    // Próximo mantenimiento (lo usa el CRM para recordatorios). Antes se perdía
    // en cada recarga porque no se persistía en Supabase.
    tipo_aceite: trabajo.tipoAceite || null,
    proximo_km: trabajo.proximoKm != null && trabajo.proximoKm !== '' ? String(trabajo.proximoKm) : null,
    proxima_visita: trabajo.proximaVisita || null,
    notas_proximo_mant: trabajo.notasProximoMant || null,
    sin_vehiculo: trabajo.sinVehiculo || false,
    // Ficha del técnico: avance del checklist + cronómetro del trabajo.
    tareas_hechas: trabajo.tareasHechas || [],
    crono_inicio: trabajo.cronoInicio || null,
    crono_acumulado: trabajo.cronoAcumulado || 0,
    // Estado de ingreso del vehículo (inventario + combustible + daños). jsonb → se
    // envía el objeto directo (igual que tareas_hechas), no stringify.
    ingreso: trabajo.ingreso || null,
  }
  // inspeccion: columna no existe aun en Supabase — se preserva en localStorage
  // Para habilitarla: ALTER TABLE trabajos ADD COLUMN IF NOT EXISTS inspeccion jsonb;
  if (trabajo.cuenttiTransacionId) row.cuentti_id_transacion = String(trabajo.cuenttiTransacionId)
  if (trabajo.facturadoEn) row.facturado_en = trabajo.facturadoEn
  if (trabajo.firmaCliente) row.firma_cliente = trabajo.firmaCliente
  if (trabajo.cuenttiResolucion) row.cuentti_resolucion = trabajo.cuenttiResolucion
  // Evidencias (fotos base64, para el portal): SOLO viajan si el llamador las tiene
  // completas (_evidCargadas: el form las trajo con fetchEvidenciasTrabajo, o hay
  // fotos recién tomadas). Como la lista ya no las trae, mandarlas siempre habría
  // BORRADO las fotos del servidor en cada guardado hecho desde un estado sin ellas.
  // El upsert es merge-duplicates: la columna omitida queda intacta en la base.
  if (trabajo._evidCargadas || (Array.isArray(trabajo.evidenciasIngreso) && trabajo.evidenciasIngreso.length > 0)) {
    row.evidencias = JSON.stringify(trabajo.evidenciasIngreso || [])
  }

  // Upsert estandar: si existe id → actualiza, si no → inserta
  let lastErr = null
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetchWithTimeout(`${baseProxy}&upsert=true`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(row),
      })
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
      const data = await res.json()
      return Array.isArray(data) ? data[0] : data
    } catch (e) {
      lastErr = e
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 500 * (attempt + 1) * (attempt + 1)))
      }
    }
  }
  console.warn(`Supabase upsertTrabajo (${trabajo.id}) fallo:`, lastErr?.message)
  return null
}

export async function deleteTrabajo(id) {
  if (!id) return false
  try {
    // Borrado SUAVE: marca deleted=true en vez de borrar la fila. Así la OT sigue
    // en Supabase (su id sigue existiendo) y NO se re-sube desde el cache de otro
    // dispositivo; la app la oculta. Arregla el bug de "borro una OT y resucita".
    const res = await fetchWithTimeout(
      `${baseProxy}&id=eq.${encodeURIComponent(id)}`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deleted: true }) }
    )
    if (!res.ok) throw new Error(await res.text())
    return true
  } catch (e) {
    console.warn('Supabase deleteTrabajo:', e.message)
    return false
  }
}

// ---------- COTIZACIONES ----------

export async function fetchCotizaciones() {
  // Sin firma_aprobacion: es un dataURL (~17 KB por cotización firmada) que no se
  // muestra en el admin y engordaría cada poll a medida que los clientes firmen.
  const cols = 'id,fecha,cedula,cliente,telefono_cliente,placa,marca,modelo,items,subtotal,iva,total,observaciones,validez_dias,estado,created_at,ano,cilindraje,aprobada_en'
  const res = await fetchWithTimeout(`${proxy('cotizaciones')}&select=${cols}&order=fecha.desc&limit=500`)
  if (!res.ok) throw new Error(`Supabase cotizaciones error (${res.status})`)
  return await res.json()
}

export async function upsertCotizacion(cot) {
  const row = {
    id: cot.id,
    fecha: cot.fecha,
    cedula: cot.cedula || '',
    cliente: cot.cliente || '',
    telefono_cliente: cot.telefonoCliente || cot.telefono || '',
    placa: cot.placa || '',
    marca: cot.marca || '',
    modelo: cot.modelo || '',
    ano: cot.ano || null,
    cilindraje: cot.cilindraje || '',
    items: JSON.stringify(cot.items || []),
    subtotal: cot.subtotal || 0,
    iva: cot.iva || 0,
    total: cot.total || 0,
    observaciones: cot.observaciones || '',
    validez_dias: cot.validezDias || 15,
    estado: cot.estado || 'Pendiente',
  }
  const res = await fetchWithTimeout(`${proxy('cotizaciones')}&upsert=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(row),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    const err = new Error(`Cotizacion no se pudo guardar en Supabase (${res.status}): ${detail.slice(0, 200)}`)
    console.error('Supabase upsertCotizacion:', err.message)
    throw err
  }
  return await res.json()
}

export async function deleteCotizacion(id) {
  try {
    const res = await fetchWithTimeout(`${proxy('cotizaciones')}&id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(await res.text())
    return true
  } catch (e) {
    console.warn('Supabase deleteCotizacion:', e.message)
    return false
  }
}

// ---------- CLIENTES (local enriched records, source of truth = Cuentti) ----------

export async function fetchClientesLocal() {
  const res = await fetchWithTimeout(`${proxy('clientes')}&select=*&order=fecha_creacion.desc&limit=1000`)
  if (!res.ok) throw new Error(`Supabase clientes error (${res.status})`)
  return await res.json()
}

export async function upsertClienteLocal(c) {
  try {
    // identificacion es NOT NULL en la tabla — siempre debe llevar valor
    // (mismo valor que cedula, son sinonimos). Si no hay cedula, se omite el upsert.
    const ced = (c.cedula || c.identificacion || '').toString().trim()
    if (!ced) {
      console.warn('Supabase upsertCliente: cliente sin cedula, omitido')
      return null
    }
    const row = {
      id: c.id,
      cuentti_id: c.cuenttiId || null,
      identificacion: ced, // ← columna NOT NULL en Supabase, antes faltaba
      cedula: ced,
      nombre: c.nombre || '',
      telefono1: c.telefono || '',
      email: c.email || '',
      direccion: c.direccion || '',
      ciudad: c.ciudad || '',
      vehiculos: JSON.stringify(c.vehiculos || []),
      fecha_creacion: c.fechaCreacion,
      fecha_ultima_visita: c.fechaUltimaVisita || null,
      total_visitas: c.totalVisitas || 0,
      total_gastado: c.totalGastado || 0,
    }
    const res = await fetchWithTimeout(`${proxy('clientes')}&upsert=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(row),
    })
    if (!res.ok) throw new Error(await res.text())
    return await res.json()
  } catch (e) {
    console.warn('Supabase upsertCliente:', e.message)
    return null
  }
}

// ---------- VEHICULOS ----------

export async function fetchVehiculos() {
  const res = await fetchWithTimeout(`${proxy('vehiculos')}&select=*&order=fecha_creacion.desc&limit=1000`)
  if (!res.ok) throw new Error(`Supabase vehiculos error (${res.status})`)
  return await res.json()
}

export async function upsertVehiculo(v) {
  try {
    const row = {
      id: v.id,
      placa: v.placa,
      marca: v.marca || '',
      modelo: v.modelo || '',
      ano: v.ano || 0,
      cilindraje: v.cilindraje || '',
      cedula_propietario: v.cedulaPropietario || '',
      historial: JSON.stringify(v.historial || []),
      fecha_creacion: v.fechaCreacion,
      fecha_ultimo_servicio: v.fechaUltimoServicio || null,
    }
    const res = await fetchWithTimeout(`${proxy('vehiculos')}&upsert=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(row),
    })
    if (!res.ok) throw new Error(await res.text())
    return await res.json()
  } catch (e) {
    console.warn('Supabase upsertVehiculo:', e.message)
    return null
  }
}

// ---------- INSPECCIONES ----------

export async function fetchInspecciones() {
  const res = await fetchWithTimeout(`${proxy('inspecciones')}&select=*&order=fecha.desc&limit=500`)
  if (!res.ok) throw new Error(`Supabase inspecciones error (${res.status})`)
  return await res.json()
}

export async function upsertInspeccion(insp) {
  try {
    const row = {
      id: insp.id,
      fecha: insp.fecha,
      placa: insp.placa || '',
      cliente: insp.cliente || '',
      cedula: insp.cedula || '',
      vehiculo: insp.vehiculo || '',
      tecnico: insp.tecnico || '',
      km: insp.km || '',
      items: JSON.stringify(insp.items || []),
    }
    const res = await fetchWithTimeout(`${proxy('inspecciones')}&upsert=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(row),
    })
    if (!res.ok) throw new Error(await res.text())
    return await res.json()
  } catch (e) {
    console.warn('Supabase upsertInspeccion:', e.message)
    return null
  }
}

// ---------- MOVIMIENTOS TECNICOS ----------

export async function fetchMovimientos() {
  const res = await fetchWithTimeout(`${proxy('movimientos_tecnicos')}&select=*&order=fecha.desc&limit=500`)
  if (!res.ok) throw new Error(`Supabase movimientos error (${res.status})`)
  return await res.json()
}

export async function upsertMovimiento(m) {
  try {
    const row = {
      id: m.id,
      tecnico_id: m.tecnicoId,
      tipo: m.tipo || 'adelanto',
      monto: m.monto || 0,
      nota: m.nota || '',
      fecha: m.fecha,
    }
    const res = await fetchWithTimeout(`${proxy('movimientos_tecnicos')}&upsert=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(row),
    })
    if (!res.ok) throw new Error(await res.text())
    return await res.json()
  } catch (e) {
    console.warn('Supabase upsertMovimiento:', e.message)
    return null
  }
}

export async function deleteMovimiento(id) {
  try {
    const res = await fetchWithTimeout(`${proxy('movimientos_tecnicos')}&id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(await res.text())
    return true
  } catch (e) {
    console.warn('Supabase deleteMovimiento:', e.message)
    return false
  }
}

// ---------- PRESTAMOS (estado de cuenta por persona) ----------
export async function fetchPrestamos() {
  // limit alto: este libro ahora acumula todos los adelantos/abonos de las
  // liquidaciones (no se compacta); truncarlo callaría deudas viejas.
  const res = await fetchWithTimeout(`${proxy('prestamos_movimientos')}&select=*&order=fecha.desc&limit=5000`)
  if (!res.ok) throw new Error(`Supabase prestamos error (${res.status})`)
  return await res.json()
}

export async function upsertPrestamo(p) {
  try {
    const row = {
      id: p.id,
      persona: p.persona || '',
      tecnico_id: p.tecnicoId ?? null,
      tipo: p.tipo || 'prestamo', // 'prestamo' (+) | 'abono' (-)
      monto: p.monto || 0,
      nota: p.nota || '',
      fecha: p.fecha,
    }
    const res = await fetchWithTimeout(`${proxy('prestamos_movimientos')}&upsert=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(row),
    })
    if (!res.ok) throw new Error(await res.text())
    return await res.json()
  } catch (e) {
    console.warn('Supabase upsertPrestamo:', e.message)
    return null
  }
}

export async function deletePrestamo(id) {
  try {
    const res = await fetchWithTimeout(`${proxy('prestamos_movimientos')}&id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(await res.text())
    return true
  } catch (e) {
    console.warn('Supabase deletePrestamo:', e.message)
    return false
  }
}

// ---------- LIQUIDACION HISTORIAL ----------

export async function fetchLiquidacionHistorial() {
  const res = await fetchWithTimeout(`${proxy('liquidacion_historial')}&select=*&order=fecha.desc&limit=500`)
  if (!res.ok) throw new Error(`Supabase liquidacion_historial error (${res.status})`)
  return await res.json()
}

export async function upsertLiquidacionHistorial(reg) {
  try {
    const row = {
      id: reg.id,
      fecha: reg.fecha,
      tecnico: reg.tecnico || '',
      tecnico_id: reg.tecnicoId,
      trabajos_ids: JSON.stringify(reg.trabajosIds || []),
      cantidad_trabajos: reg.cantidadTrabajos || 0,
      mano_obra: reg.manoObra || 0,
      comision: reg.comision || 0,
      cargos: reg.cargos || 0,
      neto: reg.neto || 0,
      pagado: reg.pagado == null ? null : reg.pagado,
      // Se perdían al guardar: el comprobante re-exportado decía siempre
      // "efectivo", y sin cargos_efectivos un pago con saldo a favor no podía
      // explicar por qué el neto salía mayor que la comisión.
      metodo_pago: reg.metodoPago || null,
      cargos_efectivos: reg.cargosEfectivos == null ? null : reg.cargosEfectivos,
      cuentti_gasto: reg.cuenttiGasto || null,
      movimientos: JSON.stringify(reg.movimientos || []),
      detalle_trabajo: JSON.stringify(reg.detalleTrabajo || []),
    }
    const res = await fetchWithTimeout(`${proxy('liquidacion_historial')}&upsert=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(row),
    })
    if (!res.ok) throw new Error(await res.text())
    return await res.json()
  } catch (e) {
    console.warn('Supabase upsertLiquidacionHistorial:', e.message)
    return null
  }
}

// Borrar UN pago (anular). Antes solo existía el borrado masivo, así que un pago
// equivocado no tenía salida: o se dejaba, o se borraban los 48.
export async function deleteLiquidacionHistorial(id) {
  try {
    const res = await fetchWithTimeout(`${proxy('liquidacion_historial')}&id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(await res.text())
    return true
  } catch (e) {
    console.warn('Supabase deleteLiquidacionHistorial:', e.message)
    return false
  }
}

export async function deleteAllLiquidacionHistorial() {
  try {
    const res = await fetchWithTimeout(`${proxy('liquidacion_historial')}&id=neq.`, { method: 'DELETE' })
    if (!res.ok) throw new Error(await res.text())
    return true
  } catch (e) {
    console.warn('Supabase deleteAllLiquidacionHistorial:', e.message)
    return false
  }
}

// Reconciliación: ¿existe ya este registro de historial en el servidor? Se usa
// cuando el upsert dio timeout (el POST pudo llegar aunque la respuesta se
// perdiera) → si existe, el pago SÍ se guardó y no hay que abortar.
export async function fetchLiquidacionHistorialPorId(id) {
  try {
    const res = await fetchWithTimeout(`${proxy('liquidacion_historial')}&id=eq.${encodeURIComponent(id)}&select=id&limit=1`)
    if (!res.ok) return null
    const rows = await res.json()
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null
  } catch { return null }
}

// Ids de historial que empiezan por un prefijo. Sirve para elegir el siguiente
// sufijo libre (-2, -3…) sin pisar un pago que otro dispositivo creó el mismo día.
export async function fetchLiquidacionIdsPorBase(base) {
  try {
    const res = await fetchWithTimeout(`${proxy('liquidacion_historial')}&id=like.${encodeURIComponent(base + '*')}&select=id&limit=100`)
    if (!res.ok) return []
    const rows = await res.json()
    return Array.isArray(rows) ? rows.map(r => r.id) : []
  } catch { return [] }
}

// ---------- LIQUIDADOS ----------

export async function fetchLiquidados() {
  // order determinista: si algún día pasa de 2000 filas, el corte es estable
  // (no deja trabajos liquidados fuera del set al azar → riesgo de doble pago).
  const res = await fetchWithTimeout(`${proxy('liquidados')}&select=trabajo_id&order=trabajo_id.asc&limit=2000`)
  if (!res.ok) throw new Error(`Supabase liquidados error (${res.status})`)
  const data = await res.json()
  return data.map(r => r.trabajo_id)
}

export async function upsertLiquidados(ids) {
  try {
    const rows = ids.map(id => ({ trabajo_id: id }))
    const res = await fetchWithTimeout(`${proxy('liquidados')}&upsert=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rows),
    })
    if (!res.ok) throw new Error(await res.text())
    return true
  } catch (e) {
    console.warn('Supabase upsertLiquidados:', e.message)
    return false
  }
}

export async function deleteAllLiquidados() {
  try {
    const res = await fetchWithTimeout(`${proxy('liquidados')}&trabajo_id=neq.`, { method: 'DELETE' })
    if (!res.ok) throw new Error(await res.text())
    return true
  } catch (e) {
    console.warn('Supabase deleteAllLiquidados:', e.message)
    return false
  }
}

// Borra UNA clave de liquidado (plano "TR-x" o compuesto "TR-x#tecnico"). Sin
// esto, "desliquidar" solo quitaba la fila del estado local y el sync la revivía.
export async function deleteLiquidado(trabajoId) {
  try {
    const res = await fetchWithTimeout(`${proxy('liquidados')}&trabajo_id=eq.${encodeURIComponent(trabajoId)}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(await res.text())
    return true
  } catch (e) {
    console.warn('Supabase deleteLiquidado:', e.message)
    return false
  }
}

// ---------- TRABAJOS COMPARTIDOS ----------

export async function fetchCompartidos() {
  const res = await fetchWithTimeout(`${proxy('trabajos_compartidos')}&select=trabajo_id,partner_id&limit=2000`)
  if (!res.ok) throw new Error(`Supabase compartidos error (${res.status})`)
  const data = await res.json()
  const obj = {}
  // Valor: { partner: id } si hay compañero guardado, sino true (compartido sin elegir).
  data.forEach(r => { obj[r.trabajo_id] = r.partner_id ? { partner: r.partner_id } : true })
  return obj
}

export async function upsertCompartido(trabajoId, partnerId = null) {
  try {
    const pid = parseInt(partnerId)
    const res = await fetchWithTimeout(`${proxy('trabajos_compartidos')}&upsert=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trabajo_id: trabajoId, compartido: true, partner_id: Number.isNaN(pid) ? null : pid }),
    })
    if (!res.ok) throw new Error(await res.text())
    return true
  } catch (e) {
    console.warn('Supabase upsertCompartido:', e.message)
    return false
  }
}

export async function deleteCompartido(trabajoId) {
  try {
    const res = await fetchWithTimeout(`${proxy('trabajos_compartidos')}&trabajo_id=eq.${encodeURIComponent(trabajoId)}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(await res.text())
    return true
  } catch (e) {
    console.warn('Supabase deleteCompartido:', e.message)
    return false
  }
}

// Confirma en CUENTTI que un pago quedo registrado de verdad. Devuelve
// { confirmado, abono, pendiente, motivo }.
//
// Existe porque Cuentti responde sus errores con HTTP 200: que agregarPagoTransacion
// no lance no prueba que el abono entrara. Aqui se relee la factura y se mira el
// total_abono que dice Cuentti, que es la unica fuente que vale.
//
// confirmado:false NO significa "fallo": puede que Cuentti este caido y no se
// haya podido comprobar. Por eso `motivo` distingue los dos casos y quien llama
// nunca marca pagado a ciegas.
export async function confirmarPagoEnCuentti(idTransacion, valorEsperado = 0) {
  if (!idTransacion) return { confirmado: false, motivo: 'sin id_transacion' }
  try {
    const r = await fetch(`/api/supabase?estadoPago=${encodeURIComponent(idTransacion)}`)
    const d = await r.json().catch(() => null)
    if (!d?.ok) return { confirmado: false, motivo: d?.motivo || 'no se pudo consultar' }
    const abono = Number(d.total_abono || 0)
    // Se compara con tolerancia de 1 peso: Cuentti redondea centavos.
    const esperado = Math.round(Number(valorEsperado) || 0)
    const confirmado = esperado > 0 ? abono >= esperado - 1 : abono > 0
    return { confirmado, abono, pendiente: Number(d.pendiente || 0), motivo: confirmado ? '' : 'Cuentti no registro el abono' }
  } catch (e) {
    return { confirmado: false, motivo: e.message }
  }
}

// Lee de CUENTTI los datos de una factura recien creada. Se usa para sacar el
// id_cliente real: es el unico numero que Cuentti reconoce como suyo al crear el
// recibo de caja. Antes se mandaba -1 cuando la OT no lo tenia, confiando en que
// Cuentti lo resolviera; la factura 5955 demostro que no lo resuelve y el pago
// se perdia en silencio.
export async function datosFacturaCuentti(idTransacion) {
  if (!idTransacion) return null
  try {
    const r = await fetch(`/api/supabase?estadoPago=${encodeURIComponent(idTransacion)}`)
    const d = await r.json().catch(() => null)
    return d?.ok ? d : null
  } catch { return null }
}
