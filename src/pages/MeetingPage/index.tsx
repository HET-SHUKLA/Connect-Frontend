import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Mic, MicOff, Video, VideoOff, Wifi, Lock, AlertCircle } from 'lucide-react'
import { useUser } from '../../context/UserContext'

import { connect, on, send, disconnect } from '../../lib/socket'
import {
  initDevice, setupTransport, produceStream,
  consumeProducer, waitFor, initE2eeWorker,
  toggleMic, toggleCamera, resetState,
} from '../../lib/mediasoupClient'
import {
  generateKeyPair, exportPublicKey,
  importPublicKey, deriveSharedKey,
  encryptRoomKey, decryptRoomKey,
} from '../../lib/keyExchange'
import { generateRoomKey } from '../../lib/crypto'

import ControlBar from '../../components/ControlBar'
import VideoTile from '../../components/VideoTile'
import LocalVideo from '../../components/LocalVideo'
import ParticipantsPanel, { type Participant } from '../../components/ParticipantsPanel'
import Toast, { useToasts } from '../../components/Toast'
import './MeetingPage.css'

const BACKEND_HOST = import.meta.env.VITE_BACKEND_HOST ?? '192.168.31.130:8080'
const API = `http://${BACKEND_HOST}/api`
const WS  = `ws://${BACKEND_HOST}/ws`

type Phase = 'lobby' | 'connecting' | 'connected' | 'error'

interface RemoteStream {
  peerId: string
  stream: MediaStream
}

export default function MeetingPage() {
  const { roomId } = useParams<{ roomId: string }>()
  const navigate = useNavigate()
  const { name } = useUser()

  // ── Phase ────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>('lobby')
  const [statusMsg, setStatusMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  // ── Pre-join preview ─────────────────────────────────────────────
  const previewVideoRef = useRef<HTMLVideoElement>(null)
  const previewStreamRef = useRef<MediaStream | null>(null)
  const [previewMic, setPreviewMic] = useState(true)
  const [previewCam, setPreviewCam] = useState(true)
  const [permissionError, setPermissionError] = useState(false)

  // ── Meeting state ────────────────────────────────────────────────
  const localStreamRef = useRef<MediaStream | null>(null)
  const [remoteStreams, setRemoteStreams] = useState<RemoteStream[]>([])
  const remoteStreamsMap = useRef<Map<string, MediaStream>>(new Map())
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const [e2eeActive, setE2eeActive] = useState(false)
  const [showParticipants, setShowParticipants] = useState(false)
  const [remotePeerNames] = useState<Map<string, string>>(new Map())

  // ── E2EE internals ───────────────────────────────────────────────
  const pendingProducers = useRef<Array<{ producerId: string; peerId: string }>>([])
  const isReady = useRef(false)
  const myPeerId = useRef('')
  const keyPair = useRef<CryptoKeyPair | null>(null)
  const roomKey = useRef<CryptoKey | null>(null)

  // ── Toasts ───────────────────────────────────────────────────────
  const { toasts, addToast, removeToast } = useToasts()

  // ── Participants ─────────────────────────────────────────────────
  const participants: Participant[] = [
    { peerId: myPeerId.current || 'me', name: name || 'You', isLocal: true, isMuted: !micOn, isVideoOff: !camOn },
    ...remoteStreams.map(rs => ({
      peerId: rs.peerId,
      name: remotePeerNames.get(rs.peerId) ?? rs.peerId.slice(0, 8),
      isMuted: false,
      isVideoOff: false,
    })),
  ]

  // ── Cleanup on unmount (e.g. browser back button) ────────────────
  // This is essential: if the component unmounts for any reason other than
  // handleLeave() (e.g. browser back, or a hard navigate), we still close
  // the WS and reset mediasoup state so the server removes the peer
  // and the next session starts completely clean.
  useEffect(() => {
    return () => {
      localStreamRef.current?.getTracks().forEach(t => t.stop())
      previewStreamRef.current?.getTracks().forEach(t => t.stop())
      disconnect()   // closes WebSocket + clears socket handlers Map
      resetState()   // clears mediasoup device/transports/resolvers
    }
  }, [])

  // ═══════════════════════════════════════════════════════════════════
  // LOBBY — camera/mic preview
  // ═══════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (phase !== 'lobby') return
    let cancelled = false

    async function startPreview() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        previewStreamRef.current = stream
        if (previewVideoRef.current) previewVideoRef.current.srcObject = stream
      } catch {
        if (!cancelled) setPermissionError(true)
      }
    }

    startPreview()
    return () => {
      cancelled = true
      previewStreamRef.current?.getTracks().forEach(t => t.stop())
      previewStreamRef.current = null
    }
  }, [phase])

  function togglePreviewMic() {
    setPreviewMic(v => {
      const next = !v
      previewStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = next })
      return next
    })
  }

  function togglePreviewCam() {
    setPreviewCam(v => {
      const next = !v
      previewStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = next })
      return next
    })
  }

  // ═══════════════════════════════════════════════════════════════════
  // JOIN
  // ═══════════════════════════════════════════════════════════════════
  async function joinRoom() {
    if (!roomId) return
    setPhase('connecting')
    setMicOn(previewMic)
    setCamOn(previewCam)

    // Stop preview — we'll get a fresh stream via getUserMedia below
    previewStreamRef.current?.getTracks().forEach(t => t.stop())
    previewStreamRef.current = null

    try {
      keyPair.current = await generateKeyPair()

      setStatusMsg('Connecting…')
      await connect(WS)

      // Register persistent socket handlers BEFORE creating waitFor promises,
      // and BEFORE sending join-room. This ordering matters to avoid races.
      on('new-producer', (msg) => handleNewProducer(msg.producerId, msg.peerId))
      on('peer-left', (msg) => {
        const peerName = remotePeerNames.get(msg.peerId) ?? msg.peerId.slice(0, 8)
        addToast(`${peerName} left the meeting`, 'leave')
        remoteStreamsMap.current.delete(msg.peerId)
        setRemoteStreams(
          Array.from(remoteStreamsMap.current.entries())
            .map(([peerId, stream]) => ({ peerId, stream }))
        )
      })
      on('key-requested', async (msg) => { await sendRoomKeyToPeer(msg.peerId) })

      // Create waitFor promises BEFORE sending join-room.
      // If the server sends joined-room or router-rtp-capabilities very quickly,
      // the resolvers are already in the queue and won't be missed.
      const joinedPromise       = waitFor('joined-room')
      const capabilitiesPromise = waitFor('router-rtp-capabilities')

      send({ type: 'join-room', roomId })

      const joinedMsg = await joinedPromise
      myPeerId.current = joinedMsg.peerId

      // Register public key with the REST API
      const publicKeyBase64 = await exportPublicKey(keyPair.current.publicKey)
      await fetch(`${API}/keys/${myPeerId.current}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicKey: publicKeyBase64 }),
      })

      setStatusMsg('Loading device…')
      const capMsg = await capabilitiesPromise
      await initDevice(capMsg.rtpCapabilities)

      setStatusMsg('Creating transports…')
      send({ type: 'create-transport', roomId, direction: 'send' })
      const sendMsg = await waitFor('transport-created')
      setupTransport(sendMsg, send, roomId)

      send({ type: 'create-transport', roomId, direction: 'receive' })
      const recvMsg = await waitFor('transport-created')
      setupTransport(recvMsg, send, roomId)

      setStatusMsg('Exchanging keys…')
      if (pendingProducers.current.length === 0) {
        roomKey.current = await generateRoomKey()
      } else {
        send({ type: 'request-key' })
        const keyMsg = await waitFor('key-exchange-received')
        const senderRes = await fetch(`${API}/keys/${keyMsg.fromPeerId}`)
        const { publicKey: senderBase64 } = await senderRes.json()
        const senderPub = await importPublicKey(senderBase64)
        const shared = await deriveSharedKey(keyPair.current.privateKey, senderPub)
        roomKey.current = await decryptRoomKey(shared, keyMsg.encryptedRoomKey)
      }

      initE2eeWorker(roomKey.current!)
      setE2eeActive(true)

      setStatusMsg('Starting camera…')
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      stream.getAudioTracks().forEach(t => { t.enabled = previewMic })
      stream.getVideoTracks().forEach(t => { t.enabled = previewCam })
      localStreamRef.current = stream
      await produceStream(stream)

      // Flush any producers that arrived while we were setting up
      isReady.current = true
      for (const { producerId, peerId } of pendingProducers.current) {
        if (peerId === myPeerId.current) continue
        await sendRoomKeyToPeer(peerId)
        const consumer = await consumeProducer(producerId, roomId, send)
        addRemoteTrack(peerId, consumer)
      }
      pendingProducers.current = []

      setPhase('connected')
      addToast('You joined the meeting', 'join')

    } catch (err: any) {
      console.error('[joinRoom]', err)
      setErrorMsg(err?.message ?? 'Connection failed')
      setPhase('error')
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────
  async function sendRoomKeyToPeer(targetPeerId: string) {
    if (!roomKey.current || !keyPair.current) return
    try {
      const res = await fetch(`${API}/keys/${targetPeerId}`)
      if (!res.ok) return
      const { publicKey: base64 } = await res.json()
      const theirKey = await importPublicKey(base64)
      const shared   = await deriveSharedKey(keyPair.current.privateKey, theirKey)
      const encrypted = await encryptRoomKey(shared, roomKey.current)
      send({ type: 'key-exchange', targetPeerId, encryptedRoomKey: encrypted })
    } catch (err) {
      console.error('[sendRoomKeyToPeer]', err)
    }
  }

  function addRemoteTrack(peerId: string, consumer: any) {
    if (peerId === myPeerId.current) return
    let stream = remoteStreamsMap.current.get(peerId)
    const isNew = !stream
    if (!stream) {
      stream = new MediaStream()
      remoteStreamsMap.current.set(peerId, stream)
    }
    stream.addTrack(consumer.track)
    setRemoteStreams(
      Array.from(remoteStreamsMap.current.entries())
        .map(([p, s]) => ({ peerId: p, stream: s }))
    )
    if (isNew) {
      const displayName = remotePeerNames.get(peerId) ?? peerId.slice(0, 8)
      addToast(`${displayName} joined the meeting`, 'join')
    }
  }

  async function handleNewProducer(producerId: string, peerId: string) {
    if (peerId === myPeerId.current) return
    if (!isReady.current) {
      pendingProducers.current.push({ producerId, peerId })
      return
    }
    await sendRoomKeyToPeer(peerId)
    const consumer = await consumeProducer(producerId, roomId!, send)
    addRemoteTrack(peerId, consumer)
  }

  // ── Controls ─────────────────────────────────────────────────────
  function handleToggleMic() {
    const next = !micOn
    toggleMic(next)
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = next })
    setMicOn(next)
  }

  function handleToggleCam() {
    const next = !camOn
    toggleCamera(next)
    localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = next })
    setCamOn(next)
  }

  function handleLeave() {
    // Stop all media tracks
    localStreamRef.current?.getTracks().forEach(t => t.stop())
    localStreamRef.current = null

    // Close WebSocket (server removes peer immediately) + clear handlers
    disconnect()

    // Clear mediasoup device/transports/resolvers so next join is clean
    resetState()

    navigate('/')
  }

  // ═══════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════

  // ── LOBBY ──
  if (phase === 'lobby') {
    return (
      <div className="lobby">
        <Toast toasts={toasts} onRemove={removeToast} />

        <div className="lobby__inner">
          {/* Preview */}
          <div className="lobby__preview">
            <div className={`lobby__cam-box ${!previewCam ? 'lobby__cam-box--off' : ''}`}>
              {!previewCam && (
                <div className="lobby__cam-off">
                  <VideoOff size={32} className="lobby__cam-off-icon" />
                  <span>Camera is off</span>
                </div>
              )}
              <video ref={previewVideoRef} autoPlay muted playsInline className="lobby__video" />
              <div className="lobby__preview-controls">
                <button
                  className={`lobby__ctrl ${!previewMic ? 'lobby__ctrl--off' : ''}`}
                  onClick={togglePreviewMic}
                >
                  {previewMic ? <Mic size={18} /> : <MicOff size={18} />}
                </button>
                <button
                  className={`lobby__ctrl ${!previewCam ? 'lobby__ctrl--off' : ''}`}
                  onClick={togglePreviewCam}
                >
                  {previewCam ? <Video size={18} /> : <VideoOff size={18} />}
                </button>
              </div>
            </div>

            {permissionError && (
              <div className="lobby__perm-error">
                <AlertCircle size={16} />
                Camera or microphone access was denied. Check browser permissions.
              </div>
            )}
          </div>

          {/* Right panel */}
          <div className="lobby__panel">
            <div className="lobby__room-info">
              <p className="lobby__room-label">Joining room</p>
              <h2 className="lobby__room-id">{roomId}</h2>
              <div className="lobby__e2ee-badge">
                <Lock size={11} />
                End-to-end encrypted
              </div>
            </div>

            <div className="lobby__name-info">
              <p className="lobby__name-label">Joining as</p>
              <p className="lobby__name-value">{name || 'Guest'}</p>
            </div>

            <button className="lobby__join-btn" onClick={joinRoom}>
              <Wifi size={18} />
              Join Meeting
            </button>

            <button className="lobby__back-btn" onClick={() => navigate('/')}>
              ← Back
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── CONNECTING ──
  if (phase === 'connecting') {
    return (
      <div className="meeting-loader">
        <div className="meeting-loader__spinner" />
        <p className="meeting-loader__msg">{statusMsg}</p>
      </div>
    )
  }

  // ── ERROR ──
  if (phase === 'error') {
    return (
      <div className="meeting-loader">
        <AlertCircle size={40} color="var(--danger)" />
        <p className="meeting-loader__msg meeting-loader__msg--error">{errorMsg}</p>
        <button className="lobby__join-btn" style={{ marginTop: 24 }} onClick={() => navigate('/')}>
          Back to Home
        </button>
      </div>
    )
  }

  // ── CONNECTED ──
  const tileCount = remoteStreams.length

  return (
    <div className="meeting">
      <Toast toasts={toasts} onRemove={removeToast} />

      <div className={`meeting__grid meeting__grid--${Math.min(tileCount, 6)}`}>
        {tileCount === 0 && (
          <div className="meeting__empty">
            <div className="meeting__empty-icon">
              <Lock size={24} />
            </div>
            <p className="meeting__empty-title">You're the only one here</p>
            <p className="meeting__empty-sub">
              Share the room code <strong>{roomId}</strong> to invite others
            </p>
          </div>
        )}

        {remoteStreams.map(({ peerId, stream }) => (
          <VideoTile
            key={peerId}
            stream={stream}
            name={remotePeerNames.get(peerId) ?? peerId.slice(0, 8)}
            isAnimatingIn
          />
        ))}
      </div>

      {/* Local PiP — bottom right */}
      <div className="meeting__local">
        <LocalVideo
          stream={localStreamRef.current}
          name={name || 'You'}
          micOn={micOn}
          camOn={camOn}
        />
      </div>

      <ControlBar
        micOn={micOn}
        camOn={camOn}
        e2eeActive={e2eeActive}
        roomId={roomId!}
        participantCount={participants.length}
        onToggleMic={handleToggleMic}
        onToggleCam={handleToggleCam}
        onToggleParticipants={() => setShowParticipants(v => !v)}
        onLeave={handleLeave}
      />

      {showParticipants && (
        <ParticipantsPanel
          participants={participants}
          onClose={() => setShowParticipants(false)}
          e2eeActive={e2eeActive}
        />
      )}
    </div>
  )
}
