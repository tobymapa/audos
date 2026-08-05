/**
 * Ethaion voice input — a press-and-hold microphone button.
 *
 * Uses the browser's built-in SpeechRecognition (Web Speech API): hold to
 * record, release to send. While recording, a pulsing “Listening…” chip
 * plays the role of the waveform indicator. On browsers without the API the
 * button renders nothing, so surfaces degrade gracefully to text + image.
 */
import { useEffect, useRef, useState } from 'react';
import { AudioLines, Loader2, Mic } from 'lucide-react';

function recognitionCtor(): any {
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function voiceSupported(): boolean {
  return !!recognitionCtor();
}

export function VoiceButton({
  onTranscript,
  disabled = false,
  className = '',
  title = 'Hold to speak — release to send',
}: {
  /** Called with the final transcript when the press is released. */
  onTranscript: (text: string) => void;
  disabled?: boolean;
  className?: string;
  title?: string;
}) {
  const [recording, setRecording] = useState(false);
  const recognitionRef = useRef<any>(null);
  const finalRef = useRef('');
  const interimRef = useRef('');
  const supported = voiceSupported();

  useEffect(() => () => {
    try {
      recognitionRef.current?.abort?.();
    } catch { /* already stopped */ }
  }, []);

  if (!supported) return null;

  const start = () => {
    if (disabled || recording) return;
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || 'en-GB';
    finalRef.current = '';
    interimRef.current = '';
    rec.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) finalRef.current += result[0].transcript;
        else interim += result[0].transcript;
      }
      interimRef.current = interim;
    };
    rec.onend = () => {
      setRecording(false);
      const text = (finalRef.current + ' ' + interimRef.current).replace(/\s+/g, ' ').trim();
      finalRef.current = '';
      interimRef.current = '';
      if (text) onTranscript(text);
    };
    rec.onerror = () => {
      setRecording(false);
    };
    recognitionRef.current = rec;
    try {
      rec.start();
      setRecording(true);
    } catch {
      setRecording(false);
    }
  };

  const stop = () => {
    try {
      recognitionRef.current?.stop?.();
    } catch { /* already stopped */ }
  };

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        disabled={disabled}
        onPointerDown={(e) => {
          e.preventDefault();
          start();
        }}
        onPointerUp={stop}
        onPointerLeave={() => {
          if (recording) stop();
        }}
        onKeyDown={(e) => {
          // Keyboard access: space/enter toggles recording.
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            if (recording) stop();
            else start();
          }
        }}
        className={
          'h-8 w-8 flex items-center justify-center rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed ' +
          (recording
            ? 'bg-[var(--space-semantic-danger)] text-white'
            : 'hover:bg-[var(--space-surface-muted)] text-[var(--space-text-muted)]') +
          ' ' +
          className
        }
        title={title}
        aria-pressed={recording}
        aria-label={recording ? 'Recording — release to send' : 'Hold to record a voice message'}
        data-testid="button-voice-input"
      >
        <Mic className={'w-4 h-4 ' + (recording ? 'animate-pulse' : '')} />
      </button>
      {recording && (
        <span className="absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[var(--space-semantic-danger)] px-3 py-1 text-[11px] font-medium text-white shadow-md flex items-center gap-1.5">
          <span className="inline-flex items-end gap-[2px]" aria-hidden="true">
            <span className="w-[2px] h-2 bg-white/90 rounded-full animate-pulse" />
            <span className="w-[2px] h-3 bg-white/90 rounded-full animate-pulse" style={{ animationDelay: '120ms' }} />
            <span className="w-[2px] h-1.5 bg-white/90 rounded-full animate-pulse" style={{ animationDelay: '240ms' }} />
            <span className="w-[2px] h-2.5 bg-white/90 rounded-full animate-pulse" style={{ animationDelay: '360ms' }} />
          </span>
          Listening… release to send
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Live talking — a real-time voice conversation with Beau (Pass Eight).
//
// Uses the platform's OpenAI Realtime integration: the browser fetches an
// EPHEMERAL token from /api/realtime/token (the real key never reaches the
// client), then opens a WebRTC session directly with the Realtime API —
// microphone up, Beau's voice back through a hidden <audio> element. One
// button: tap to go live, tap again to end. Degrades gracefully: any failure
// simply returns the button to idle, and the text/photo/hold-to-talk inputs
// are always there.
// ---------------------------------------------------------------------------

/** Beau's live-voice persona — shared by every surface that opens a session. */
export const BEAU_LIVE_INSTRUCTIONS =
  'You are Beau, Ethaion\u2019s menswear valet \u2014 warm, direct, British in sensibility, allergic to waffle. ' +
  'You advise on classic, timeless menswear: what to buy, what to skip, how to fill wardrobe gaps by OCCASION ' +
  '(what the man cannot yet dress for) rather than by category. Favour natural materials, honest construction, ' +
  'and brands that keep the same product in the line for years. Keep answers short and conversational \u2014 ' +
  'this is a spoken conversation, not an essay. If asked to log or save something, tell him to type it to you ' +
  'in the chat or use the app, since this voice line doesn\u2019t write to his wardrobe.';

function stopLiveSession(refs: {
  pc: React.MutableRefObject<RTCPeerConnection | null>;
  mic: React.MutableRefObject<MediaStream | null>;
  audio: React.MutableRefObject<HTMLAudioElement | null>;
}) {
  try { refs.pc.current?.close(); } catch { /* already closed */ }
  refs.pc.current = null;
  try { refs.mic.current?.getTracks().forEach((t) => t.stop()); } catch { /* already stopped */ }
  refs.mic.current = null;
  if (refs.audio.current) {
    try {
      refs.audio.current.srcObject = null;
      refs.audio.current.remove();
    } catch { /* detached */ }
    refs.audio.current = null;
  }
}

export function LiveTalkButton({
  instructions,
  disabled = false,
  className = '',
  title = 'Talk live with Beau \u2014 a real-time voice conversation',
}: {
  /** Extra context for this surface (appended to Beau's live persona). */
  instructions?: string;
  disabled?: boolean;
  className?: string;
  title?: string;
}) {
  const [state, setState] = useState<'idle' | 'connecting' | 'live'>('idle');
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const refs = { pc: pcRef, mic: micRef, audio: audioRef };

  useEffect(() => () => stopLiveSession(refs), []); // eslint-disable-line react-hooks/exhaustive-deps

  const end = () => {
    stopLiveSession(refs);
    setState('idle');
  };

  const start = async () => {
    if (disabled || state !== 'idle') return;
    setState('connecting');
    try {
      const tokenRes = await fetch('/api/realtime/token');
      if (!tokenRes.ok) throw new Error(`realtime token failed: ${tokenRes.status}`);
      const tokenData = await tokenRes.json();
      const token: string =
        tokenData?.token || tokenData?.client_secret?.value || tokenData?.value || '';
      if (!token) throw new Error('realtime token empty');

      const mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      micRef.current = mic;

      const pc = new RTCPeerConnection();
      pcRef.current = pc;
      const audioEl = document.createElement('audio');
      audioEl.autoplay = true;
      audioEl.style.display = 'none';
      document.body.appendChild(audioEl);
      audioRef.current = audioEl;
      pc.ontrack = (e) => {
        audioEl.srcObject = e.streams[0];
      };
      for (const track of mic.getTracks()) pc.addTrack(track, mic);

      const dc = pc.createDataChannel('oai-events');
      dc.onopen = () => {
        try {
          dc.send(JSON.stringify({
            type: 'session.update',
            session: {
              instructions: instructions ? `${BEAU_LIVE_INSTRUCTIONS}\n\nContext for this conversation: ${instructions}` : BEAU_LIVE_INSTRUCTIONS,
            },
          }));
        } catch { /* non-fatal — the session still runs with defaults */ }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Model fallback: try the GA realtime model first, then the preview id.
      let answerSdp = '';
      for (const model of ['gpt-realtime', 'gpt-4o-realtime-preview']) {
        const sdpRes = await fetch(`https://api.openai.com/v1/realtime?model=${model}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/sdp' },
          body: offer.sdp,
        });
        if (sdpRes.ok) {
          answerSdp = await sdpRes.text();
          break;
        }
      }
      if (!answerSdp) throw new Error('realtime SDP exchange failed');
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

      pc.onconnectionstatechange = () => {
        if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) end();
      };
      setState('live');
    } catch (e) {
      console.warn('[Ethaion] live talk unavailable:', e);
      end();
    }
  };

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        disabled={disabled || state === 'connecting'}
        onClick={() => (state === 'live' ? end() : void start())}
        className={
          'h-8 w-8 flex items-center justify-center rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed ' +
          (state === 'live'
            ? 'bg-[var(--space-semantic-danger)] text-white'
            : 'hover:bg-[var(--space-surface-muted)] text-[var(--space-text-muted)]') +
          ' ' +
          className
        }
        title={state === 'live' ? 'End the live conversation' : title}
        aria-pressed={state === 'live'}
        aria-label={state === 'live' ? 'End the live conversation with Beau' : 'Start a live voice conversation with Beau'}
        data-testid="button-live-talk"
      >
        {state === 'connecting' ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <AudioLines className={'w-4 h-4 ' + (state === 'live' ? 'animate-pulse' : '')} />
        )}
      </button>
      {state === 'live' && (
        <span className="absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[var(--space-semantic-danger)] px-3 py-1 text-[11px] font-medium text-white shadow-md">
          Live with Beau — tap to end
        </span>
      )}
    </span>
  );
}
