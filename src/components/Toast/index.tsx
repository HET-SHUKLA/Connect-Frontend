import { useEffect, useState } from 'react'
import './Toast.css'

export interface ToastItem {
  id: string
  message: string
  type: 'join' | 'leave' | 'info' | 'error'
}

interface ToastProps {
  toasts: ToastItem[]
  onRemove: (id: string) => void
}

export default function Toast({ toasts, onRemove }: ToastProps) {
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <ToastCard key={t.id} toast={t} onRemove={onRemove} />
      ))}
    </div>
  )
}

function ToastCard({ toast, onRemove }: { toast: ToastItem; onRemove: (id: string) => void }) {
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    const fadeTimer = setTimeout(() => setExiting(true), 3200)
    const removeTimer = setTimeout(() => onRemove(toast.id), 3600)
    return () => { clearTimeout(fadeTimer); clearTimeout(removeTimer) }
  }, [toast.id, onRemove])

  return (
    <div className={`toast toast--${toast.type} ${exiting ? 'toast--exit' : ''}`}>
      <span className="toast__dot" />
      <span className="toast__message">{toast.message}</span>
    </div>
  )
}

/* ─── Hook ─────────────────────────────────────────────────────────────── */
import { useCallback, useRef } from 'react'

export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const counter = useRef(0)

  const addToast = useCallback((message: string, type: ToastItem['type'] = 'info') => {
    const id = `toast_${++counter.current}`
    setToasts(prev => [...prev, { id, message, type }])
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return { toasts, addToast, removeToast }
}
