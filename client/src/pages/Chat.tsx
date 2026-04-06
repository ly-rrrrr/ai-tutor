import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { appRoutes } from "@/lib/routes";
import { MessageCircle, ArrowRight } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

const difficultyColors: Record<string, string> = {
  beginner: "bg-green-100 text-green-700 border-green-200",
  intermediate: "bg-amber-100 text-amber-700 border-amber-200",
  advanced: "bg-red-100 text-red-700 border-red-200",
};

/** 安全解析 vocabulary 字段：可能是 JSON 字符串或已是数组 */
function parseVocabulary(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export default function Chat() {
  const [, setLocation] = useLocation();
  const { data: scenarios, isLoading } = trpc.scenario.list.useQuery();
  const createConversation = trpc.conversation.create.useMutation({
    onSuccess: (data) => {
      setLocation(appRoutes.conversation(data.conversationId));
    },
    onError: () => {
      toast.error("Failed to start conversation");
    },
  });

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Start a Conversation</h1>
        <p className="text-muted-foreground mt-1">
          Choose a scenario or start a free conversation with your AI tutor.
        </p>
      </div>

      {/* Free Chat */}
      <Card
        className="cursor-pointer hover:shadow-md transition-all hover:border-primary/40 group"
        onClick={() => createConversation.mutate({})}
      >
        <CardContent className="flex items-center gap-4 p-5">
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <MessageCircle className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-card-foreground">Free Conversation</h3>
            <p className="text-sm text-muted-foreground">Talk about anything you want</p>
          </div>
          <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
        </CardContent>
      </Card>

      {/* Scenario List */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">Scenario Practice</h2>
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {scenarios?.map((scenario) => {
              const vocabArr = parseVocabulary(scenario.vocabulary);
              return (
                <Card
                  key={scenario.id}
                  className="cursor-pointer hover:shadow-md transition-all hover:border-primary/30"
                  onClick={() => createConversation.mutate({ scenarioId: scenario.id })}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{scenario.title}</CardTitle>
                      <Badge variant="outline" className={difficultyColors[scenario.difficulty]}>
                        {scenario.difficulty}
                      </Badge>
                    </div>
                    <CardDescription>{scenario.titleZh}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground line-clamp-2">{scenario.description}</p>
                    {vocabArr.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-3">
                        {vocabArr.slice(0, 4).map((word: string) => (
                          <Badge key={word} variant="secondary" className="text-xs font-normal">
                            {word}
                          </Badge>
                        ))}
                        {vocabArr.length > 4 && (
                          <Badge variant="secondary" className="text-xs font-normal">
                            +{vocabArr.length - 4}
                          </Badge>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
