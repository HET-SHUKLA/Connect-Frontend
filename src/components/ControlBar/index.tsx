import { Mic, MicOff, Video, VideoOff, Users, PhoneOff, Shield, Copy, Check } from 'lucide-react'
import { useState } from 'react'
import './ControlBar.css'

interface ControlBarProps {
  micOn: boolean
  camOn: boolean
  e2eeActive: boolean
  roomId: string
  participantCount: number
  onToggleMic: () => void
  onToggleCam: () => void
  onToggleParticipants: () => void
  onLeave: () => void
}

export default function ControlBar({
  micOn, camOn, e2eeActive, roomId,
  participantCount,
  onToggleMic, onToggleCam, onToggleParticipants, onLeave
}: ControlBarProps) {
  const [copied, setCopied] = useState(false)

  function copyCode() {
    navigator.clipboard.writeText(roomId)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="control-bar">
      {/* Room code (left) */}
      <div className="control-bar__room">
        <span className="control-bar__room-code">{roomId}</span>
        <button className="control-bar__copy" onClick={copyCode} title="Copy room code">
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
        {e2eeActive && (
          <span className="control-bar__e2ee" title="End-to-end encrypted">
            <Shield size={12} />
            E2EE
          </span>
        )}
      </div>

      {/* Main controls (center) */}
      <div className="control-bar__center">
        <ControlButton
          active={micOn}
          onClick={onToggleMic}
          icon={micOn ? <Mic size={20} /> : <MicOff size={20} />}
          label={micOn ? 'Mute' : 'Unmute'}
          danger={!micOn}
        />
        <ControlButton
          active={camOn}
          onClick={onToggleCam}
          icon={camOn ? <Video size={20} /> : <VideoOff size={20} />}
          label={camOn ? 'Stop Video' : 'Start Video'}
          danger={!camOn}
        />
        <ControlButton
          active={false}
          onClick={onToggleParticipants}
          icon={<Users size={20} />}
          label="People"
          badge={participantCount > 0 ? participantCount : undefined}
        />
        <div className="control-bar__divider" />
        <button className="control-btn control-btn--leave" onClick={onLeave} title="Leave meeting">
          <PhoneOff size={20} />
          <span className="control-btn__label">Leave</span>
        </button>
      </div>

      {/* Spacer to balance layout */}
      <div className="control-bar__spacer" />
    </div>
  )
}

interface ControlButtonProps {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  danger?: boolean
  badge?: number
}

function ControlButton({ active, onClick, icon, label, danger, badge }: ControlButtonProps) {
  return (
    <button
      className={`control-btn ${!active || danger ? 'control-btn--muted' : ''}`}
      onClick={onClick}
      title={label}
    >
      {icon}
      <span className="control-btn__label">{label}</span>
      {badge != null && <span className="control-btn__badge">{badge}</span>}
    </button>
  )
}
