import { useEffect, useRef } from "react";
import { Message } from "@/pages/Chat";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Squirrel, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatMessagesProps {
  messages: Message[];
  isStreaming: boolean;
}

export const ChatMessages = ({ messages, isStreaming }: ChatMessagesProps) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Utilise requestAnimationFrame pour un scroll plus fluide
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    });
  }, [messages, isStreaming]);

  return (
    <ScrollArea className="h-full p-4">
      <div className="max-w-3xl mx-auto space-y-6">
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "flex gap-3 animate-in fade-in-50 slide-in-from-bottom-3 duration-300",
              message.role === "user" ? "justify-end" : "justify-start"
            )}
          >
            {message.role === "assistant" && (
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0 shadow-soft">
                <Squirrel className="w-5 h-5 text-primary-foreground" />
              </div>
            )}
            <div
              className={cn(
                "rounded-2xl px-4 py-3 max-w-[85%] shadow-sm",
                message.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border border-border"
              )}
            >
              {message.content && (
                <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
              )}
              {message.images && message.images.length > 0 && (
                <div className="mt-3 space-y-2">
                  {message.images.map((img, idx) => (
                    <div key={idx}>
                      {img.image_url ? (
                        <img
                          src={img.image_url.url}
                          alt="Image"
                          className="rounded-lg max-w-full h-auto"
                        />
                      ) : img.video_url ? (
                        <video
                          src={img.video_url.url}
                          controls
                          className="rounded-lg max-w-full h-auto"
                        />
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {message.role === "user" && (
              <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                <User className="w-5 h-5 text-secondary-foreground" />
              </div>
            )}
          </div>
        ))}
        {isStreaming && (
          <div className="flex gap-3 animate-in fade-in-50">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0 shadow-soft">
              <Squirrel className="w-5 h-5 text-primary-foreground" />
            </div>
            <div className="rounded-2xl px-4 py-3 bg-card border border-border shadow-sm">
              <div className="flex gap-1">
                <div className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
    </ScrollArea>
  );
};