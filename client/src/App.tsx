import { Switch, Route, Router, Redirect } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { ThemeProvider } from "@/lib/theme-provider";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Board from "@/pages/board";
import Users from "@/pages/users";

function ProtectedRoute({ component: Component }: { component: () => JSX.Element }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Redirect to="/login" />;
  return <Component />;
}

function AdminRoute({ component: Component }: { component: () => JSX.Element }) {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) return <Redirect to="/login" />;
  if (user?.role !== "admin") return <Redirect to="/" />;
  return <Component />;
}

function AppRouter() {
  const { isAuthenticated } = useAuth();
  return (
    <Switch>
      <Route path="/login">
        {isAuthenticated ? <Redirect to="/" /> : <Login />}
      </Route>
      <Route path="/">
        <ProtectedRoute component={Board} />
      </Route>
      <Route path="/users">
        <AdminRoute component={Users} />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Router hook={useHashLocation}>
              <AppRouter />
            </Router>
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
