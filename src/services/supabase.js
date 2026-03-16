// Cliente a través de proxy backend para evitar CORS
const baseProxy = '/api/supabase?table=trabajos'

// ---------- TRABAJOS ----------

export async function fetchTrabajos() {
  try {
    const url = `${baseProxy}&select=*&order=fecha.desc&limit=500`
    const res = await fetch(url)
    if (!res.ok) throw new Error(await res.text())
    return await res.json()
  } catch (e) {
    console.warn('Supabase fetchTrabajos:', e.message)
    return []
  }
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
      // otCodigo solo vive local; evitar error si tabla no tiene columna
    }
    const res = await fetch(baseProxy, {
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
    const res = await fetch(`${baseProxy}&id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(await res.text())
    return true
  } catch (e) {
    console.warn('Supabase deleteTrabajo:', e.message)
    return false
  }
}
