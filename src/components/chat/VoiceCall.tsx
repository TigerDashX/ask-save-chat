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
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const audioBuffer = await audioContextRef.current.decodeAudioData(bytes.buffer);
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
