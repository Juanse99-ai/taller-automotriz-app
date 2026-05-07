// Cliente a traves de proxy backend para evitar CORS
const proxy = (table) => `/api/supabase?table=${table}`
const baseProxy = proxy('trabajos')
const REQUEST_TIMEOUT_MS = 12000

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

export async function fetchTrabajos() {
  const url = `${baseProxy}&select=*&order=fecha.desc&limit=500`
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

export async function upsertTrabajo(trabajo, opts = {}) {
  const maxRetries = opts.retries ?? 2
  // NOTA: No enviar 'id' — es integer auto-generado en Supabase
  // Usar 'ot_codigo' como clave de sincronizacion entre dispositivos
  const row = {
    plate: trabajo.placa || 'N/A', // NOT NULL en esquema original
    fecha: trabajo.fecha,
    cedula_cliente: trabajo.cedula || '',
    cliente: trabajo.cliente || '',
    telefono_cliente: trabajo.telefonoCliente || '',
    email_cliente: trabajo.emailCliente || '',
    placa: trabajo.placa || '',
    marca: trabajo.marca || '',
    modelo: trabajo.modelo || '',
    ano: trabajo.ano || null,
    kilometraje: trabajo.kilometraje || null,
    tecnico_id: trabajo.tecnicoId || null,
    estado: trabajo.estado || 'Pendiente',
    observaciones: trabajo.observaciones || '',
    items: JSON.stringify(trabajo.items || []),
    mano_obra: trabajo.manoObra || 0,
    subtotal_sin_iva: trabajo.subtotalSinIva || 0,
    total_iva: trabajo.totalIva || 0,
    total: trabajo.total || 0,
    pagado: trabajo.pagado || false,
    metodo_pago: trabajo.metodoPago || null,
    ot_codigo: trabajo.otCodigo || '',
    inspeccion: trabajo.inspeccion ? JSON.stringify(trabajo.inspeccion) : null,
  }
  if (trabajo.cuenttiTransacionId) row.cuentti_id_transacion = String(trabajo.cuenttiTransacionId)
  if (trabajo.facturadoEn) row.facturado_en = trabajo.facturadoEn
  if (trabajo.cuenttiResolucion) row.cuentti_resolucion = trabajo.cuenttiResolucion

  const otCodigo = trabajo.otCodigo || ''

  // Patron find-then-update: buscar por ot_codigo, si existe → PATCH, si no → INSERT
  if (otCodigo) {
    try {
      const findRes = await fetchWithTimeout(
        `${baseProxy}&ot_codigo=eq.${encodeURIComponent(otCodigo)}&select=id&limit=1`
      )
      if (findRes.ok) {
        const existing = await findRes.json()
        if (existing.length > 0) {
          // PATCH registro existente
          const patchRes = await fetchWithTimeout(
            `${baseProxy}&ot_codigo=eq.${encodeURIComponent(otCodigo)}`,
            {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
              body: JSON.stringify(row),
            }
          )
          if (patchRes.ok) {
            const data = await patchRes.json()
            return Array.isArray(data) ? data[0] : data
          }
        }
      }
    } catch (e) {
      // Si falla la busqueda, intentar INSERT
      console.warn('Find existente fallo, intentando insert:', e.message)
    }
  }

  // INSERT nuevo registro (sin id — auto-generado)
  let lastErr = null
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetchWithTimeout(baseProxy, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
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
  console.warn(`Supabase upsertTrabajo (${otCodigo || trabajo.id}) fallo:`, lastErr?.message)
  return null
}

export async function deleteTrabajo(otCodigo) {
  if (!otCodigo) return false
  try {
    // Buscar por ot_codigo (no por id, que es integer auto-generado)
    const res = await fetchWithTimeout(
      `${baseProxy}&ot_codigo=eq.${encodeURIComponent(otCodigo)}`,
      { method: 'DELETE' }
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
  const res = await fetchWithTimeout(`${proxy('cotizaciones')}&select=*&order=fecha.desc&limit=500`)
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
    const row = {
      id: c.id,
      cuentti_id: c.cuenttiId || null,
      cedula: c.cedula || '',
      nombre: c.nombre || '',
      telefono: c.telefono || '',
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

// ---------- LIQUIDADOS ----------

export async function fetchLiquidados() {
  const res = await fetchWithTimeout(`${proxy('liquidados')}&select=trabajo_id&limit=2000`)
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

// ---------- TRABAJOS COMPARTIDOS ----------

export async function fetchCompartidos() {
  const res = await fetchWithTimeout(`${proxy('trabajos_compartidos')}&select=trabajo_id&limit=2000`)
  if (!res.ok) throw new Error(`Supabase compartidos error (${res.status})`)
  const data = await res.json()
  const obj = {}
  data.forEach(r => { obj[r.trabajo_id] = true })
  return obj
}

export async function upsertCompartido(trabajoId) {
  try {
    const res = await fetchWithTimeout(`${proxy('trabajos_compartidos')}&upsert=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trabajo_id: trabajoId, compartido: true }),
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
