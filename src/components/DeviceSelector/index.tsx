import { useEffect, useState } from 'react'
import { X, Mic, Video, Volume2 } from 'lucide-react'
import './DeviceSelector.css'

export interface DeviceChoices {
  audioInput: string
  videoInput: string
  audioOutput: string
}

interface DeviceSelectorProps {
  choices: DeviceChoices
  onChange: (c: DeviceChoices) => void
  onClose: () => void
}

interface DeviceList {
  audioInputs: MediaDeviceInfo[]
  videoInputs: MediaDeviceInfo[]
  audioOutputs: MediaDeviceInfo[]
}

export default function DeviceSelector({ choices, onChange, onClose }: DeviceSelectorProps) {
  const [devices, setDevices] = useState<DeviceList>({ audioInputs: [], videoInputs: [], audioOutputs: [] })

  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then(all => {
      setDevices({
        audioInputs:  all.filter(d => d.kind === 'audioinput'),
        videoInputs:  all.filter(d => d.kind === 'videoinput'),
        audioOutputs: all.filter(d => d.kind === 'audiooutput'),
      })
    })
  }, [])

  function set(key: keyof DeviceChoices, val: string) {
    onChange({ ...choices, [key]: val })
  }

  return (
    <div className="ds-overlay" onClick={onClose}>
      <div className="ds-panel" onClick={e => e.stopPropagation()}>
        <div className="ds-header">
          <span className="ds-title">Audio & Video Settings</span>
          <button className="ds-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="ds-body">
          <DeviceRow
            icon={<Mic size={16} />}
            label="Microphone"
            devices={devices.audioInputs}
            value={choices.audioInput}
            onChange={v => set('audioInput', v)}
          />
          <DeviceRow
            icon={<Volume2 size={16} />}
            label="Speaker"
            devices={devices.audioOutputs}
            value={choices.audioOutput}
            onChange={v => set('audioOutput', v)}
          />
          <DeviceRow
            icon={<Video size={16} />}
            label="Camera"
            devices={devices.videoInputs}
            value={choices.videoInput}
            onChange={v => set('videoInput', v)}
          />
        </div>
      </div>
    </div>
  )
}

function DeviceRow({ icon, label, devices, value, onChange }: {
  icon: React.ReactNode
  label: string
  devices: MediaDeviceInfo[]
  value: string
  onChange: (v: string) => void
}) {
  if (devices.length === 0) return null
  return (
    <div className="ds-row">
      <div className="ds-row__label">
        <span className="ds-row__icon">{icon}</span>
        {label}
      </div>
      <select
        className="ds-select"
        value={value}
        onChange={e => onChange(e.target.value)}
      >
        {devices.map(d => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label || `${label} ${d.deviceId.slice(0, 6)}`}
          </option>
        ))}
      </select>
    </div>
  )
}