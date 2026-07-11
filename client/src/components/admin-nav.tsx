import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Users, Building2, BarChart3 } from "lucide-react";

const ITEMS = [
  { href: "/users", icon: Users, label: "Пользователи", testId: "link-users" },
  { href: "/departments", icon: Building2, label: "Отделы", testId: "link-departments" },
  { href: "/analytics", icon: BarChart3, label: "Аналитика", testId: "link-analytics" },
];

export function AdminNav() {
  const [location] = useLocation();
  return (
    <div className="flex items-center gap-1">
      {ITEMS.map(({ href, icon: Icon, label, testId }) => (
        <Link key={href} href={href}>
          <Button
            variant={location === href ? "secondary" : "ghost"}
            size="icon"
            aria-label={label}
            data-testid={testId}
          >
            <Icon className="h-4 w-4" />
          </Button>
        </Link>
      ))}
    </div>
  );
}
