import { useEffect, useRef } from 'react'
import './VideoTile.css'

interface VideoTileProps {
  stream: MediaStream
  name: string
  isMuted?: boolean
  isVideoOff?: boolean
  isAnimatingIn?: boolean
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map(w => w[0].toUpperCase())
    .slice(0, 2)
    .join('')
}

const AVATAR_COLORS = [
  '#4ade80', '#60a5fa', '#f472b6', '#fb923c',
  '#a78bfa', '#34d399', '#38bdf8', '#e879f9',
]

function getAvatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

export default function VideoTile({ stream, name, isMuted, isVideoOff, isAnimatingIn }: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream
  }, [stream])

  const initials = getInitials(name)
  const avatarColor = getAvatarColor(name)

  return (
    <div className={`video-tile ${isAnimatingIn ? 'video-tile--enter' : ''}`}>
      {/* Avatar shown when video is off */}
      {isVideoOff && (
        <div className="video-tile__avatar" style={{ '--avatar-color': avatarColor } as any}>
          <span className="video-tile__initials">{initials || '?'}</span>
        </div>
      )}

      <video
        ref={videoRef}
        autoPlay
        playsInline
        className={`video-tile__video ${isVideoOff ? 'video-tile__video--hidden' : ''}`}
      />

      {/* Name label */}
      <div className="video-tile__label">
        {isMuted && (
          <svg className="video-tile__mute-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
            <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        )}
        <span>{name}</span>
      </div>
    </div>
  )
}
