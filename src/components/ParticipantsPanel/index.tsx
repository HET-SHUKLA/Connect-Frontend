import { X, Mic, MicOff, Video, VideoOff, Shield } from 'lucide-react'
import './ParticipantsPanel.css'

export interface Participant {
  peerId: string
  name: string
  isLocal?: boolean
  isMuted?: boolean
  isVideoOff?: boolean
}

interface ParticipantsPanelProps {
  participants: Participant[]
  onClose: () => void
  e2eeActive: boolean
}

function getInitials(name: string) {
  return name.split(' ').filter(Boolean).map(w => w[0].toUpperCase()).slice(0, 2).join('')
}

const AVATAR_COLORS = [
  '#4ade80','#60a5fa','#f472b6','#fb923c','#a78bfa','#34d399','#38bdf8',
]
function getAvatarColor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

export default function ParticipantsPanel({ participants, onClose, e2eeActive }: ParticipantsPanelProps) {
  return (
    <div className="pp-overlay" onClick={onClose}>
      <div className="pp-panel" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="pp-header">
          <div className="pp-header__left">
            <h3 className="pp-title">People</h3>
            <span className="pp-count">{participants.length}</span>
          </div>
          <button className="pp-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* E2EE badge */}
        {e2eeActive && (
          <div className="pp-e2ee">
            <Shield size={13} />
            <span>All communications are end-to-end encrypted</span>
          </div>
        )}

        {/* List */}
        <div className="pp-list">
          {participants.map(p => (
            <div key={p.peerId} className="pp-item">
              <div className="pp-avatar" style={{ '--c': getAvatarColor(p.name) } as any}>
                {getInitials(p.name) || '?'}
              </div>
              <div className="pp-info">
                <span className="pp-name">
                  {p.name}
                  {p.isLocal && <span className="pp-you">You</span>}
                </span>
              </div>
              <div className="pp-icons">
                {p.isMuted
                  ? <MicOff size={14} className="pp-icon pp-icon--off" />
                  : <Mic size={14} className="pp-icon pp-icon--on" />
                }
                {p.isVideoOff
                  ? <VideoOff size={14} className="pp-icon pp-icon--off" />
                  : <Video size={14} className="pp-icon pp-icon--on" />
                }
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
