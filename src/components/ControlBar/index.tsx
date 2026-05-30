import { Mic, MicOff, Video, VideoOff, Users, PhoneOff, Shield, Copy, Check, Link, Settings } from 'lucide-react'
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
  onToggleSettings: () => void
  onLeave: () => void
}

export default function ControlBar({
  micOn, camOn, e2eeActive, roomId, participantCount,
  onToggleMic, onToggleCam, onToggleParticipants, onToggleSettings, onLeave
}: ControlBarProps) {
  const [copiedCode, setCopiedCode] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)

  function copyCode() {
    navigator.clipboard.writeText(roomId)
    setCopiedCode(true)
    setTimeout(() => setCopiedCode(false), 2000)
  }

  function copyLink() {
    navigator.clipboard.writeText(window.location.href)
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 2000)
  }

  return (
    <div className="control-bar">
      {/* Left — room info + share */}
      <div className="control-bar__room">
        <button className="control-bar__share-btn" onClick={copyCode} title="Copy room code">
          {copiedCode ? <Check size={13} /> : <Copy size={13} />}
          <span className="control-bar__room-code">{roomId}</span>
        </button>
        <button className="control-bar__share-btn control-bar__share-btn--link" onClick={copyLink} title="Copy join link">
          {copiedLink ? <Check size={13} /> : <Link size={13} />}
          <span className="control-bar__share-label">Link</span>
        </button>
        {e2eeActive && (
          <span className="control-bar__e2ee" title="End-to-end encrypted">
            <Shield size={11} /> E2EE
          </span>
        )}
      </div>

      {/* Center — main controls */}
      <div className="control-bar__center">
        <CtrlBtn active={micOn} danger={!micOn} onClick={onToggleMic}
          icon={micOn ? <Mic size={20}/> : <MicOff size={20}/>}
          label={micOn ? 'Mute' : 'Unmute'} />
        <CtrlBtn active={camOn} danger={!camOn} onClick={onToggleCam}
          icon={camOn ? <Video size={20}/> : <VideoOff size={20}/>}
          label={camOn ? 'Stop' : 'Start'} />
        <CtrlBtn active={false} onClick={onToggleParticipants}
          icon={<Users size={20}/>} label="People"
          badge={participantCount > 0 ? participantCount : undefined} />
        <CtrlBtn active={false} onClick={onToggleSettings}
          icon={<Settings size={20}/>} label="Settings" />
        <div className="control-bar__divider" />
        <button className="control-btn control-btn--leave" onClick={onLeave}>
          <PhoneOff size={20}/>
          <span className="control-btn__label">Leave</span>
        </button>
      </div>

      <div className="control-bar__spacer" />
    </div>
  )
}

function CtrlBtn({ active, danger, onClick, icon, label, badge }: {
  active: boolean; danger?: boolean; onClick: () => void
  icon: React.ReactNode; label: string; badge?: number
}) {
  return (
    <button className={`control-btn ${danger ? 'control-btn--muted' : ''}`} onClick={onClick} title={label}>
      {icon}
      <span className="control-btn__label">{label}</span>
      {badge != null && <span className="control-btn__badge">{badge}</span>}
    </button>
  )
}