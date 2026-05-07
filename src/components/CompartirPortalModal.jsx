// Modal reutilizable para compartir el portal del cliente.
// Uso:
//   const [modal, setModal] = useState(null)
//   <button onClick={() => setModal({ cedula, cliente, telefono })}>Compartir</button>
//   {modal && <CompartirPortalModal {...modal} onClose={() => setModal(null)} />}

import { useState } from 'react'
import {
  portalLink,
  enviarPortalWhatsApp,
  copiarPortalLink,
  portalQR,
} from '../utils/portalLink'

export default function CompartirPortalModal({ cedula = '', cliente = '', telefono = '', onClose }) {
  const [ced, setCed] = useState(cedula)
  const [copiado, setCopiado] = useState(false)
  const link = portalLink(ced)
  const qr = portalQR(ced)

  const copiar = async () => {
    const ok = await copiarPortalLink(ced)
    if (ok) {
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1800)
    }
  }

  const whatsapp = () => enviarPortalWhatsApp(telefono, cliente, ced)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="modal__h">
          <div>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Compartir Portal del Cliente</h3>
            <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--text-3)' }}>
              {cliente ? `Para ${cliente}` : 'Genera un link para que el cliente vea el estado de su vehiculo'}
            </p>
          </div>
          <button className="icobtn" onClick={onClose}>✕</button>
        </div>
        <div className="modal__b" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="field">
            <label>Cedula del cliente <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>(opcional)</span></label>
            <input
              className="input mono"
              placeholder="1.045.678.234"
              value={ced}
              onChange={e => setCed(e.target.value)}
            />
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 6 }}>
              {ced.replace(/[.\-\s]/g, '')
                ? 'Link personalizado: el cliente entra directo, sin escribir cedula.'
                : 'Sin cedula: link generico, el cliente escribira su numero al entrar.'}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
            <div className="input mono" style={{ padding: '12px 14px', fontSize: 13, wordBreak: 'break-all', background: 'var(--bg-subtle)', display: 'flex', alignItems: 'center' }}>
              {link}
            </div>
            <button className="btn btn-outline" onClick={copiar}>
              {copiado ? 'Copiado' : 'Copiar'}
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 18, alignItems: 'center', padding: 14, background: 'var(--bg-subtle)', borderRadius: 12, border: '1px solid var(--border)' }}>
            <div style={{ background: '#fff', borderRadius: 10, padding: 8, border: '1px solid var(--border)' }}>
              <img src={qr} alt="QR del portal" style={{ width: '100%', height: 'auto', display: 'block' }} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Codigo QR</div>
              <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 10px', lineHeight: 1.5 }}>
                Imprimelo y pegalo en recepcion para que los clientes escaneen con su celular.
              </p>
              <button className="btn btn-outline btn-sm" onClick={() => window.open(qr, '_blank')}>
                Abrir para imprimir
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-primary"
              style={{ flex: 1, background: '#25d366', borderColor: '#25d366' }}
              onClick={whatsapp}
            >
              Enviar por WhatsApp
            </button>
            <button className="btn btn-outline" onClick={() => window.open(link, '_blank')}>
              Ver asi
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
