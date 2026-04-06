import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { appRoutes } from "@/lib/routes";
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

export default function Courses() {
  const [, setLocation] = useLocation();
  const { data: scenarios, isLoading } = trpc.scenario.list.useQuery();
  const createConversation = trpc.conversation.create.useMutation({
    onSuccess: (data) => {
      setLocation(appRoutes.conversation(data.conversationId));
    },
    onError: () => toast.error("Failed to start conversation"),
  });

  const categories = ["all", "daily", "travel", "business", "academic", "social"];

  const filterByCategory = (cat: string) => {
    if (!scenarios) return [];
    if (cat === "all") return scenarios;
    return scenarios.filter(s => s.category === cat);
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Scenario Courses</h1>
        <p className="text-muted-foreground mt-1">
          Practice English in real-world scenarios. Each course includes tailored vocabulary and guided conversations.
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-44 rounded-xl" />)}
        </div>
      ) : (
        <Tabs defaultValue="all">
          <TabsList className="mb-4 flex-wrap h-auto gap-1">
            {categories.map(cat => (
              <TabsTrigger key={cat} value={cat} className="capitalize text-sm">
                {cat === "all" ? "All" : categoryLabels[cat] || cat}
              </TabsTrigger>
            ))}
          </TabsList>

          {categories.map(cat => (
            <TabsContent key={cat} value={cat}>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filterByCategory(cat).map(scenario => (
                  <Card
                    key={scenario.id}
                    className="cursor-pointer hover:shadow-md transition-all hover:border-primary/30 group"
                    onClick={() => createConversation.mutate({ scenarioId: scenario.id })}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className={difficultyColors[scenario.difficulty]}>
                          {scenario.difficulty}
                        </Badge>
                        <Badge variant="secondary" className="text-xs capitalize">
                          {categoryLabels[scenario.category] || scenario.category}
                        </Badge>
                      </div>
                      <CardTitle className="text-base mt-2">{scenario.title}</CardTitle>
                      <CardDescription>{scenario.titleZh}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{scenario.description}</p>
                      {scenario.vocabulary && (
                        <div className="flex flex-wrap gap-1">
                          {(typeof scenario.vocabulary === 'string' ? JSON.parse(scenario.vocabulary) : scenario.vocabulary as string[]).slice(0, 5).map((word: string) => (
                            <Badge key={word} variant="secondary" className="text-xs font-normal">
                              {word}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}
