import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageSquare, Plus, Trash2, LogOut } from "lucide-react";
import { Conversation } from "@/pages/Chat";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface ChatSidebarProps {
  conversations: Conversation[];
  currentConversation: string | null;
  onNewConversation: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onSignOut: () => void;
  userEmail: string;
}

export const ChatSidebar = ({
  conversations,
  currentConversation,
  onNewConversation,
  onSelectConversation,
  onDeleteConversation,
  onSignOut,
  userEmail,
}: ChatSidebarProps) => {
  return (
    <div className="flex flex-col h-full bg-card">
      <div className="p-4 border-b border-border">
        <Button onClick={onNewConversation} className="w-full" size="lg">
          <Plus className="mr-2 h-4 w-4" />
          Nouvelle conversation
        </Button>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-2">
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className={`group relative rounded-lg transition-all ${
                currentConversation === conv.id
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              }`}
            >
              <button
                onClick={() => onSelectConversation(conv.id)}
                className="w-full text-left p-3 pr-10 rounded-lg"
              >
                <div className="flex items-start gap-3">
                  <MessageSquare className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{conv.title}</p>
                    <p className="text-xs opacity-70 truncate">
                      {new Date(conv.updated_at).toLocaleDateString("fr-FR")}
                    </p>
                  </div>
                </div>
              </button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`absolute right-2 top-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity ${
                      currentConversation === conv.id
                        ? "text-primary-foreground hover:bg-primary-foreground/20"
                        : ""
                    }`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Supprimer la conversation</AlertDialogTitle>
                    <AlertDialogDescription>
                      Êtes-vous sûr de vouloir supprimer cette conversation ? Cette action est
                      irréversible.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction onClick={() => onDeleteConversation(conv.id)}>
                      Supprimer
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="p-4 border-t border-border">
        <div className="mb-3 px-2">
          <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
        </div>
        <Button onClick={onSignOut} variant="outline" className="w-full" size="sm">
          <LogOut className="mr-2 h-4 w-4" />
          Déconnexion
        </Button>
      </div>
    </div>
  );
};