import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Handle WebSocket upgrade
  if (req.headers.get("upgrade") !== "websocket") {
    return new Response("Expected websocket", { status: 400 });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

  if (!LOVABLE_API_KEY) {
    socket.close(1008, "LOVABLE_API_KEY not configured");
    return response;
  }

  let openAIWs: WebSocket | null = null;
  let conversationHistory: any[] = [];

  socket.onopen = () => {
    console.log("Client WebSocket connected");
    
    // Connect to OpenAI Realtime API
    const openAIUrl = `wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17`;
    openAIWs = new WebSocket(openAIUrl, {
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "OpenAI-Beta": "realtime=v1",
      },
    });

    openAIWs.onopen = () => {
      console.log("Connected to OpenAI Realtime API");
      
      // Configure session
      openAIWs?.send(JSON.stringify({
        type: "session.update",
        session: {
          modalities: ["text", "audio"],
          instructions: "Tu es Vortex IA, un assistant vocal intelligent et serviable. Réponds de manière claire et naturelle en français.",
          voice: "alloy",
          input_audio_format: "pcm16",
          output_audio_format: "pcm16",
          input_audio_transcription: {
            model: "whisper-1"
          },
          turn_detection: {
            type: "server_vad",
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 1000
          },
          temperature: 0.8,
        }
      }));
    };

    openAIWs.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === "response.audio.delta") {
          // Forward audio to client
          socket.send(JSON.stringify({
            type: "audio",
            audio: data.delta
          }));
        } else if (data.type === "conversation.item.created") {
          conversationHistory.push(data.item);
        }
      } catch (error) {
        console.error("Error processing OpenAI message:", error);
      }
    };

    openAIWs.onerror = (error) => {
      console.error("OpenAI WebSocket error:", error);
      socket.send(JSON.stringify({ type: "error", message: "Erreur de connexion" }));
    };

    openAIWs.onclose = () => {
      console.log("OpenAI WebSocket closed");
      socket.close();
    };
  };

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      
      if (data.type === "audio" && openAIWs && openAIWs.readyState === WebSocket.OPEN) {
        // Forward audio to OpenAI
        openAIWs.send(JSON.stringify({
          type: "input_audio_buffer.append",
          audio: data.audio
        }));
      }
    } catch (error) {
      console.error("Error processing client message:", error);
    }
  };

  socket.onclose = () => {
    console.log("Client WebSocket disconnected");
    if (openAIWs) {
      openAIWs.close();
    }
  };

  socket.onerror = (error) => {
    console.error("Client WebSocket error:", error);
    if (openAIWs) {
      openAIWs.close();
    }
  };

  return response;
});
