import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { lazy, Suspense } from "react";
import { AnimatePresence, motion } from "framer-motion";

const Home = lazy(() => import("./pages/Home"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const NewProject = lazy(() => import("./pages/NewProject"));
const ProjectDetails = lazy(() => import("./pages/ProjectDetails"));
const Settings = lazy(() => import("./pages/Settings"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const CompareRevisions = lazy(() => import("./pages/CompareRevisions"));
const Planos = lazy(() => import("./pages/Planos"));

function PageLoader() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
        <span className="text-sm text-muted-foreground">Carregando...</span>
      </div>
    </div>
  );
}

const pageTransition = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.2, ease: "easeOut" },
};

function AnimatedPage({ children }: { children: React.ReactNode }) {
  return (
    <motion.div {...pageTransition}>
      {children}
    </motion.div>
  );
}

function Router() {
  const [location] = useLocation();

  return (
    <Suspense fallback={<PageLoader />}>
      <AnimatePresence mode="wait">
        <Switch key={location}>
          <Route path="/">{() => <AnimatedPage><Home /></AnimatedPage>}</Route>
          <Route path="/dashboard">{() => <AnimatedPage><Dashboard /></AnimatedPage>}</Route>
          <Route path="/admin">{() => <AnimatedPage><AdminDashboard /></AnimatedPage>}</Route>
          <Route path="/projects/new">{() => <AnimatedPage><NewProject /></AnimatedPage>}</Route>
          <Route path="/projects/:id">{(params) => <AnimatedPage><ProjectDetails /></AnimatedPage>}</Route>
          <Route path="/projects/:id/compare">{(params) => <AnimatedPage><CompareRevisions /></AnimatedPage>}</Route>
          <Route path="/planos">{() => <AnimatedPage><Planos /></AnimatedPage>}</Route>
          <Route path="/settings">{() => <AnimatedPage><Settings /></AnimatedPage>}</Route>
          <Route path="/404">{() => <AnimatedPage><NotFound /></AnimatedPage>}</Route>
          <Route>{() => <AnimatedPage><NotFound /></AnimatedPage>}</Route>
        </Switch>
      </AnimatePresence>
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
