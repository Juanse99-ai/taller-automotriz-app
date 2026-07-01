import { useRef, useEffect, useState } from 'react'

// Lienzo de firma: dibuja con mouse o dedo y devuelve un dataURL PNG.
export default function SignaturePad({ onSave, onCancel, initial }) {
  const canvasRef = useRef(null)
  const drawing = useRef(false)
  const last = useRef(null)
  const [vacio, setVacio] = useState(!initial)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ratio = window.devicePixelRatio || 1
    const w = canvas.clientWidth, h = canvas.clientHeight
    canvas.width = w * ratio
    canvas.height = h * ratio
    const ctx = canvas.getContext('2d')
    ctx.scale(ratio, ratio)
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#0f172a'
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    if (initial) {
      const img = new Image()
      img.onload = () => ctx.drawImage(img, 0, 0, w, h)
      img.src = initial
    }
  }, [initial])

  const pos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    const p = e.touches ? e.touches[0] : e
    return { x: p.clientX - rect.left, y: p.clientY - rect.top }
  }
  const start = (e) => { e.preventDefault(); drawing.current = true; last.current = pos(e); setVacio(false) }
  const move = (e) => {
    if (!drawing.current) return
    e.preventDefault()
    const ctx = canvasRef.current.getContext('2d')
    const p = pos(e)
    ctx.beginPath()
    ctx.moveTo(last.current.x, last.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    last.current = p
  }
  const end = () => { drawing.current = false }

  const limpiar = () => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight)
    setVacio(true)
  }
  const guardar = () => onSave(canvasRef.current.toDataURL('image/png'))

  return (
    <div>
      <canvas ref={canvasRef}
        style={{ width: '100%', height: 200, border: '1px dashed var(--border-strong)', borderRadius: 10, touchAction: 'none', background: '#fff', cursor: 'crosshair', display: 'block' }}
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end} />
      <div style={{ fontSize: 11.5, color: 'var(--text-4)', marginTop: 4 }}>Firma aquí con el mouse o el dedo.</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-outline btn-sm" onClick={limpiar}>Limpiar</button>
        {onCancel && <button type="button" className="btn btn-outline btn-sm" onClick={onCancel}>Cancelar</button>}
        <button type="button" className="btn btn-primary btn-sm" onClick={guardar} disabled={vacio}>Guardar firma</button>
      </div>
    </div>
  )
}
