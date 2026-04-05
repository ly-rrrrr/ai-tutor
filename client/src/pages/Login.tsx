import { FormEvent, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { GraduationCap, Mail, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

function deriveDisplayName(email: string) {
  const localPart = email.split("@")[0] ?? "Learner";
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map(token => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

export default function Login() {
  const { isAuthenticated, loading } = useAuth();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const callbackUrl = useMemo(() => "/app", []);

  useEffect(() => {
    if (!loading && isAuthenticated) {
      setLocation("/app");
    }
  }, [isAuthenticated, loading, setLocation]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      toast.error("Please enter your email address.");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await authClient.signIn.magicLink({
        email: normalizedEmail,
        name: deriveDisplayName(normalizedEmail),
        callbackURL: callbackUrl,
      });

      if (result.error) {
        throw new Error(result.error.message || "Could not send sign-in email.");
      }

      toast.success("Magic link sent. Check your email to continue.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not send sign-in email."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md items-center">
        <Card className="w-full border-border/60 shadow-xl">
          <CardHeader className="space-y-4 text-center">
            <button
              type="button"
              onClick={() => setLocation("/")}
              className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to home
            </button>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <GraduationCap className="h-7 w-7 text-primary" />
            </div>
            <div className="space-y-1">
              <CardTitle className="text-2xl">Sign in with email</CardTitle>
              <CardDescription>
                We will send you a magic link to continue to AI Tutor.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground" htmlFor="email">
                  Email address
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={event => setEmail(event.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>
              <Button className="w-full" disabled={isSubmitting} type="submit">
                {isSubmitting ? "Sending link..." : "Send magic link"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
