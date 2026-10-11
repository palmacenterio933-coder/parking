import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'

/* ───────── Ajustes ───────── */
const PAIS = '57' // indicativo de Colombia para WhatsApp
const DIAS_AVISO = 5 // "por vencer" = faltan 5 días o menos
const METODOS = ['Efectivo', 'Nequi', 'Daviplata', 'Transferencia']
const CATEGORIAS = ['Servicios (luz, agua)', 'Vigilancia / nómina', 'Arriendo', 'Mantenimiento', 'Impuestos', 'Otros']

/* ───────── Utilidades ───────── */
const cop = (n) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0)

const toStr = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const parse = (s) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const hoyStr = () => toStr(new Date())
const addMes = (s, n = 1) => {
  const d = parse(s)
  const dia = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + n)
  const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(dia, ultimo))
  return toStr(d)
}
const diasPara = (s) => Math.round((parse(s) - parse(hoyStr())) / 86400000)
const fechaCorta = (s) => parse(s).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })

const mesKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
const moverMes = (k, n) => {
  const [y, m] = k.split('-').map(Number)
  return mesKey(new Date(y, m - 1 + n, 1))
}
const nombreMes = (k) => {
  const [y, m] = k.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })
}
const mesCorto = (k) => {
  const [y, m] = k.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('es-CO', { month: 'short' }).replace('.', '')
}
const suma = (lista, campo = 'monto') => lista.reduce((t, x) => t + Number(x[campo] || 0), 0)

const estado = (c) => {
  const d = diasPara(c.vence)
  return d < 0 ? 'mora' : d <= DIAS_AVISO ? 'pronto' : 'ok'
}
const ETQ = { ok: 'Al día', pronto: 'Por vencer', mora: 'En mora', libre: 'Libre' }

const textoPlazo = (c) => {
  const d = diasPara(c.vence)
  if (d < 0) return `Venció el ${fechaCorta(c.vence)} · ${-d} ${-d === 1 ? 'día' : 'días'} de mora`
  if (d === 0) return 'Vence hoy'
  if (d === 1) return 'Vence mañana'
  return `Vence el ${fechaCorta(c.vence)} · en ${d} días`
}

const waLink = (c) => {
  const tel = (c.telefono || '').replace(/\D/g, '')
  const completo = tel.length > 10 && tel.startsWith(PAIS) ? tel : PAIS + tel
  const msg =
    diasPara(c.vence) < 0
      ? `Hola ${c.nombre}, le recordamos que la mensualidad del parqueadero (${cop(c.valor_mensual)}) venció el ${fechaCorta(c.vence)}. Gracias.`
      : `Hola ${c.nombre}, le recordamos que su mensualidad del parqueadero (${cop(c.valor_mensual)}) vence el ${fechaCorta(c.vence)}. Gracias.`
  return `https://wa.me/${completo}?text=${encodeURIComponent(msg)}`
}

/* ───────── Piezas reutilizables ───────── */
function Hoja({ titulo, onClose, children }) {
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div className="fondo" onClick={onClose}>
      <div className="hoja" role="dialog" aria-modal="true" aria-label={titulo} onClick={(e) => e.stopPropagation()}>
        <div className="hoja-cab">
          <h2>{titulo}</h2>
          <button className="x" onClick={onClose} aria-label="Cerrar">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

const Campo = ({ etiqueta, children }) => (
  <label className="campo">
    <span>{etiqueta}</span>
    {children}
  </label>
)

const Sello = ({ e }) => <span className={`sello ${e}`}>{ETQ[e]}</span>

/* ───────── Mapa: posiciones y dibujo del vehículo ───────── */
const MAX_COLS = 6
const COLOR = { ok: '#3fae74', pronto: '#f0a91d', mora: '#e4513b' }
const clave = (f, k) => `${f},${k}`

// Les da un lugar en la cuadrícula a las celdas que aún no lo tienen
function colocar(lista) {
  const ord = [...lista].sort((a, b) => a.numero.localeCompare(b.numero, 'es', { numeric: true }))
  const conPos = ord.filter((c) => c.fila != null && c.col != null)
  const cols = Math.min(MAX_COLS, Math.max(4, ...conPos.map((c) => c.col + 1)))
  const usados = new Set(conPos.map((c) => clave(c.fila, c.col)))
  let i = 0
  const siguiente = () => {
    for (;;) {
      const f = Math.floor(i / cols), k = i % cols
      i++
      if (!usados.has(clave(f, k))) { usados.add(clave(f, k)); return { fila: f, col: k } }
    }
  }
  return { cols, celdas: ord.map((c) => (c.fila != null && c.col != null ? c : { ...c, ...siguiente() })) }
}

function huecos(lista, cols, n) {
  const usados = new Set(lista.map((c) => clave(c.fila, c.col)))
  const out = []
  for (let i = 0; out.length < n; i++) {
    const f = Math.floor(i / cols), k = i % cols
    if (!usados.has(clave(f, k))) out.push({ fila: f, col: k })
  }
  return out
}

// Vehículo visto desde arriba (el frente mira hacia arriba)
function Auto({ tipo, color }) {
  if (tipo === 'moto') {
    return (
      <svg className="auto" viewBox="0 0 60 100" aria-hidden="true">
        <rect x="26" y="6" width="8" height="26" rx="4" fill="#0a1128" />
        <rect x="26" y="68" width="8" height="26" rx="4" fill="#0a1128" />
        <rect x="12" y="30" width="36" height="5" rx="2.5" fill="#0a1128" />
        <ellipse cx="30" cy="52" rx="11" ry="21" fill={color} />
        <ellipse cx="30" cy="46" rx="6" ry="9" fill="#0a1128" opacity=".45" />
      </svg>
    )
  }
  return (
    <svg className="auto" viewBox="0 0 60 100" aria-hidden="true">
      <rect x="3" y="16" width="9" height="20" rx="3" fill="#0a1128" />
      <rect x="48" y="16" width="9" height="20" rx="3" fill="#0a1128" />
      <rect x="3" y="64" width="9" height="20" rx="3" fill="#0a1128" />
      <rect x="48" y="64" width="9" height="20" rx="3" fill="#0a1128" />
      <rect x="9" y="3" width="42" height="94" rx="17" fill={color} />
      <rect x="14" y="6" width="9" height="4" rx="2" fill="#fff6c8" />
      <rect x="37" y="6" width="9" height="4" rx="2" fill="#fff6c8" />
      <path d="M16 28 Q30 22 44 28 L42 43 Q30 40 18 43Z" fill="#0a1128" opacity=".8" />
      <rect x="17" y="45" width="26" height="22" rx="6" fill="#000" opacity=".16" />
      <path d="M18 70 Q30 67 42 70 L44 82 Q30 86 16 82Z" fill="#0a1128" opacity=".8" />
    </svg>
  )
}

function FormNumero({ inicial, boton, onGuardar, onCerrar }) {
  const [n, setN] = useState(inicial)
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (n.trim()) onGuardar(n.trim()) }}>
      <Campo etiqueta="Número o nombre de la celda">
        <input value={n} onChange={(e) => setN(e.target.value)} maxLength={8} required autoFocus />
      </Campo>
      <div className="acciones">
        <button type="button" className="btn sec" onClick={onCerrar}>Cancelar</button>
        <button className="btn primario">{boton}</button>
      </div>
    </form>
  )
}

/* ───────── Ingreso ───────── */
function Login() {
  const [email, setEmail] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  const entrar = async (e) => {
    e.preventDefault()
    setCargando(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password: clave })
    if (error) setError('Correo o contraseña incorrectos.')
    setCargando(false)
  }

  return (
    <main className="login">
      <div className="login-caja">
        <h1>Parqueadero</h1>
        <p className="suave">Ingresa para ver las celdas y las mensualidades.</p>
        <form onSubmit={entrar}>
          <Campo etiqueta="Correo">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </Campo>
          <Campo etiqueta="Contraseña">
            <input type="password" value={clave} onChange={(e) => setClave(e.target.value)} required autoComplete="current-password" />
          </Campo>
          {error && <p className="error">{error}</p>}
          <button className="btn primario grande" disabled={cargando}>{cargando ? 'Entrando…' : 'Entrar'}</button>
        </form>
      </div>
    </main>
  )
}

/* ───────── Formulario de cliente ───────── */
function FormCliente({ inicial, celdasLibres, onGuardar, onCerrar, onRetirar, onEliminar }) {
  const nuevo = !inicial.id
  const [f, setF] = useState({
    nombre: '',
    tipo_vehiculo: 'carro',
    vence: addMes(hoyStr()),
    ...inicial,
    telefono: inicial.telefono ?? '',
    placa: inicial.placa ?? '',
    celda_id: inicial.celda_id ?? '',
    valor_mensual: inicial.valor_mensual ?? '',
  })
  const [pagoInicial, setPagoInicial] = useState(true)
  const [metodo, setMetodo] = useState('Efectivo')
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onGuardar(f, nuevo && pagoInicial ? metodo : null)
      }}
    >
      <Campo etiqueta="Nombre"><input value={f.nombre} onChange={set('nombre')} required /></Campo>
      <Campo etiqueta="Celular (WhatsApp)"><input type="tel" inputMode="tel" value={f.telefono} onChange={set('telefono')} placeholder="3001234567" /></Campo>
      <div className="fila2">
        <Campo etiqueta="Placa"><input value={f.placa} onChange={set('placa')} placeholder="ABC123" maxLength={7} /></Campo>
        <Campo etiqueta="Vehículo">
          <select value={f.tipo_vehiculo} onChange={set('tipo_vehiculo')}>
            <option value="carro">Carro</option>
            <option value="moto">Moto</option>
            <option value="camioneta">Camioneta</option>
          </select>
        </Campo>
      </div>
      <div className="fila2">
        <Campo etiqueta="Celda">
          <select value={f.celda_id} onChange={set('celda_id')}>
            <option value="">Sin celda</option>
            {celdasLibres.map((c) => <option key={c.id} value={c.id}>{c.numero}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Mensualidad ($)">
          <input type="number" inputMode="numeric" min="0" value={f.valor_mensual} onChange={set('valor_mensual')} required />
        </Campo>
      </div>
      <Campo etiqueta={nuevo ? 'Primer vencimiento' : 'Vence el'}>
        <input type="date" value={f.vence} onChange={set('vence')} required />
      </Campo>
      {nuevo && (
        <div className="caja">
          <label className="check">
            <input type="checkbox" checked={pagoInicial} onChange={(e) => setPagoInicial(e.target.checked)} />
            Ya pagó el primer mes
          </label>
          {pagoInicial && (
            <Campo etiqueta="Forma de pago">
              <select value={metodo} onChange={(e) => setMetodo(e.target.value)}>
                {METODOS.map((m) => <option key={m}>{m}</option>)}
              </select>
            </Campo>
          )}
        </div>
      )}
      <div className="acciones">
        <button type="button" className="btn sec" onClick={onCerrar}>Cancelar</button>
        <button className="btn primario">Guardar</button>
      </div>
      {!nuevo && (
        <div className="acciones col sep">
          <button type="button" className="btn sec" onClick={onRetirar}>Retirar (conserva su historial)</button>
          <button type="button" className="btn peligro" onClick={onEliminar}>Eliminar cliente y sus pagos</button>
        </div>
      )}
    </form>
  )
}

/* ───────── Registrar pago ───────── */
function FormPago({ cliente, onGuardar, onCerrar }) {
  const base = diasPara(cliente.vence) > 0 ? cliente.vence : hoyStr()
  const [monto, setMonto] = useState(cliente.valor_mensual)
  const [metodo, setMetodo] = useState('Efectivo')
  const [vence, setVence] = useState(addMes(base))

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onGuardar({ monto: Number(monto), metodo, vence_hasta: vence })
      }}
    >
      <p className="suave">{cliente.nombre} · {textoPlazo(cliente)}</p>
      <Campo etiqueta="Valor recibido ($)">
        <input type="number" inputMode="numeric" min="0" value={monto} onChange={(e) => setMonto(e.target.value)} required />
      </Campo>
      <Campo etiqueta="Forma de pago">
        <select value={metodo} onChange={(e) => setMetodo(e.target.value)}>
          {METODOS.map((m) => <option key={m}>{m}</option>)}
        </select>
      </Campo>
      <Campo etiqueta="Nuevo vencimiento">
        <input type="date" value={vence} onChange={(e) => setVence(e.target.value)} required />
      </Campo>
      <div className="acciones">
        <button type="button" className="btn sec" onClick={onCerrar}>Cancelar</button>
        <button className="btn primario">Guardar pago</button>
      </div>
    </form>
  )
}

/* ───────── Crear celdas ───────── */
function FormCeldas({ onGuardar, onCerrar }) {
  const [prefijo, setPrefijo] = useState('')
  const [desde, setDesde] = useState(1)
  const [hasta, setHasta] = useState(10)
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onGuardar(prefijo.trim(), Number(desde), Number(hasta))
      }}
    >
      <p className="suave">Crea varias celdas de una vez. Las que ya existen se omiten.</p>
      <div className="fila3">
        <Campo etiqueta="Prefijo (opcional)"><input value={prefijo} onChange={(e) => setPrefijo(e.target.value)} placeholder="A" maxLength={3} /></Campo>
        <Campo etiqueta="Desde"><input type="number" min="1" value={desde} onChange={(e) => setDesde(e.target.value)} required /></Campo>
        <Campo etiqueta="Hasta"><input type="number" min="1" value={hasta} onChange={(e) => setHasta(e.target.value)} required /></Campo>
      </div>
      <div className="acciones">
        <button type="button" className="btn sec" onClick={onCerrar}>Cancelar</button>
        <button className="btn primario">Crear celdas</button>
      </div>
    </form>
  )
}

/* ───────── Pantallas ───────── */
function Mapa({ celdas, cols, clientePorCelda, clientes, editando, moviendo, onCelda, onHueco, onEditar, onCrear }) {
  const ocupadas = celdas.filter((c) => clientePorCelda[c.id]).length
  const enMora = clientes.filter((c) => estado(c) === 'mora').length
  const filas = Math.max(1, ...celdas.map((c) => c.fila + 1)) + (editando ? 1 : 0)
  const colsVis = editando && cols < MAX_COLS ? cols + 1 : cols
  const porPos = Object.fromEntries(celdas.map((c) => [clave(c.fila, c.col), c]))
  const slots = []
  for (let f = 0; f < filas; f++) for (let k = 0; k < colsVis; k++) slots.push([f, k])

  return (
    <>
      <div className="resumen">
        <div><b>{celdas.length - ocupadas}</b><span>libres</span></div>
        <div><b>{ocupadas}</b><span>ocupadas</span></div>
        <div className={enMora ? 'alerta' : ''}><b>{enMora}</b><span>en mora</span></div>
      </div>

      <div className="mapa-cab">
        <h2>Mapa de espacios</h2>
        <button className={`btn chico ${editando ? 'primario' : 'sec'}`} onClick={onEditar}>
          {editando ? 'Listo' : 'Editar mapa'}
        </button>
      </div>

      {moviendo && <p className="guia">Toca el lugar donde irá la celda {moviendo.numero}. Si tocas otra celda, se intercambian.</p>}
      {editando && !moviendo && <p className="guia">Toca un espacio con + para crear una celda. Toca una celda para renombrarla, moverla o eliminarla.</p>}

      {celdas.length === 0 && !editando ? (
        <div className="vacio">
          <p>Todavía no hay celdas.</p>
          <button className="btn primario" onClick={onCrear}>Crear celdas</button>
        </div>
      ) : (
        <div className="patio" style={{ gridTemplateColumns: `repeat(${colsVis}, minmax(0, 1fr))` }}>
          {slots.map(([f, k]) => {
            const c = porPos[clave(f, k)]
            if (!c) {
              return editando
                ? <button key={clave(f, k)} className="hueco" onClick={() => onHueco(f, k)} aria-label="Crear celda aquí">+</button>
                : <div key={clave(f, k)} />
            }
            const cli = clientePorCelda[c.id]
            const e = cli ? estado(cli) : 'libre'
            return (
              <button key={c.id} className={`celda ${e} ${moviendo?.id === c.id ? 'sel' : ''}`} onClick={() => onCelda(c)}>
                <span className="num">{c.numero}</span>
                {cli ? (
                  <>
                    <Auto tipo={cli.tipo_vehiculo} color={COLOR[e]} />
                    <span className="placa-mini">{cli.placa || cli.nombre.split(' ')[0]}</span>
                  </>
                ) : (
                  <span className="libre-txt">Libre</span>
                )}
                <span className="barra">{ETQ[e]}</span>
              </button>
            )
          })}
        </div>
      )}

      <div className="leyenda">
        {['libre', 'ok', 'pronto', 'mora'].map((e) => (
          <span key={e}><i className={`pt ${e}`} />{ETQ[e]}</span>
        ))}
      </div>
      {celdas.length > 0 && (
        <button className="btn sec ancho" onClick={onCrear}>Agregar varias celdas</button>
      )}
    </>
  )
}

function Clientes({ clientes, celdaDe, onNuevo, onEditar }) {
  const [q, setQ] = useState('')
  const lista = clientes.filter((c) =>
    `${c.nombre} ${c.placa || ''}`.toLowerCase().includes(q.trim().toLowerCase())
  )
  return (
    <>
      <div className="barra-busca">
        <input type="search" placeholder="Buscar por nombre o placa" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn primario" onClick={onNuevo}>Nuevo</button>
      </div>
      {lista.length === 0 && <p className="vacio">{clientes.length ? 'Nadie coincide con la búsqueda.' : 'Aún no hay clientes. Toca “Nuevo” para agregar el primero.'}</p>}
      <ul className="lista">
        {lista.map((c) => {
          const celda = celdaDe(c)
          return (
            <li key={c.id}>
              <button className="fila" onClick={() => onEditar(c)}>
                <span className="placa">{c.placa || '—'}</span>
                <span className="datos">
                  <strong>{c.nombre}</strong>
                  <small>{celda ? `Celda ${celda.numero}` : 'Sin celda'} · {cop(c.valor_mensual)}</small>
                </span>
                <Sello e={estado(c)} />
              </button>
            </li>
          )
        })}
      </ul>
    </>
  )
}

function Cobros({ clientes, pagos, celdaDe, onCobrar }) {
  const pendientes = clientes
    .filter((c) => estado(c) !== 'ok')
    .sort((a, b) => a.vence.localeCompare(b.vence))
  const mes = hoyStr().slice(0, 7)
  const total = pagos.filter((p) => p.fecha.startsWith(mes)).reduce((s, p) => s + Number(p.monto), 0)
  const nombreMes = new Date().toLocaleDateString('es-CO', { month: 'long' })
  const esperado = clientes.reduce((s, c) => s + Number(c.valor_mensual), 0)

  return (
    <>
      <div className="recaudo">
        <span>Recaudado en {nombreMes}</span>
        <b>{cop(total)}</b>
        <small>Mensualidades activas: {cop(esperado)} al mes</small>
      </div>

      <h2 className="sec">Por cobrar</h2>
      {pendientes.length === 0 && <p className="vacio">Todos están al día.</p>}
      <ul className="lista">
        {pendientes.map((c) => {
          const celda = celdaDe(c)
          return (
            <li key={c.id} className={`cobro ${estado(c)}`}>
              <div className="cobro-info">
                <strong>{c.nombre}</strong>
                <small>{celda ? `Celda ${celda.numero}` : 'Sin celda'} · {c.placa || 'sin placa'}</small>
                <small>{textoPlazo(c)}</small>
              </div>
              <div className="cobro-acc">
                <b>{cop(c.valor_mensual)}</b>
                <div>
                  {c.telefono && (
                    <a className="btn sec chico" href={waLink(c)} target="_blank" rel="noreferrer">WhatsApp</a>
                  )}
                  <button className="btn primario chico" onClick={() => onCobrar(c)}>Cobrar</button>
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      <h2 className="sec">Últimos pagos</h2>
      {pagos.length === 0 && <p className="vacio">Aún no hay pagos registrados.</p>}
      <ul className="lista">
        {pagos.slice(0, 30).map((p) => (
          <li key={p.id} className="pago">
            <span className="datos">
              <strong>{p.clientes?.nombre || 'Cliente'}</strong>
              <small>{fechaCorta(p.fecha)} · {p.metodo}</small>
            </span>
            <b>{cop(p.monto)}</b>
          </li>
        ))}
      </ul>
    </>
  )
}

/* ───────── Gastos ───────── */
function SelectorMes({ mes, onCambiar }) {
  return (
    <div className="mes-sel">
      <button onClick={() => onCambiar(moverMes(mes, -1))} aria-label="Mes anterior">‹</button>
      <strong>{nombreMes(mes)}</strong>
      <button onClick={() => onCambiar(moverMes(mes, 1))} disabled={mes >= mesKey()} aria-label="Mes siguiente">›</button>
    </div>
  )
}

function FormGasto({ inicial, onGuardar, onEliminar, onCerrar }) {
  const [f, setF] = useState({ concepto: '', categoria: CATEGORIAS[0], monto: '', fecha: hoyStr(), ...inicial })
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  return (
    <form onSubmit={(e) => { e.preventDefault(); onGuardar(f) }}>
      <Campo etiqueta="¿En qué se gastó?"><input value={f.concepto} onChange={set('concepto')} placeholder="Recibo de la luz" required /></Campo>
      <Campo etiqueta="Categoría">
        <select value={f.categoria} onChange={set('categoria')}>
          {CATEGORIAS.map((c) => <option key={c}>{c}</option>)}
        </select>
      </Campo>
      <div className="fila2">
        <Campo etiqueta="Valor ($)"><input type="number" inputMode="numeric" min="0" value={f.monto} onChange={set('monto')} required /></Campo>
        <Campo etiqueta="Fecha"><input type="date" value={f.fecha} onChange={set('fecha')} required /></Campo>
      </div>
      <div className="acciones">
        <button type="button" className="btn sec" onClick={onCerrar}>Cancelar</button>
        <button className="btn primario">Guardar</button>
      </div>
      {f.id && (
        <div className="acciones col sep">
          <button type="button" className="btn peligro" onClick={onEliminar}>Eliminar gasto</button>
        </div>
      )}
    </form>
  )
}

function Gastos({ gastos, onNuevo, onEditar }) {
  const [mes, setMes] = useState(mesKey())
  const lista = gastos.filter((g) => g.fecha.startsWith(mes))
  return (
    <>
      <SelectorMes mes={mes} onCambiar={setMes} />
      <div className="recaudo">
        <span>Gastos de {nombreMes(mes)}</span>
        <b>{cop(suma(lista))}</b>
        <small>{lista.length} {lista.length === 1 ? 'gasto registrado' : 'gastos registrados'}</small>
      </div>
      <button className="btn primario ancho grande sep" onClick={onNuevo}>Registrar gasto</button>
      {lista.length === 0 && <p className="vacio">No hay gastos en este mes.</p>}
      <ul className="lista sep">
        {lista.map((g) => (
          <li key={g.id}>
            <button className="fila" onClick={() => onEditar(g)}>
              <span className="datos">
                <strong>{g.concepto}</strong>
                <small>{g.categoria} · {fechaCorta(g.fecha)}</small>
              </span>
              <b>{cop(g.monto)}</b>
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

/* ───────── Rentabilidad ───────── */
function Rentabilidad({ pagos, gastos, clientes, celdas }) {
  const [mes, setMes] = useState(mesKey())
  const ingresos = suma(pagos.filter((p) => p.fecha.startsWith(mes)))
  const gastosMes = gastos.filter((g) => g.fecha.startsWith(mes))
  const egresos = suma(gastosMes)
  const utilidad = ingresos - egresos
  const margen = ingresos > 0 ? Math.round((utilidad / ingresos) * 100) : null

  const serie = [-5, -4, -3, -2, -1, 0].map((i) => {
    const k = moverMes(mes, i)
    return { k, ing: suma(pagos.filter((p) => p.fecha.startsWith(k))), gas: suma(gastos.filter((g) => g.fecha.startsWith(k))) }
  })
  const tope = Math.max(1, ...serie.flatMap((x) => [x.ing, x.gas]))

  const porCat = Object.entries(
    gastosMes.reduce((a, g) => ({ ...a, [g.categoria]: (a[g.categoria] || 0) + Number(g.monto) }), {})
  ).sort((a, b) => b[1] - a[1])

  const ocupadas = clientes.filter((c) => c.celda_id).length
  const libres = Math.max(0, celdas.length - ocupadas)
  const promedio = clientes.length ? suma(clientes, 'valor_mensual') / clientes.length : 0
  const enMora = clientes.filter((c) => estado(c) === 'mora')
  const equilibrio = promedio > 0 && egresos > 0 ? Math.ceil(egresos / promedio) : null

  return (
    <>
      <SelectorMes mes={mes} onCambiar={setMes} />

      <div className={`util ${utilidad < 0 ? 'neg' : 'pos'}`}>
        <span>{utilidad < 0 ? 'Pérdida del mes' : 'Ganancia del mes'}</span>
        <b>{cop(utilidad)}</b>
        <small>{margen === null ? 'Aún no hay ingresos este mes' : `Te queda el ${margen}% de lo que entra`}</small>
      </div>
      <div className="dos">
        <div className="mini"><span>Ingresos</span><b>{cop(ingresos)}</b></div>
        <div className="mini"><span>Gastos</span><b>{cop(egresos)}</b></div>
      </div>

      <h2 className="sec">Últimos 6 meses</h2>
      <div className="grafico" role="img" aria-label="Ingresos y gastos de los últimos seis meses">
        {serie.map((x) => (
          <div key={x.k} className="col-g">
            <div className="par">
              <i className="b-ing" style={{ height: `${(x.ing / tope) * 100}%` }} title={`Ingresos ${cop(x.ing)}`} />
              <i className="b-gas" style={{ height: `${(x.gas / tope) * 100}%` }} title={`Gastos ${cop(x.gas)}`} />
            </div>
            <small>{mesCorto(x.k)}</small>
          </div>
        ))}
      </div>
      <div className="leyenda">
        <span><i className="pt ok" />Ingresos</span>
        <span><i className="pt mora" />Gastos</span>
      </div>

      <h2 className="sec">En qué se va la plata</h2>
      {porCat.length === 0 && <p className="vacio">No hay gastos este mes.</p>}
      <ul className="lista">
        {porCat.map(([cat, valor]) => (
          <li key={cat} className="cat">
            <div className="cat-cab"><span>{cat}</span><b>{cop(valor)}</b></div>
            <div className="cat-barra"><i style={{ width: `${(valor / egresos) * 100}%` }} /></div>
          </li>
        ))}
      </ul>

      <h2 className="sec">Qué tan bien está el negocio</h2>
      <ul className="lista datos-neg">
        <li><span>Celdas ocupadas</span><b>{ocupadas} de {celdas.length}</b></li>
        <li><span>Mensualidades activas</span><b>{cop(suma(clientes, 'valor_mensual'))}</b></li>
        <li><span>Mensualidad promedio</span><b>{cop(promedio)}</b></li>
        <li><span>Dejas de ganar por celdas libres</span><b>{cop(libres * promedio)}</b></li>
        <li><span>Por cobrar a quienes están en mora</span><b>{cop(suma(enMora, 'valor_mensual'))}</b></li>
        {equilibrio !== null && <li><span>Clientes para cubrir los gastos</span><b>{equilibrio}</b></li>}
      </ul>
      <p className="suave nota">Los ingresos cuentan los pagos recibidos en cada mes, no las mensualidades que están por cobrar.</p>
    </>
  )
}

/* ───────── App ───────── */
export default function App() {
  const [sesion, setSesion] = useState(null)
  const [listo, setListo] = useState(false)
  const [celdas, setCeldas] = useState([])
  const [clientes, setClientes] = useState([])
  const [pagos, setPagos] = useState([])
  const [gastos, setGastos] = useState([])
  const [tab, setTab] = useState('celdas')
  const [hoja, setHoja] = useState(null)
  const [aviso, setAviso] = useState('')
  const [editando, setEditando] = useState(false)
  const [moviendo, setMoviendo] = useState(null) // id de la celda que se está moviendo

  const avisar = (t) => {
    setAviso(t)
    setTimeout(() => setAviso(''), 3500)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSesion(data.session)
      setListo(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSesion(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const cargar = useCallback(async () => {
    const [a, b, c, d] = await Promise.all([
      supabase.from('celdas').select('*'),
      supabase.from('clientes').select('*').eq('activo', true).order('nombre'),
      supabase.from('pagos').select('*, clientes(nombre)').order('fecha', { ascending: false }).order('created_at', { ascending: false }).limit(3000),
      supabase.from('gastos').select('*').order('fecha', { ascending: false }).limit(3000),
    ])
    const err = a.error || b.error || c.error || d.error
    if (err) avisar('No se pudieron cargar los datos: ' + err.message)
    setCeldas(a.data || [])
    setClientes(b.data || [])
    setPagos(c.data || [])
    setGastos(d.data || [])
  }, [])

  useEffect(() => {
    if (sesion) cargar()
  }, [sesion, cargar])

  const celdasOrd = useMemo(
    () => [...celdas].sort((a, b) => a.numero.localeCompare(b.numero, 'es', { numeric: true })),
    [celdas]
  )
  const clientePorCelda = useMemo(
    () => Object.fromEntries(clientes.filter((c) => c.celda_id).map((c) => [c.celda_id, c])),
    [clientes]
  )
  const { celdas: celdasPos, cols } = useMemo(() => colocar(celdas), [celdas])
  const celdaDe = (c) => celdas.find((x) => x.id === c.celda_id)
  const libresPara = (cliente) =>
    celdasOrd.filter((c) => !clientePorCelda[c.id] || c.id === cliente?.celda_id)
  const enMora = clientes.filter((c) => estado(c) === 'mora').length

  /* acciones */
  const ejecutar = async (consulta, ok) => {
    const { error } = await consulta
    if (error) {
      avisar(error.code === '23505' ? 'Esa celda ya está ocupada o ya existe.' : 'Error: ' + error.message)
      return false
    }
    setHoja(null)
    if (ok) avisar(ok)
    await cargar()
    return true
  }

  const guardarCliente = async (f, metodoPrimerPago) => {
    const datos = {
      nombre: f.nombre.trim(),
      telefono: f.telefono.trim(),
      placa: f.placa.trim().toUpperCase(),
      tipo_vehiculo: f.tipo_vehiculo,
      celda_id: f.celda_id || null,
      valor_mensual: Number(f.valor_mensual) || 0,
      vence: f.vence,
    }
    if (f.id) return ejecutar(supabase.from('clientes').update(datos).eq('id', f.id), 'Cliente actualizado')
    const { data, error } = await supabase.from('clientes').insert(datos).select().single()
    if (error) return avisar(error.code === '23505' ? 'Esa celda ya está ocupada.' : 'Error: ' + error.message)
    if (metodoPrimerPago) {
      await supabase.from('pagos').insert({
        cliente_id: data.id, monto: datos.valor_mensual, metodo: metodoPrimerPago, fecha: hoyStr(), vence_hasta: datos.vence,
      })
    }
    setHoja(null)
    avisar('Cliente agregado')
    cargar()
  }

  const guardarPago = async (cliente, p) => {
    const { error } = await supabase.from('pagos').insert({ cliente_id: cliente.id, fecha: hoyStr(), ...p })
    if (error) return avisar('Error: ' + error.message)
    await ejecutar(supabase.from('clientes').update({ vence: p.vence_hasta }).eq('id', cliente.id), 'Pago registrado')
  }

  const retirar = (cliente) => {
    if (!confirm(`¿Retirar a ${cliente.nombre}? Se libera la celda y se conserva su historial de pagos.`)) return
    ejecutar(supabase.from('clientes').update({ activo: false, celda_id: null }).eq('id', cliente.id), 'Cliente retirado')
  }

  const eliminarCliente = (cliente) => {
    if (!confirm(`¿Eliminar a ${cliente.nombre} por completo?\n\nTambién se borrarán sus pagos y bajarán los ingresos registrados. Si solo dejó el parqueadero, mejor usa "Retirar".`)) return
    ejecutar(supabase.from('clientes').delete().eq('id', cliente.id), 'Cliente eliminado')
  }

  const guardarGasto = (f) => {
    const datos = { concepto: f.concepto.trim(), categoria: f.categoria, monto: Number(f.monto) || 0, fecha: f.fecha }
    const q = f.id ? supabase.from('gastos').update(datos).eq('id', f.id) : supabase.from('gastos').insert(datos)
    ejecutar(q, f.id ? 'Gasto actualizado' : 'Gasto registrado')
  }

  const eliminarGasto = (g) => {
    if (!confirm(`¿Eliminar el gasto "${g.concepto}"?`)) return
    ejecutar(supabase.from('gastos').delete().eq('id', g.id), 'Gasto eliminado')
  }

  const crearCeldas = (prefijo, desde, hasta) => {
    if (hasta < desde || hasta - desde > 199) return avisar('Revisa el rango (máximo 200 celdas).')
    const existentes = new Set(celdas.map((c) => c.numero))
    const nuevos = []
    for (let n = desde; n <= hasta; n++) if (!existentes.has(`${prefijo}${n}`)) nuevos.push(`${prefijo}${n}`)
    if (!nuevos.length) return avisar('Esas celdas ya existen.')
    const lugares = huecos(celdasPos, cols, nuevos.length)
    ejecutar(supabase.from('celdas').insert(nuevos.map((numero, i) => ({ numero, ...lugares[i] }))), 'Celdas creadas')
  }

  const eliminarCelda = (celda) => {
    if (!confirm(`¿Eliminar la celda ${celda.numero}?`)) return
    ejecutar(supabase.from('celdas').delete().eq('id', celda.id), 'Celda eliminada')
  }

  /* edición del mapa */
  const alternarEdicion = async () => {
    if (!editando) {
      const faltan = new Set(celdas.filter((c) => c.fila == null || c.col == null).map((c) => c.id))
      if (faltan.size) {
        const filas = celdasPos.filter((c) => faltan.has(c.id)).map((c) => ({ id: c.id, numero: c.numero, fila: c.fila, col: c.col }))
        await supabase.from('celdas').upsert(filas)
        await cargar()
      }
    }
    setMoviendo(null)
    setEditando(!editando)
  }

  const moverCelda = async (a, destino) => {
    setMoviendo(null)
    const r = await Promise.all(destino.otra
      ? [
          supabase.from('celdas').update({ fila: destino.fila, col: destino.col }).eq('id', a.id),
          supabase.from('celdas').update({ fila: a.fila, col: a.col }).eq('id', destino.otra.id),
        ]
      : [supabase.from('celdas').update({ fila: destino.fila, col: destino.col }).eq('id', a.id)])
    if (r.some((x) => x.error)) return avisar('No se pudo mover la celda.')
    avisar(destino.otra ? 'Celdas intercambiadas' : 'Celda movida')
    cargar()
  }

  const tocarCelda = (celda) => {
    if (!editando) return setHoja({ tipo: 'celda', celda })
    const origen = celdasPos.find((c) => c.id === moviendo)
    if (origen) {
      if (origen.id === celda.id) return setMoviendo(null)
      return moverCelda(origen, { fila: celda.fila, col: celda.col, otra: celda })
    }
    setHoja({ tipo: 'editarcelda', celda })
  }

  const tocarHueco = (fila, col) => {
    const origen = celdasPos.find((c) => c.id === moviendo)
    if (origen) return moverCelda(origen, { fila, col })
    setHoja({ tipo: 'nuevacelda', fila, col })
  }

  /* render */
  if (!listo) return <div className="cargando">Cargando…</div>
  if (!sesion) return <Login />

  const hojaCelda = hoja?.tipo === 'celda' ? hoja.celda : null
  const cliCelda = hojaCelda ? clientePorCelda[hojaCelda.id] : null

  return (
    <div className="app">
      <header className="cab">
        <h1>Parqueadero</h1>
        <button className="salir" onClick={() => supabase.auth.signOut()}>Salir</button>
      </header>

      <main className="contenido">
        {tab === 'celdas' && (
          <Mapa
            celdas={celdasPos} cols={cols} clientes={clientes} clientePorCelda={clientePorCelda}
            editando={editando} moviendo={celdasPos.find((c) => c.id === moviendo)}
            onCelda={tocarCelda} onHueco={tocarHueco} onEditar={alternarEdicion}
            onCrear={() => setHoja({ tipo: 'celdas' })}
          />
        )}
        {tab === 'clientes' && (
          <Clientes
            clientes={clientes} celdaDe={celdaDe}
            onNuevo={() => setHoja({ tipo: 'cliente', cliente: {} })}
            onEditar={(cliente) => setHoja({ tipo: 'cliente', cliente })}
          />
        )}
        {tab === 'cobros' && (
          <Cobros clientes={clientes} pagos={pagos} celdaDe={celdaDe} onCobrar={(cliente) => setHoja({ tipo: 'pago', cliente })} />
        )}
        {tab === 'gastos' && (
          <Gastos gastos={gastos} onNuevo={() => setHoja({ tipo: 'gasto', gasto: {} })} onEditar={(gasto) => setHoja({ tipo: 'gasto', gasto })} />
        )}
        {tab === 'renta' && <Rentabilidad pagos={pagos} gastos={gastos} clientes={clientes} celdas={celdas} />}
      </main>

      <nav className="tabs">
        {[['celdas', 'Mapa'], ['clientes', 'Clientes'], ['cobros', 'Cobros'], ['gastos', 'Gastos'], ['renta', 'Ganancias']].map(([id, nombre]) => (
          <button key={id} className={tab === id ? 'activa' : ''} onClick={() => setTab(id)}>
            {nombre}
            {id === 'cobros' && enMora > 0 && <i className="punto">{enMora}</i>}
          </button>
        ))}
      </nav>

      {aviso && <div className="aviso" role="status">{aviso}</div>}

      {/* Detalle de una celda */}
      {hojaCelda && (
        <Hoja titulo={`Celda ${hojaCelda.numero}`} onClose={() => setHoja(null)}>
          {cliCelda ? (
            <>
              <div className="detalle">
                <Sello e={estado(cliCelda)} />
                <h3>{cliCelda.nombre}</h3>
                <p>{cliCelda.placa || 'Sin placa'} · {cliCelda.tipo_vehiculo}</p>
                <p>{cliCelda.telefono || 'Sin celular'}</p>
                <p>{cop(cliCelda.valor_mensual)} al mes</p>
                <p><strong>{textoPlazo(cliCelda)}</strong></p>
              </div>
              <div className="acciones col">
                <button className="btn primario grande" onClick={() => setHoja({ tipo: 'pago', cliente: cliCelda })}>Registrar pago</button>
                {cliCelda.telefono && (
                  <a className="btn sec grande" href={waLink(cliCelda)} target="_blank" rel="noreferrer">Enviar recordatorio por WhatsApp</a>
                )}
                <button className="btn sec grande" onClick={() => setHoja({ tipo: 'cliente', cliente: cliCelda })}>Editar datos</button>
                <button className="btn peligro grande" onClick={() => retirar(cliCelda)}>Retirar cliente</button>
              </div>
            </>
          ) : (
            <div className="acciones col">
              <p className="suave">Esta celda está libre.</p>
              <button className="btn primario grande" onClick={() => setHoja({ tipo: 'cliente', cliente: { celda_id: hojaCelda.id } })}>Asignar cliente nuevo</button>
              <button className="btn peligro grande" onClick={() => eliminarCelda(hojaCelda)}>Eliminar celda</button>
            </div>
          )}
        </Hoja>
      )}

      {hoja?.tipo === 'cliente' && (
        <Hoja titulo={hoja.cliente.id ? 'Editar cliente' : 'Nuevo cliente'} onClose={() => setHoja(null)}>
          <FormCliente
            inicial={hoja.cliente} celdasLibres={libresPara(hoja.cliente)}
            onGuardar={guardarCliente} onCerrar={() => setHoja(null)}
            onRetirar={() => retirar(hoja.cliente)} onEliminar={() => eliminarCliente(hoja.cliente)}
          />
        </Hoja>
      )}

      {hoja?.tipo === 'pago' && (
        <Hoja titulo="Registrar pago" onClose={() => setHoja(null)}>
          <FormPago cliente={hoja.cliente} onGuardar={(p) => guardarPago(hoja.cliente, p)} onCerrar={() => setHoja(null)} />
        </Hoja>
      )}

      {hoja?.tipo === 'gasto' && (
        <Hoja titulo={hoja.gasto.id ? 'Editar gasto' : 'Nuevo gasto'} onClose={() => setHoja(null)}>
          <FormGasto inicial={hoja.gasto} onGuardar={guardarGasto} onEliminar={() => eliminarGasto(hoja.gasto)} onCerrar={() => setHoja(null)} />
        </Hoja>
      )}

      {hoja?.tipo === 'nuevacelda' && (
        <Hoja titulo="Nueva celda" onClose={() => setHoja(null)}>
          <FormNumero
            inicial={String(celdas.length + 1)} boton="Crear celda" onCerrar={() => setHoja(null)}
            onGuardar={(numero) => ejecutar(supabase.from('celdas').insert({ numero, fila: hoja.fila, col: hoja.col }), 'Celda creada')}
          />
        </Hoja>
      )}

      {hoja?.tipo === 'editarcelda' && (() => {
        const c = hoja.celda
        const cli = clientePorCelda[c.id]
        return (
          <Hoja titulo={`Celda ${c.numero}`} onClose={() => setHoja(null)}>
            <FormNumero
              inicial={c.numero} boton="Guardar nombre" onCerrar={() => setHoja(null)}
              onGuardar={(numero) => ejecutar(supabase.from('celdas').update({ numero }).eq('id', c.id), 'Celda actualizada')}
            />
            <div className="acciones col sep">
              <button className="btn sec grande" onClick={() => { setMoviendo(c.id); setHoja(null) }}>Mover de lugar</button>
              {cli ? (
                <>
                  <button className="btn sec grande" onClick={() => setHoja({ tipo: 'cliente', cliente: cli })}>Editar a {cli.nombre.split(' ')[0]}</button>
                  <p className="suave">Para eliminar esta celda, primero retira al cliente o cámbialo de celda.</p>
                </>
              ) : (
                <button className="btn peligro grande" onClick={() => eliminarCelda(c)}>Eliminar celda</button>
              )}
            </div>
          </Hoja>
        )
      })()}

      {hoja?.tipo === 'celdas' && (
        <Hoja titulo="Agregar celdas" onClose={() => setHoja(null)}>
          <FormCeldas onGuardar={crearCeldas} onCerrar={() => setHoja(null)} />
        </Hoja>
      )}
    </div>
  )
}
