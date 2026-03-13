import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://qvjmyfvrdeebtbhuzzkw.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2am15ZnZyZGVlYnRiaHV6emt3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA5OTY1MDMsImV4cCI6MjA3NjU3MjUwM30.2V6ag-H06Qw4XDLUnU4KkxEz_gK7w817PwgX3M4ZJC8'

let supabase = null

export function getSupabase() {
  if (!supabase) {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON)
  }
  return supabase
}

// ---------- TRABAJOS ----------

export async function fetchTrabajos() {
  try {
    const sb = getSupabase()
    const { data, error } = await sb
      .from('trabajos')
      .select('*')
      .order('fecha', { ascending: false })
      .limit(500)
    if (error) throw error
    return data || []
  } catch (e) {
    console.warn('Supabase fetchTrabajos:', e.message)
    return []
  }
}

export async function upsertTrabajo(trabajo) {
  try {
    const sb = getSupabase()
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
    const { data, error } = await sb.from('trabajos').upsert(row, { onConflict: 'id' }).select()
    if (error) throw error
    return data?.[0]
  } catch (e) {
    console.warn('Supabase upsertTrabajo:', e.message)
    return null
  }
}

export async function deleteTrabajo(id) {
  try {
    const sb = getSupabase()
    const { error } = await sb.from('trabajos').delete().eq('id', id)
    if (error) throw error
    return true
  } catch (e) {
    console.warn('Supabase deleteTrabajo:', e.message)
    return false
  }
}
