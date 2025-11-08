import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Message } from "@/pages/Chat";

interface ChatInputProps {
  conversationId: string;
  messages: Message[];
  onMessagesUpdate: (messages: Message[]) => void;
  isStreaming: boolean;
  onStreamingChange: (streaming: boolean) => void;
}

export const ChatInput = ({
  conversationId,
  messages,
  onMessagesUpdate,
  isStreaming,
  onStreamingChange,
}: ChatInputProps) => {
  const [input, setInput] = useState("");

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;

    const userMessage = input.trim();
    setInput("");

    // Add user message to DB
    const { data: userMsgData, error: userMsgError } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        role: "user" as const,
        content: userMessage,
      })
      .select()
      .single();

    if (userMsgError) {
      toast.error("Erreur lors de l'envoi du message");
      return;
    }

    onMessagesUpdate([...messages, userMsgData as Message]);
    onStreamingChange(true);

    try {
      const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;
      
      const response = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: [...messages, { role: "user", content: userMessage }].map(m => ({
            role: m.role,
            content: m.content
          })),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (response.status === 429) {
          toast.error("Limite de requêtes dépassée. Veuillez réessayer plus tard.");
        } else if (response.status === 402) {
          toast.error("Crédits insuffisants. Veuillez ajouter des crédits.");
        } else {
          toast.error(errorData.error || "Erreur lors de la communication avec l'IA");
        }
        onStreamingChange(false);
        return;
      }

      // Check if response is JSON (image generation) or stream (text chat)
      const contentType = response.headers.get("content-type");
      
      if (contentType?.includes("application/json")) {
        // Image generation response
        const data = await response.json();
        const generatedImages = data.choices?.[0]?.message?.images;
        const textContent = data.choices?.[0]?.message?.content || "Voici l'image générée :";

        // Save assistant message with images to DB
        const { data: assistantMsgData, error: assistantMsgError } = await supabase
          .from("messages")
          .insert({
            conversation_id: conversationId,
            role: "assistant" as const,
            content: textContent,
            images: generatedImages || null,
          })
          .select()
          .single();

        if (assistantMsgError) {
          toast.error("Erreur lors de la sauvegarde de la réponse");
          onStreamingChange(false);
          return;
        }

        onMessagesUpdate([...messages, userMsgData as Message, assistantMsgData as Message]);
      } else {
        // Text streaming response
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let assistantMessage = "";
        let textBuffer = "";

        if (!reader) {
          throw new Error("Impossible de lire la réponse");
        }

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          textBuffer += decoder.decode(value, { stream: true });

          let newlineIndex: number;
          while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
            let line = textBuffer.slice(0, newlineIndex);
            textBuffer = textBuffer.slice(newlineIndex + 1);

            if (line.endsWith("\r")) line = line.slice(0, -1);
            if (line.startsWith(":") || line.trim() === "") continue;
            if (!line.startsWith("data: ")) continue;

            const jsonStr = line.slice(6).trim();
            if (jsonStr === "[DONE]") break;

            try {
              const parsed = JSON.parse(jsonStr);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                assistantMessage += content;
                
                // Update messages optimistically
                onMessagesUpdate([
                  ...messages,
                  userMsgData as Message,
                  {
                    id: "temp-" + Date.now(),
                    role: "assistant" as const,
                    content: assistantMessage,
                    created_at: new Date().toISOString(),
                  } as Message,
                ]);
              }
            } catch (e) {
              // Partial JSON, wait for more data
              textBuffer = line + "\n" + textBuffer;
              break;
            }
          }
        }

        // Save assistant message to DB
        const { data: assistantMsgData, error: assistantMsgError } = await supabase
          .from("messages")
          .insert({
            conversation_id: conversationId,
            role: "assistant" as const,
            content: assistantMessage,
          })
          .select()
          .single();

        if (assistantMsgError) {
          toast.error("Erreur lors de la sauvegarde de la réponse");
          onStreamingChange(false);
          return;
        }

        onMessagesUpdate([...messages, userMsgData as Message, assistantMsgData as Message]);
      }
      
      // Update conversation title if it's the first message
      if (messages.length === 0) {
        try {
          const titleResponse = await fetch(CHAT_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify({
              messages: [
                { role: "system", content: "Generate a short, concise title (max 40 characters) for this conversation based on the user's message. Only return the title, nothing else." },
                { role: "user", content: userMessage }
              ],
            }),
          });

          if (titleResponse.ok) {
            const titleReader = titleResponse.body?.getReader();
            const titleDecoder = new TextDecoder();
            let title = "";
            let titleBuffer = "";

            if (titleReader) {
              while (true) {
                const { done, value } = await titleReader.read();
                if (done) break;

                titleBuffer += titleDecoder.decode(value, { stream: true });

                let newlineIndex: number;
                while ((newlineIndex = titleBuffer.indexOf("\n")) !== -1) {
                  let line = titleBuffer.slice(0, newlineIndex);
                  titleBuffer = titleBuffer.slice(newlineIndex + 1);

                  if (line.endsWith("\r")) line = line.slice(0, -1);
                  if (line.startsWith(":") || line.trim() === "") continue;
                  if (!line.startsWith("data: ")) continue;

                  const jsonStr = line.slice(6).trim();
                  if (jsonStr === "[DONE]") break;

                  try {
                    const parsed = JSON.parse(jsonStr);
                    const content = parsed.choices?.[0]?.delta?.content;
                    if (content) {
                      title += content;
                    }
                  } catch (e) {
                    titleBuffer = line + "\n" + titleBuffer;
                    break;
                  }
                }
              }

              if (title.trim()) {
                await supabase
                  .from("conversations")
                  .update({ title: title.trim().slice(0, 60) })
                  .eq("id", conversationId);
              }
            }
          }
        } catch (error) {
          console.error("Error generating title:", error);
          // Fallback to simple title
          const fallbackTitle = userMessage.slice(0, 50) + (userMessage.length > 50 ? "..." : "");
          await supabase
            .from("conversations")
            .update({ title: fallbackTitle })
            .eq("id", conversationId);
        }
      }
    } catch (error) {
      console.error("Error:", error);
      toast.error("Erreur lors de la communication avec l'IA");
    } finally {
      onStreamingChange(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-border p-4 bg-card">
      <div className="max-w-3xl mx-auto flex gap-3">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Posez votre question..."
          className="min-h-[60px] max-h-[200px] resize-none"
          disabled={isStreaming}
        />
        <Button
          onClick={handleSend}
          disabled={!input.trim() || isStreaming}
          size="icon"
          className="h-[60px] w-[60px] flex-shrink-0 shadow-soft"
        >
          <Send className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
};