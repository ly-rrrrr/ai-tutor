import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageCircle, Clock, ArrowRight } from "lucide-react";
import { useLocation } from "wouter";

export default function HistoryPage() {
  const [, setLocation] = useLocation();
  const { data: conversations, isLoading } = trpc.conversation.list.useQuery({ limit: 50, offset: 0 });

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Conversation History</h1>
        <p className="text-muted-foreground mt-1">Review your past conversations and AI feedback.</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : !conversations || conversations.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <MessageCircle className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-1">No conversations yet</h3>
            <p className="text-sm text-muted-foreground">Start your first conversation to see it here.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {conversations.map((conv) => (
            <Card
              key={conv.id}
              className="cursor-pointer hover:shadow-md transition-all hover:border-primary/30 group"
              onClick={() => setLocation(`~/app/chat/${conv.id}`)}
            >
              <CardContent className="flex items-center gap-4 p-4">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <MessageCircle className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-semibold text-card-foreground truncate">
                      {conv.title || "Free Conversation"}
                    </h3>
                    <Badge
                      variant={conv.status === "completed" ? "default" : "outline"}
                      className="capitalize text-xs shrink-0"
                    >
                      {conv.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(conv.createdAt).toLocaleDateString("en-US", {
                        month: "short", day: "numeric", year: "numeric",
                      })}
                    </span>
                    <span>{conv.messageCount ?? 0} messages</span>
                    {conv.avgScore && (
                      <span className="text-primary font-medium">Score: {Math.round(conv.avgScore)}</span>
                    )}
                  </div>
                  {conv.feedback && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{conv.feedback}</p>
                  )}
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
