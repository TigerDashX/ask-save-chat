import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log("Starting AI chat with", messages.length, "messages");

    // Detect if user is asking for image generation
    const lastUserMessage = messages.filter((m: any) => m.role === "user").pop()?.content || "";
    const messageText = typeof lastUserMessage === "string" 
      ? lastUserMessage 
      : Array.isArray(lastUserMessage) 
        ? lastUserMessage.find((item: any) => item.type === "text")?.text || ""
        : "";
    const imageKeywords = ["génère", "génerer", "générer", "crée", "créer", "créé", "dessine", "dessiner", "image", "photo", "illustration"];
    const isImageRequest = imageKeywords.some(keyword => messageText.toLowerCase().includes(keyword));

    // If image generation is requested, use the image model
    if (isImageRequest) {
      const imageResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-image-preview",
          messages: [
            { 
              role: "system", 
              content: "Tu es Vortex IA, un assistant capable de générer des images. Quand l'utilisateur demande une image, génère-la selon sa description." 
            },
            ...messages,
          ],
          modalities: ["image", "text"],
        }),
      });

      if (!imageResponse.ok) {
        const errorText = await imageResponse.text();
        console.error("Image generation error:", imageResponse.status, errorText);
        
        if (imageResponse.status === 429) {
          return new Response(
            JSON.stringify({ error: "Limite de requêtes dépassée, veuillez réessayer plus tard." }), 
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (imageResponse.status === 402) {
          return new Response(
            JSON.stringify({ error: "Crédits insuffisants, veuillez ajouter des crédits à votre espace de travail." }), 
            { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        return new Response(
          JSON.stringify({ error: "Erreur lors de la génération de l'image" }), 
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const imageData = await imageResponse.json();
      return new Response(
        JSON.stringify(imageData),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Regular text chat with streaming
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { 
            role: "system", 
            content: "Tu es Vortex IA, un assistant intelligent et serviable. Réponds de manière claire et concise en français. Tu peux analyser des images et des vidéos." 
          },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requêtes dépassée, veuillez réessayer plus tard." }), 
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Crédits insuffisants, veuillez ajouter des crédits à votre espace de travail." }), 
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: "Erreur du service IA" }), 
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(response.body, {
      headers: { 
        ...corsHeaders, 
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      },
    });
  } catch (error) {
    console.error("Chat error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erreur inconnue" }), 
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});