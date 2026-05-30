import { useEffect, useRef, useState } from 'react'
import { Maximize2, X } from 'lucide-react'
import './LocalVideo.css'

interface LocalVideoProps {
  stream: MediaStream | null
  name: string
  micOn: boolean
  camOn: boolean
}

function getInitials(name: string) {
  return name.split(' ').filter(Boolean).map(w => w[0].toUpperCase()).slice(0, 2).join('')
}

const AVATAR_COLORS = ['#4ade80','#60a5fa','#f472b6','#fb923c','#a78bfa','#34d399']
function getAvatarColor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

export default function LocalVideo({ stream, name, micOn, camOn }: LocalVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const previewRef = useRef<HTMLVideoElement>(null)
  const [audioLevel, setAudioLevel] = useState(0)
  const [showPreview, setShowPreview] = useState(false)

  const avatarColor = getAvatarColor(name)
  const isSpeaking = audioLevel > 0.08 && micOn

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream
    if (previewRef.current) previewRef.current.srcObject = stream
  }, [stream])

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
      const tick = () => {
        analyser.getByteFrequencyData(data)
        setAudioLevel(Math.min(data.reduce((a, b) => a + b, 0) / data.length / 60, 1))
        raf = requestAnimationFrame(tick)
      }
      tick()
    } catch {}
    return () => { cancelAnimationFrame(raf); ctx?.close(); setAudioLevel(0) }
  }, [stream, micOn])

  return (
    <>
      <div className={`local-video ${isSpeaking ? 'local-video--speaking' : ''}`}
           style={{ '--avatar-color': avatarColor } as any}>

        {isSpeaking && <div className="local-video__ring" />}

        {!camOn && (
          <div className="local-video__avatar">
            <span className="local-video__initials">{getInitials(name) || 'Me'}</span>
          </div>
        )}

        <video ref={videoRef} autoPlay muted playsInline
          className={`local-video__video ${!camOn ? 'local-video__video--hidden' : ''}`} />

        {/* Expand preview button */}
        <button className="local-video__expand" onClick={() => setShowPreview(true)} title="Preview your video">
          <Maximize2 size={12} />
        </button>

        <div className="local-video__bar">
          <div className={`local-video__mic ${!micOn ? 'local-video__mic--muted' : ''}`}>
            {micOn ? <AudioBars level={audioLevel} /> : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="1" y1="1" x2="23" y2="23"/>
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
                <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
                <line x1="8" y1="23" x2="16" y2="23"/>
              </svg>
            )}
          </div>
          <span className="local-video__name">You</span>
        </div>
      </div>

      {/* Full self-preview modal */}
      {showPreview && (
        <div className="local-preview-overlay" onClick={() => setShowPreview(false)}>
          <div className="local-preview-modal" onClick={e => e.stopPropagation()}>
            <div className="local-preview__header">
              <span>Your Preview</span>
              <button onClick={() => setShowPreview(false)}><X size={18} /></button>
            </div>
            {!camOn ? (
              <div className="local-preview__avatar" style={{ '--avatar-color': avatarColor } as any}>
                <span className="local-preview__initials">{getInitials(name) || 'Me'}</span>
              </div>
            ) : (
              <video ref={previewRef} autoPlay muted playsInline className="local-preview__video" />
            )}
            <p className="local-preview__hint">Only you can see this preview</p>
          </div>
        </div>
      )}
    </>
  )
}

function AudioBars({ level }: { level: number }) {
  const h1 = 0.3 + level * 0.7, h2 = 0.5 + level * 0.5, h3 = 0.2 + level * 0.8
  return (
    <svg className="audio-bars" viewBox="0 0 12 10">
      <rect x="0" y={10 - h1*10} width="2.5" height={h1*10} rx="1.25"/>
      <rect x="4.75" y={10 - h2*10} width="2.5" height={h2*10} rx="1.25"/>
      <rect x="9.5" y={10 - h3*10} width="2.5" height={h3*10} rx="1.25"/>
    </svg>
  )
}