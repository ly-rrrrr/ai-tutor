import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageCircle, ArrowRight, Sparkles, TrendingUp, BookOpen } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

const difficultyColors: Record<string, string> = {
  beginner: "bg-green-100 text-green-700 border-green-200",
  intermediate: "bg-amber-100 text-amber-700 border-amber-200",
  advanced: "bg-red-100 text-red-700 border-red-200",
};

const categoryLabels: Record<string, string> = {
  daily: "Daily Life",
  travel: "Travel",
  business: "Business",
  academic: "Academic",
  social: "Social",
};

export default function Explore() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { data: recommendations, isLoading: recLoading } = trpc.dashboard.recommendations.useQuery();
  const createConversation = trpc.conversation.create.useMutation({
    onSuccess: (data) => {
      setLocation(`~/app/chat/${data.conversationId}`);
    },
    onError: () => {
      toast.error("Failed to start conversation");
    },
  });

  const handleStartScenario = (scenarioId: number) => {
    createConversation.mutate({ scenarioId });
  };

  const handleFreeChat = () => {
    createConversation.mutate({});
  };

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Welcome Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Welcome back, {user?.name || "Learner"} 👋
        </h1>
        <p className="text-muted-foreground mt-1">
          Ready to practice your English? Choose a scenario or start a free conversation.
        </p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card
          className="cursor-pointer hover:shadow-md transition-all hover:border-primary/40 group"
          onClick={handleFreeChat}
        >
          <CardContent className="flex items-center gap-4 p-5">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
              <MessageCircle className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-card-foreground">Free Conversation</h3>
              <p className="text-sm text-muted-foreground">Chat freely with your AI tutor on any topic</p>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:shadow-md transition-all hover:border-primary/40 group"
          onClick={() => setLocation("~/app/courses")}
        >
          <CardContent className="flex items-center gap-4 p-5">
            <div className="h-12 w-12 rounded-xl bg-chart-4/10 flex items-center justify-center shrink-0 group-hover:bg-chart-4/20 transition-colors">
              <BookOpen className="h-6 w-6 text-chart-4" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-card-foreground">Browse All Courses</h3>
              <p className="text-sm text-muted-foreground">Explore 10+ real-world scenario courses</p>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-chart-4 transition-colors shrink-0" />
          </CardContent>
        </Card>
      </div>

      {/* Personalized Recommendations */}
      {recLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-6 w-48" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-36 rounded-xl" />
            ))}
          </div>
        </div>
      ) : recommendations ? (
        <>
          {/* Learning Tip */}
          {recommendations.tip && (
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="flex items-start gap-3 p-4">
                <Sparkles className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-foreground">Learning Tip for Level {recommendations.level}</p>
                  <p className="text-sm text-muted-foreground mt-1">{recommendations.tip}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recommended Scenarios */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">Recommended for You</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {recommendations.recommended.map((scenario) => (
                <Card
                  key={scenario.id}
                  className="cursor-pointer hover:shadow-md transition-all hover:border-primary/30 group"
                  onClick={() => handleStartScenario(scenario.id)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{scenario.title}</CardTitle>
                      <Badge variant="outline" className={difficultyColors[scenario.difficulty]}>
                        {scenario.difficulty}
                      </Badge>
                    </div>
                    <CardDescription className="text-xs">{categoryLabels[scenario.category] || scenario.category}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground line-clamp-2">{scenario.descriptionZh}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Challenge Scenarios */}
          {recommendations.challenge.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="h-5 w-5 text-amber-500" />
                <h2 className="text-lg font-semibold text-foreground">Challenge Yourself</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {recommendations.challenge.map((scenario) => (
                  <Card
                    key={scenario.id}
                    className="cursor-pointer hover:shadow-md transition-all hover:border-amber-300 group border-amber-100"
                    onClick={() => handleStartScenario(scenario.id)}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">{scenario.title}</CardTitle>
                        <Badge variant="outline" className={difficultyColors[scenario.difficulty]}>
                          {scenario.difficulty}
                        </Badge>
                      </div>
                      <CardDescription className="text-xs">{categoryLabels[scenario.category] || scenario.category}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground line-clamp-2">{scenario.descriptionZh}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
