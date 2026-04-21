import { useEffect, useRef, useState } from 'react'
import './LocalVideo.css'

interface LocalVideoProps {
  stream: MediaStream | null
  name: string
  micOn: boolean
  camOn: boolean
}

function getInitials(name: string): string {
  return name.split(' ').filter(Boolean).map(w => w[0].toUpperCase()).slice(0, 2).join('')
}

const AVATAR_COLORS = [
  '#4ade80', '#60a5fa', '#f472b6', '#fb923c',
  '#a78bfa', '#34d399', '#38bdf8',
]

function getAvatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

export default function LocalVideo({ stream, name, micOn, camOn }: LocalVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [audioLevel, setAudioLevel] = useState(0) // 0–1

  // Attach stream to video element
  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream
  }, [stream])

  // Audio level analyser
  useEffect(() => {
    if (!stream || !micOn) { setAudioLevel(0); return }

    let ctx: AudioContext | null = null
    let raf: number

    try {
      ctx = new AudioContext()
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      const source = ctx.createMediaStreamSource(stream)
      source.connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)

      function tick() {
        analyser.getByteFrequencyData(data)
        const avg = data.reduce((a, b) => a + b, 0) / data.length
        setAudioLevel(Math.min(avg / 60, 1)) // normalise
        raf = requestAnimationFrame(tick)
      }
      tick()
    } catch {
      // AudioContext not available
    }

    return () => {
      cancelAnimationFrame(raf)
      ctx?.close()
      setAudioLevel(0)
    }
  }, [stream, micOn])

  const initials = getInitials(name)
  const avatarColor = getAvatarColor(name)
  const isSpeaking = audioLevel > 0.08

  return (
    <div className={`local-video ${isSpeaking && micOn ? 'local-video--speaking' : ''}`}
         style={{ '--avatar-color': avatarColor } as any}>

      {/* Speaking ring */}
      {isSpeaking && micOn && (
        <div className="local-video__ring"
             style={{ '--scale': 1 + audioLevel * 0.35 } as any} />
      )}

      {/* Avatar when cam off */}
      {!camOn && (
        <div className="local-video__avatar">
          <span className="local-video__initials">{initials || 'Me'}</span>
        </div>
      )}

      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className={`local-video__video ${!camOn ? 'local-video__video--hidden' : ''}`}
      />

      {/* Bottom bar */}
      <div className="local-video__bar">
        {/* Mic visualiser */}
        <div className={`local-video__mic ${!micOn ? 'local-video__mic--muted' : ''}`}>
          {micOn ? (
            <AudioBars level={audioLevel} />
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
              <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          )}
        </div>
        <span className="local-video__name">You</span>
      </div>
    </div>
  )
}

/* Animated 3-bar equalizer */
function AudioBars({ level }: { level: number }) {
  const h1 = 0.3 + level * 0.7
  const h2 = 0.5 + level * 0.5
  const h3 = 0.2 + level * 0.8

  return (
    <svg className="audio-bars" viewBox="0 0 12 10">
      <rect x="0" y={10 - h1 * 10} width="2.5" height={h1 * 10} rx="1.25" />
      <rect x="4.75" y={10 - h2 * 10} width="2.5" height={h2 * 10} rx="1.25" />
      <rect x="9.5" y={10 - h3 * 10} width="2.5" height={h3 * 10} rx="1.25" />
    </svg>
  )
}
