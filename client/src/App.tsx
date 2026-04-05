import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Login from "./pages/Login";
import DashboardLayout from "./components/DashboardLayout";
import Explore from "./pages/Explore";
import Chat from "./pages/Chat";
import Courses from "./pages/Courses";
import Dashboard from "./pages/Dashboard";
import HistoryPage from "./pages/History";
import ConversationDetail from "./pages/ConversationDetail";

function AppShell() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path="/" component={Explore} />
        <Route path="/chat" component={Chat} />
        <Route path="/chat/:id" component={ConversationDetail} />
        <Route path="/courses" component={Courses} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/history" component={HistoryPage} />
        <Route component={Explore} />
      </Switch>
    </DashboardLayout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/app" nest component={AppShell} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
