import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { MessageSquare, Sparkles, Lock, Zap } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-mesh">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-primary rounded-3xl mb-8 shadow-soft">
            <MessageSquare className="w-10 h-10 text-primary-foreground" />
          </div>
          
          <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-primary bg-clip-text text-transparent">
            Vortex IA
          </h1>
          
          <p className="text-xl text-muted-foreground mb-12 max-w-2xl mx-auto">
            Posez vos questions, obtenez des réponses intelligentes et gardez l'historique de toutes vos conversations.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
            <Button 
              size="lg" 
              onClick={() => navigate("/auth")}
              className="text-lg px-8 py-6 shadow-soft"
            >
              <Sparkles className="mr-2 h-5 w-5" />
              Commencer gratuitement
            </Button>
            <Button 
              size="lg" 
              variant="outline"
              onClick={() => navigate("/auth")}
              className="text-lg px-8 py-6"
            >
              Se connecter
            </Button>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mt-20">
            <div className="p-6 rounded-2xl bg-card border border-border shadow-soft">
              <div className="w-12 h-12 bg-gradient-primary rounded-xl flex items-center justify-center mb-4 mx-auto">
                <Sparkles className="w-6 h-6 text-primary-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">IA Intelligente</h3>
              <p className="text-muted-foreground">
                Propulsé par les derniers modèles d'IA pour des réponses précises et contextuelles
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-card border border-border shadow-soft">
              <div className="w-12 h-12 bg-gradient-primary rounded-xl flex items-center justify-center mb-4 mx-auto">
                <Lock className="w-6 h-6 text-primary-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Sécurisé</h3>
              <p className="text-muted-foreground">
                Vos conversations sont sauvegardées en toute sécurité avec authentification Google
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-card border border-border shadow-soft">
              <div className="w-12 h-12 bg-gradient-primary rounded-xl flex items-center justify-center mb-4 mx-auto">
                <Zap className="w-6 h-6 text-primary-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Rapide</h3>
              <p className="text-muted-foreground">
                Réponses instantanées avec streaming en temps réel pour une expérience fluide
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
