import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { GraduationCap, Mic, BookOpen, BarChart3, MessageCircle, Sparkles, ArrowRight, Globe, CheckCircle2 } from "lucide-react";
import { useLocation } from "wouter";
import { useEffect } from "react";

export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && isAuthenticated) {
      setLocation("/app");
    }
  }, [loading, isAuthenticated, setLocation]);

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-background/80 backdrop-blur-md border-b">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-7 w-7 text-primary" />
            <span className="text-xl font-bold text-primary">AI Tutor</span>
          </div>
          <Button
            onClick={() => window.location.href = getLoginUrl()}
            size="sm"
          >
            Get Started
          </Button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4">
        <div className="container max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 rounded-full border bg-secondary/50 px-4 py-1.5 text-sm text-secondary-foreground mb-8">
            <Sparkles className="h-4 w-4" />
            <span>AI-Powered English Learning</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-foreground leading-tight mb-6">
            Speak English with
            <span className="text-primary block mt-2">Confidence</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
            Practice real conversations with your AI tutor. Get instant feedback on pronunciation, grammar, and fluency. Learn at your own pace, anytime, anywhere.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              size="lg"
              className="text-base px-8 h-12 shadow-lg hover:shadow-xl transition-all"
              onClick={() => window.location.href = getLoginUrl()}
            >
              Start Free Practice
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="text-base px-8 h-12"
              onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })}
            >
              Learn More
            </Button>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-12 border-y bg-muted/30">
        <div className="container">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { value: "10+", label: "Real Scenarios" },
              { value: "3", label: "Difficulty Levels" },
              { value: "24/7", label: "Always Available" },
              { value: "AI", label: "Instant Feedback" },
            ].map((stat) => (
              <div key={stat.label}>
                <div className="text-3xl font-bold text-primary">{stat.value}</div>
                <div className="text-sm text-muted-foreground mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4">
        <div className="container max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Everything you need to master English
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Our AI tutor combines cutting-edge technology with proven language learning methods.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: Mic,
                title: "Voice Conversations",
                description: "Speak naturally with AI. Real-time speech recognition converts your voice to text for seamless dialogue practice.",
              },
              {
                icon: CheckCircle2,
                title: "Pronunciation Scoring",
                description: "Get detailed feedback on accuracy, fluency, and completeness. Identify weak areas and track improvement over time.",
              },
              {
                icon: BookOpen,
                title: "Scenario Courses",
                description: "Practice in real-world situations: airports, restaurants, interviews, and more. Each with tailored vocabulary.",
              },
              {
                icon: MessageCircle,
                title: "Grammar Correction",
                description: "Receive instant grammar feedback and idiomatic expression suggestions during every conversation.",
              },
              {
                icon: BarChart3,
                title: "Learning Dashboard",
                description: "Track your progress with detailed analytics: practice time, score history, and weakness analysis.",
              },
              {
                icon: Globe,
                title: "Personalized Path",
                description: "AI adapts to your level (A1-C2) and recommends the right courses to accelerate your learning journey.",
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="group relative rounded-xl border bg-card p-6 hover:shadow-lg transition-all hover:border-primary/30"
              >
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-card-foreground mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-4 bg-muted/30">
        <div className="container max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              How it works
            </h2>
            <p className="text-muted-foreground text-lg">Three simple steps to better English</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: "1", title: "Choose a Scenario", desc: "Pick from 10+ real-world conversation scenarios at your level." },
              { step: "2", title: "Start Speaking", desc: "Talk to your AI tutor using voice or text. Practice naturally." },
              { step: "3", title: "Get Feedback", desc: "Receive instant corrections, scores, and personalized tips." },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="h-14 w-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xl font-bold mx-auto mb-4">
                  {item.step}
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4">
        <div className="container max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Ready to improve your English?
          </h2>
          <p className="text-muted-foreground text-lg mb-8">
            Join now and start practicing with your personal AI English tutor.
          </p>
          <Button
            size="lg"
            className="text-base px-10 h-12 shadow-lg"
            onClick={() => window.location.href = getLoginUrl()}
          >
            Start Learning Now
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 px-4">
        <div className="container flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary" />
            <span className="font-semibold text-primary">AI Tutor</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Powered by AI. Built for learners.
          </p>
        </div>
      </footer>
    </div>
  );
}
