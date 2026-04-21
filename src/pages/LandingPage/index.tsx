import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '../../context/UserContext'
import { Plus, LogIn, ArrowRight, Lock } from 'lucide-react'
import './LandingPage.css'

const BACKEND_HOST = import.meta.env.VITE_BACKEND_HOST ?? '192.168.31.130:8080'
const API = `https://${BACKEND_HOST}/api`

export default function LandingPage() {
  const navigate = useNavigate()
  const { name, setName } = useUser()

  const [view, setView] = useState<'home' | 'join' | 'name'>('home')
  const [nameInput, setNameInput] = useState(name)
  const [pendingAction, setPendingAction] = useState<'create' | 'join' | null>(null)
  const [code, setCode] = useState(['', '', '', '', ''])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const codeRefs = useRef<(HTMLInputElement | null)[]>([])

  // If we come back to home, reset
  useEffect(() => {
    if (view === 'home') setError('')
  }, [view])

  function requireName(action: 'create' | 'join') {
    if (name.trim()) {
      if (action === 'create') doCreate()
      else setView('join')
    } else {
      setPendingAction(action)
      setView('name')
    }
  }

  async function submitName() {
    const trimmed = nameInput.trim()
    if (!trimmed) return
    setName(trimmed)
    if (pendingAction === 'create') doCreate()
    else { setPendingAction(null); setView('join') }
  }

  async function doCreate() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API}/rooms`, { method: 'POST' })
      if (!res.ok) throw new Error('Server error')
      const data = await res.json()
      navigate(`/room/${data.roomId}`)
    } catch {
      setError('Could not create a room. Is the server running?')
      setLoading(false)
    }
  }

  async function doJoin() {
    const roomId = code.join('').toUpperCase()
    if (roomId.length < 5) { setError('Enter the full 5-character code.'); return }
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API}/rooms/${roomId}`)
      if (!res.ok) { setError('Room not found. Check the code and try again.'); setLoading(false); return }
      navigate(`/room/${roomId}`)
    } catch {
      setError('Could not reach server.')
      setLoading(false)
    }
  }

  /* ── OTP input helpers ── */
  function handleCodeChange(idx: number, val: string) {
    const char = val.replace(/[^a-zA-Z0-9]/g, '').slice(-1).toUpperCase()
    const next = [...code]
    next[idx] = char
    setCode(next)
    if (char && idx < 4) codeRefs.current[idx + 1]?.focus()
  }

  function handleCodeKey(idx: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !code[idx] && idx > 0) codeRefs.current[idx - 1]?.focus()
    if (e.key === 'Enter') doJoin()
  }

  function handleCodePaste(e: React.ClipboardEvent) {
    e.preventDefault()
    const text = e.clipboardData.getData('text').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 5)
    const next = [...code]
    for (let i = 0; i < 5; i++) next[i] = text[i] ?? ''
    setCode(next)
    codeRefs.current[Math.min(text.length, 4)]?.focus()
  }

  const timeGreeting = (() => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 18) return 'Good afternoon'
    return 'Good evening'
  })()

  return (
    <div className="landing">
      {/* Background mesh */}
      <div className="landing__bg" aria-hidden>
        <div className="landing__orb landing__orb--1" />
        <div className="landing__orb landing__orb--2" />
        <div className="landing__orb landing__orb--3" />
      </div>

      <div className="landing__content">
        {/* Logo / wordmark */}
        <div className="landing__brand">
          <div className="landing__logo">
            <Lock size={20} />
          </div>
          <span className="landing__wordmark">Connect</span>
        </div>

        {/* Greeting */}
        <div className="landing__hero">
          <h1 className="landing__greeting">
            {timeGreeting}{name ? `, ${name.split(' ')[0]}` : ''}.
          </h1>
          <p className="landing__sub">
            Secure, end-to-end encrypted video meetings.
          </p>
        </div>

        {/* Card */}
        <div className="landing__card">
          {/* ── HOME ── */}
          {view === 'home' && (
            <div className="landing__actions" key="home">
              <button
                className="landing__btn landing__btn--primary"
                onClick={() => requireName('create')}
                disabled={loading}
              >
                <Plus size={18} />
                New Meeting
              </button>
              <div className="landing__or"><span>or</span></div>
              <button
                className="landing__btn landing__btn--secondary"
                onClick={() => requireName('join')}
                disabled={loading}
              >
                <LogIn size={18} />
                Join with Code
              </button>
            </div>
          )}

          {/* ── NAME ENTRY ── */}
          {view === 'name' && (
            <div className="landing__form" key="name">
              <p className="landing__form-label">What should we call you?</p>
              <input
                className="landing__input"
                autoFocus
                placeholder="Your name"
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submitName()}
                maxLength={32}
              />
              <div className="landing__form-row">
                <button className="landing__link" onClick={() => setView('home')}>
                  ← Back
                </button>
                <button
                  className="landing__btn landing__btn--primary landing__btn--sm"
                  onClick={submitName}
                  disabled={!nameInput.trim()}
                >
                  Continue <ArrowRight size={15} />
                </button>
              </div>
            </div>
          )}

          {/* ── JOIN CODE ── */}
          {view === 'join' && (
            <div className="landing__form" key="join">
              <p className="landing__form-label">Enter meeting code</p>
              <div className="landing__otp" onPaste={handleCodePaste}>
                {code.map((c, i) => (
                  <input
                    key={i}
                    ref={el => { codeRefs.current[i] = el }}
                    className="landing__otp-box"
                    value={c}
                    maxLength={1}
                    autoFocus={i === 0}
                    onChange={e => handleCodeChange(i, e.target.value)}
                    onKeyDown={e => handleCodeKey(i, e)}
                  />
                ))}
              </div>
              {error && <p className="landing__error">{error}</p>}
              <div className="landing__form-row">
                <button className="landing__link" onClick={() => { setView('home'); setCode(['','','','','']); setError('') }}>
                  ← Back
                </button>
                <button
                  className="landing__btn landing__btn--primary landing__btn--sm"
                  onClick={doJoin}
                  disabled={loading || code.join('').length < 5}
                >
                  {loading ? <span className="landing__spinner" /> : <>Join <ArrowRight size={15} /></>}
                </button>
              </div>
            </div>
          )}

          {error && view === 'home' && <p className="landing__error">{error}</p>}
        </div>

        <p className="landing__footer">
          <Lock size={11} /> All meetings are AES-256-GCM encrypted
        </p>
      </div>
    </div>
  )
}
