import { useEffect, useRef, useState, useCallback } from 'react'
import './VideoTile.css'

interface VideoTileProps {
  stream: MediaStream
  name: string
  isMuted?: boolean
  isVideoOff?: boolean
  isAnimatingIn?: boolean
  /** Called when user locally mutes/hides this participant */
  onLocalMute?: (kind: 'audio' | 'video', muted: boolean) => void
}

function getInitials(name: string) {
  return name.split(' ').filter(Boolean).map(w => w[0].toUpperCase()).slice(0, 2).join('')
}

const AVATAR_COLORS = [
  '#4ade80','#60a5fa','#f472b6','#fb923c',
  '#a78bfa','#34d399','#38bdf8','#e879f9','#fbbf24',
]

function getAvatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

export default function VideoTile({
  stream, name, isMuted, isVideoOff, isAnimatingIn, onLocalMute
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [audioLevel, setAudioLevel] = useState(0)
  const [localAudioMuted, setLocalAudioMuted] = useState(false)
  const [localVideoHidden, setLocalVideoHidden] = useState(false)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)

  const avatarColor = getAvatarColor(name)
  const isSpeaking = audioLevel > 0.08 && !isMuted && !localAudioMuted
  const showAvatar = isVideoOff || localVideoHidden

  // Attach stream to video
  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream
  }, [stream])

  // Audio level analyser for speaking wave
  useEffect(() => {
    if (!stream) return
    let ctx: AudioContext | null = null
    let raf: number

    try {
      ctx = new AudioContext()
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      const source = ctx.createMediaStreamSource(stream)
      source.connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)

      const tick = () => {
        analyser.getByteFrequencyData(data)
        const avg = data.reduce((a, b) => a + b, 0) / data.length
        setAudioLevel(Math.min(avg / 55, 1))
        raf = requestAnimationFrame(tick)
      }
      tick()
    } catch { /* no AudioContext */ }

    return () => {
      cancelAnimationFrame(raf)
      ctx?.close()
      setAudioLevel(0)
    }
  }, [stream])

  // Close context menu on outside click
  useEffect(() => {
    if (!ctxMenu) return
    const close = () => setCtxMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('blur', close)
    return () => { window.removeEventListener('click', close); window.removeEventListener('blur', close) }
  }, [ctxMenu])

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY })
  }

  function handleLocalMuteAudio() {
    const next = !localAudioMuted
    stream.getAudioTracks().forEach(t => { t.enabled = !next })
    setLocalAudioMuted(next)
    onLocalMute?.('audio', next)
    setCtxMenu(null)
  }

  function handleLocalHideVideo() {
    setLocalVideoHidden(v => !v)
    setCtxMenu(null)
  }

  return (
    <>
      <div
        className={[
          'video-tile-wrap',
          isAnimatingIn ? 'video-tile-wrap--enter' : '',
          isSpeaking ? 'video-tile-wrap--speaking' : '',
        ].join(' ')}
        style={{ '--peer-color': avatarColor } as any}
        onContextMenu={handleContextMenu}
      >
        {/* Speaking wave rings */}
        {isSpeaking && (
          <>
            <div className="vt-wave vt-wave--1" style={{ '--intensity': audioLevel } as any} />
            <div className="vt-wave vt-wave--2" style={{ '--intensity': audioLevel } as any} />
          </>
        )}

        <div className="video-tile">
          {/* Avatar when video off */}
          {showAvatar && (
            <div className="video-tile__avatar" style={{ '--avatar-color': avatarColor } as any}>
              <span className="video-tile__initials">{getInitials(name) || name.slice(0,2).toUpperCase() || '?'}</span>
            </div>
          )}

          <video
            ref={videoRef}
            autoPlay playsInline
            className={`video-tile__video ${showAvatar ? 'video-tile__video--hidden' : ''}`}
          />

          {/* Bottom label — always shows mute state */}
          <div className="video-tile__label">
            <div className="video-tile__mic-state">
              {(isMuted || localAudioMuted) ? (
                <span className="video-tile__mic-badge video-tile__mic-badge--muted" title="Muted">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="1" y1="1" x2="23" y2="23"/>
                    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
                    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2"/>
                    <line x1="12" y1="19" x2="12" y2="23"/>
                    <line x1="8" y1="23" x2="16" y2="23"/>
                  </svg>
                </span>
              ) : isSpeaking ? (
                <span className="video-tile__mic-badge video-tile__mic-badge--speaking">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    <line x1="12" y1="19" x2="12" y2="23"/>
                    <line x1="8" y1="23" x2="16" y2="23"/>
                  </svg>
                </span>
              ) : null}
            </div>
            <span className="video-tile__name">{name}</span>
            {localAudioMuted && <span className="video-tile__local-badge">muted locally</span>}
          </div>
        </div>
      </div>

      {/* Right-click context menu */}
      {ctxMenu && (
        <div
          className="vt-ctx"
          style={{ top: ctxMenu.y, left: ctxMenu.x }}
          onClick={e => e.stopPropagation()}
        >
          <div className="vt-ctx__header">{name}</div>
          <button className="vt-ctx__item" onClick={handleLocalMuteAudio}>
            {localAudioMuted ? '🔊 Unmute audio (for me)' : '🔇 Mute audio (for me)'}
          </button>
          <button className="vt-ctx__item" onClick={handleLocalHideVideo}>
            {localVideoHidden ? '👁 Show video' : '🚫 Hide video (for me)'}
          </button>
        </div>
      )}
    </>
  )
}