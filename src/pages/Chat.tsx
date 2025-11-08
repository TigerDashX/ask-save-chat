import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { ChatMessages } from "@/components/chat/ChatMessages";
import { ChatInput } from "@/components/chat/ChatInput";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Menu, Squirrel } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { toast } from "sonner";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  images?: Array<{
    type: string;
    image_url?: {
      url: string;
    };
    video_url?: {
      url: string;
    };
  }>;
}

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

const Chat = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversation, setCurrentConversation] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        loadConversations();
      } else {
        navigate("/auth");
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (session?.user) {
          setUser(session.user);
          loadConversations();
        } else {
          navigate("/auth");
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [navigate]);

  const loadConversations = async () => {
    const { data, error } = await supabase
      .from("conversations")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error) {
      toast.error("Erreur lors du chargement des conversations");
      return;
    }

    setConversations(data || []);
  };

  const loadMessages = async (conversationId: string) => {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (error) {
      toast.error("Erreur lors du chargement des messages");
      return;
    }

    setMessages((data || []) as Message[]);
  };

  const createNewConversation = async () => {
    const { data, error } = await supabase
      .from("conversations")
      .insert({ user_id: user?.id })
      .select()
      .single();

    if (error) {
      toast.error("Erreur lors de la création de la conversation");
      return;
    }

    setConversations((prev) => [data, ...prev]);
    setCurrentConversation(data.id);
    setMessages([]);
  };

  const selectConversation = (id: string) => {
    setCurrentConversation(id);
    loadMessages(id);
    setIsSidebarOpen(false);
  };

  const deleteConversation = async (id: string) => {
    const { error } = await supabase
      .from("conversations")
      .delete()
      .eq("id", id);

    if (error) {
      toast.error("Erreur lors de la suppression");
      return;
    }

    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (currentConversation === id) {
      setCurrentConversation(null);
      setMessages([]);
    }
    toast.success("Conversation supprimée");
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Squirrel className="w-12 h-12 text-primary mx-auto mb-4 animate-pulse" />
          <p className="text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop Sidebar */}
      <div className="hidden md:block w-64 border-r border-border">
        <ChatSidebar
          conversations={conversations}
          currentConversation={currentConversation}
          onNewConversation={createNewConversation}
          onSelectConversation={selectConversation}
          onDeleteConversation={deleteConversation}
          onSignOut={handleSignOut}
          userEmail={user?.email || ""}
        />
      </div>

      {/* Mobile Sidebar */}
      <Sheet open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden absolute top-4 left-4 z-50"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="p-0 w-64">
          <ChatSidebar
            conversations={conversations}
            currentConversation={currentConversation}
            onNewConversation={createNewConversation}
            onSelectConversation={selectConversation}
            onDeleteConversation={deleteConversation}
            onSignOut={handleSignOut}
            userEmail={user?.email || ""}
          />
        </SheetContent>
      </Sheet>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="border-b border-border p-4 flex items-center justify-between gap-3 pl-16 md:pl-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-soft">
              <Squirrel className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-semibold">Vortex IA</h1>
              <p className="text-xs text-muted-foreground">
                {currentConversation ? "Prêt à vous aider" : "Commencez une nouvelle conversation"}
              </p>
            </div>
          </div>
          <ThemeToggle />
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-hidden">
          {currentConversation ? (
            <ChatMessages messages={messages} isStreaming={isStreaming} />
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center max-w-md px-4">
                <div className="w-20 h-20 bg-primary rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-soft">
                  <Squirrel className="w-10 h-10 text-primary-foreground" />
                </div>
                <h2 className="text-2xl font-bold mb-2">Bienvenue !</h2>
                <p className="text-muted-foreground mb-6">
                  Commencez une nouvelle conversation pour discuter avec votre assistant IA.
                </p>
                <Button onClick={createNewConversation} size="lg" className="shadow-soft">
                  Nouvelle conversation
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        {currentConversation && (
          <ChatInput
            conversationId={currentConversation}
            messages={messages}
            onMessagesUpdate={setMessages}
            isStreaming={isStreaming}
            onStreamingChange={setIsStreaming}
          />
        )}
      </div>
    </div>
  );
};

export default Chat;