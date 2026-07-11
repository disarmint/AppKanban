import { Switch, Route, Router, Redirect } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { ThemeProvider } from "@/lib/theme-provider";
import { ChangePasswordDialog } from "@/components/change-password-dialog";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Board from "@/pages/board";
import Users from "@/pages/users";
import Departments from "@/pages/departments";
import Analytics from "@/pages/analytics";
import Archive from "@/pages/archive";
import CalendarPage from "@/pages/calendar";
import Settings from "@/pages/settings";
import Reports from "@/pages/reports";
import WeeklySummary from "@/pages/weekly-summary";

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
  const { isAuthenticated, user } = useAuth();
  if (isAuthenticated && user?.mustChangePassword) {
    return <ChangePasswordDialog />;
  }
  return (
    <Switch>
      <Route path="/login">
        {isAuthenticated ? <Redirect to="/" /> : <Login />}
      </Route>
      <Route path="/">
        <ProtectedRoute component={Board} />
      </Route>
      <Route path="/archive">
        <ProtectedRoute component={Archive} />
      </Route>
      <Route path="/calendar">
        <ProtectedRoute component={CalendarPage} />
      </Route>
      <Route path="/users">
        <AdminRoute component={Users} />
      </Route>
      <Route path="/settings">
        <AdminRoute component={Settings} />
      </Route>
      <Route path="/reports">
        <AdminRoute component={Reports} />
      </Route>
      <Route path="/weekly-summary">
        <AdminRoute component={WeeklySummary} />
      </Route>
      <Route path="/departments">
        <AdminRoute component={Departments} />
      </Route>
      <Route path="/analytics">
        <AdminRoute component={Analytics} />
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
