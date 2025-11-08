import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Phone, PhoneOff } from "lucide-react";
import { toast } from "sonner";

interface VoiceCallProps {
  onCallStateChange: (isActive: boolean) => void;
}

export const VoiceCall = ({ onCallStateChange }: VoiceCallProps) => {
  const [isCallActive, setIsCallActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const startCall = async () => {
    try {
      setIsConnecting(true);
      
      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 24000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        }
      });
      mediaStreamRef.current = stream;

      // Create audio context
      audioContextRef.current = new AudioContext({ sampleRate: 24000 });

      // Connect to voice call WebSocket
      const wsUrl = `wss://qqyjmfygdjhoxeycywae.supabase.co/functions/v1/voice-call`;
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        setIsCallActive(true);
        setIsConnecting(false);
        onCallStateChange(true);
        toast.success("Appel démarré");
        startAudioProcessing();
      };

      wsRef.current.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'audio' && data.audio) {
            // Play received audio
            await playAudio(data.audio);
          }
        } catch (error) {
          console.error('Error processing message:', error);
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        toast.error("Erreur de connexion");
        endCall();
      };

      wsRef.current.onclose = () => {
        endCall();
      };

    } catch (error) {
      console.error('Error starting call:', error);
      toast.error("Impossible de démarrer l'appel");
      setIsConnecting(false);
    }
  };

  const startAudioProcessing = () => {
    if (!mediaStreamRef.current || !audioContextRef.current || !wsRef.current) return;

    const source = audioContextRef.current.createMediaStreamSource(mediaStreamRef.current);
    const processor = audioContextRef.current.createScriptProcessor(4096, 1, 1);

    processor.onaudioprocess = (e) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

      const inputData = e.inputBuffer.getChannelData(0);
      const audioData = encodeAudioData(inputData);
      
      wsRef.current.send(JSON.stringify({
        type: 'audio',
        audio: audioData
      }));
    };

    source.connect(processor);
    processor.connect(audioContextRef.current.destination);
  };

  const encodeAudioData = (float32Array: Float32Array): string => {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    
    const uint8Array = new Uint8Array(int16Array.buffer);
    let binary = '';
    const chunkSize = 0x8000;
    
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    
    return btoa(binary);
  };

  const playAudio = async (base64Audio: string) => {
    if (!audioContextRef.current) return;

    try {
      // Decode base64 to PCM16 data
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Create WAV header for PCM16 24kHz mono
      const wavHeader = new ArrayBuffer(44);
      const view = new DataView(wavHeader);
      
      const writeString = (offset: number, string: string) => {
        for (let i = 0; i < string.length; i++) {
          view.setUint8(offset + i, string.charCodeAt(i));
        }
      };

      const sampleRate = 24000;
      const numChannels = 1;
      const bitsPerSample = 16;
      const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
      const blockAlign = numChannels * (bitsPerSample / 8);

      writeString(0, 'RIFF');
      view.setUint32(4, 36 + bytes.length, true);
      writeString(8, 'WAVE');
      writeString(12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, numChannels, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, byteRate, true);
      view.setUint16(32, blockAlign, true);
      view.setUint16(34, bitsPerSample, true);
      writeString(36, 'data');
      view.setUint32(40, bytes.length, true);

      // Combine WAV header with PCM data
      const wavArray = new Uint8Array(wavHeader.byteLength + bytes.length);
      wavArray.set(new Uint8Array(wavHeader), 0);
      wavArray.set(bytes, wavHeader.byteLength);

      const audioBuffer = await audioContextRef.current.decodeAudioData(wavArray.buffer);
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);
      source.start(0);
    } catch (error) {
      console.error('Error playing audio:', error);
    }
  };

  const endCall = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    setIsCallActive(false);
    setIsConnecting(false);
    onCallStateChange(false);
    toast.info("Appel terminé");
  };

  useEffect(() => {
    return () => {
      endCall();
    };
  }, []);

  return (
    <Button
      onClick={isCallActive ? endCall : startCall}
      disabled={isConnecting}
      size="icon"
      variant={isCallActive ? "destructive" : "secondary"}
      className="h-[60px] w-[60px] flex-shrink-0 shadow-soft"
      title={isCallActive ? "Terminer l'appel" : "Appel vocal"}
    >
      {isCallActive ? (
        <PhoneOff className="h-5 w-5" />
      ) : (
        <Phone className="h-5 w-5" />
      )}
    </Button>
  );
};
