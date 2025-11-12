import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Paperclip } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Message } from "@/pages/Chat";
import { blobToBase64 } from "@/utils/audioRecorder";

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
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter(file => {
      const isImage = file.type.startsWith('image/');
      const isVideo = file.type.startsWith('video/');
      if (!isImage && !isVideo) {
        toast.error(`${file.name} n'est pas une image ou vidéo valide`);
        return false;
      }
      if (file.size > 20 * 1024 * 1024) {
        toast.error(`${file.name} dépasse la limite de 20MB`);
        return false;
      }
      return true;
    });
    setAttachedFiles(prev => [...prev, ...validFiles].slice(0, 10));
  };

  const removeFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSend = async () => {
    if ((!input.trim() && attachedFiles.length === 0) || isStreaming) return;

    const userMessage = input.trim();
    const files = [...attachedFiles];
    setInput("");
    setAttachedFiles([]);

    // Convert attached files to base64
    const fileContents = await Promise.all(
      files.map(async (file) => {
        const base64 = await blobToBase64(file);
        return {
          type: file.type.startsWith('image/') ? 'image_url' : 'video_url',
          [file.type.startsWith('image/') ? 'image_url' : 'video_url']: {
            url: `data:${file.type};base64,${base64}`
          }
        };
      })
    );

    // Add user message to DB with images
    const messageToInsert: any = {
      conversation_id: conversationId,
      role: "user" as const,
      content: userMessage || "Voici mes fichiers",
    };
    
    if (fileContents.length > 0) {
      messageToInsert.images = fileContents;
    }

    const { data: userMsgData, error: userMsgError } = await supabase
      .from("messages")
      .insert(messageToInsert)
      .select()
      .single();

    if (userMsgError) {
      console.error("Error saving user message:", userMsgError);
      toast.error("Erreur lors de l'envoi du message");
      return;
    }

    // Update messages immediately so user sees their message
    const updatedMessages = [...messages, userMsgData as Message];
    onMessagesUpdate(updatedMessages);
    onStreamingChange(true);

    try {
      const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;
      
      // Prepare message content
      const messageContent = fileContents.length > 0 
        ? [
            { type: 'text', text: userMessage || "Analyse ces fichiers" },
            ...fileContents
          ]
        : userMessage;
      
      const response = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: updatedMessages.map(m => ({
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
          })
          .select()
          .single();

        if (assistantMsgError) {
          toast.error("Erreur lors de la sauvegarde de la réponse");
          onStreamingChange(false);
          return;
        }

        onMessagesUpdate([...updatedMessages, assistantMsgData as Message]);
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
                  ...updatedMessages,
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

        onMessagesUpdate([...updatedMessages, assistantMsgData as Message]);
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
    <div className="border-t border-border p-3 sm:p-4 bg-card">
      <div className="max-w-3xl mx-auto">
        {/* Attached files preview */}
        {attachedFiles.length > 0 && (
          <div className="mb-2 sm:mb-3 flex flex-wrap gap-2">
            {attachedFiles.map((file, index) => (
              <div key={index} className="relative group">
                <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-lg overflow-hidden bg-muted flex items-center justify-center">
                  {file.type.startsWith('image/') ? (
                    <img 
                      src={URL.createObjectURL(file)} 
                      alt={file.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="text-xs text-center px-1">
                      {file.name.slice(0, 10)}...
                    </div>
                  )}
                </div>
                <button
                  onClick={() => removeFile(index)}
                  className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full h-5 w-5 flex items-center justify-center text-xs opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        
        <div className="flex gap-2 sm:gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
          
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={isStreaming || attachedFiles.length >= 10}
            size="icon"
            variant="secondary"
            className="h-12 w-12 sm:h-[60px] sm:w-[60px] flex-shrink-0 shadow-soft"
            title="Joindre des fichiers"
          >
            <Paperclip className="h-4 w-4 sm:h-5 sm:w-5" />
          </Button>
          
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Posez votre question..."
            className="min-h-[48px] sm:min-h-[60px] max-h-[150px] sm:max-h-[200px] resize-none text-sm sm:text-base"
            disabled={isStreaming}
          />
          
          <Button
            onClick={handleSend}
            disabled={(!input.trim() && attachedFiles.length === 0) || isStreaming}
            size="icon"
            className="h-12 w-12 sm:h-[60px] sm:w-[60px] flex-shrink-0 shadow-soft"
          >
            <Send className="h-4 w-4 sm:h-5 sm:w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
};