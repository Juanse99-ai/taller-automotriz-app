// Cliente a traves de proxy backend para evitar CORS
const baseProxy = '/api/supabase?table=trabajos'
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

export async function upsertTrabajo(trabajo) {
  try {
    const row = {
      id: trabajo.id,
      fecha: trabajo.fecha,
      cedula_cliente: trabajo.cedula,
      cliente: trabajo.cliente,
      telefono_cliente: trabajo.telefonoCliente || '',
      email_cliente: trabajo.emailCliente || '',
      placa: trabajo.placa,
      marca: trabajo.marca,
      modelo: trabajo.modelo,
      ano: trabajo.ano,
      kilometraje: trabajo.kilometraje,
      tecnico_id: trabajo.tecnicoId,
      estado: trabajo.estado,
      observaciones: trabajo.observaciones || '',
      items: JSON.stringify(trabajo.items || []),
      mano_obra: trabajo.manoObra || 0,
      subtotal_sin_iva: trabajo.subtotalSinIva || 0,
      total_iva: trabajo.totalIva || 0,
      total: trabajo.total || 0,
      pagado: trabajo.pagado || false,
      metodo_pago: trabajo.metodoPago || null,
    }
    const res = await fetchWithTimeout(baseProxy, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(row),
    })
    if (!res.ok) throw new Error(await res.text())
    const data = await res.json()
    return Array.isArray(data) ? data[0] : data
  } catch (e) {
    console.warn('Supabase upsertTrabajo:', e.message)
    return null
  }
}

export async function deleteTrabajo(id) {
  try {
    const res = await fetchWithTimeout(`${baseProxy}&id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(await res.text())
    return true
  } catch (e) {
    console.warn('Supabase deleteTrabajo:', e.message)
    return false
  }
}
