import {
  CalendarCheck,
  ClipboardList,
  Grape,
  LayoutDashboard,
  Map,
  Settings2,
  SlidersHorizontal,
} from "lucide-react";
import { NavLink, Navigate, Outlet, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { clearAuthToken, getAuthToken, logout } from "@/lib/api";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/rows", label: "Rows", icon: Map },
  { to: "/tasks", label: "Tasks", icon: CalendarCheck },
  { to: "/harvests", label: "Harvests", icon: Grape },
  { to: "/activities", label: "Log work", icon: ClipboardList },
  { to: "/setup", label: "Setup", icon: Settings2 },
] as const;

const secondaryNav = [
  { to: "/settings", label: "Settings", icon: SlidersHorizontal },
] as const;

function NavItem({
  to,
  label,
  icon: Icon,
  end,
}: {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          "flex min-h-11 items-center gap-3 rounded-md px-3 text-base font-medium",
          isActive
            ? "bg-primary text-primary-foreground"
            : "text-foreground hover:bg-background",
        )
      }
    >
      <Icon className="size-5 shrink-0" aria-hidden />
      {label}
    </NavLink>
  );
}

function formatRole(role: string): string {
  return role.replaceAll("_", " ");
}

export function AppLayout() {
  const navigate = useNavigate();
  const { state } = useCurrentUser();
  const user = state.status === "ready" ? state.user : null;

  if (!getAuthToken()) {
    return <Navigate to="/login" replace />;
  }

  async function onSignOut() {
    try {
      await logout();
    } catch {
      // Clear the local session even if the API call fails.
    }
    clearAuthToken();
    navigate("/login", { replace: true });
  }

  const account = (
    <div className="space-y-2 px-3 py-2">
      {user ? (
        <div>
          <p className="font-medium">{user.displayName}</p>
          <p className="text-sm text-muted capitalize">{formatRole(user.role)}</p>
        </div>
      ) : (
        <p className="text-sm text-muted">
          {state.status === "loading" ? "Loading account…" : "Signed in"}
        </p>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => void onSignOut()}
      >
        Sign out
      </Button>
    </div>
  );

  return (
    <div className="min-h-screen md:grid md:grid-cols-[16.5rem_1fr]">
      <aside className="hidden border-r border-border bg-card px-4 py-6 md:flex md:flex-col">
        <p className="px-3 text-sm font-semibold tracking-wide text-primary uppercase">
          Vineyard Manager
        </p>
        <nav className="mt-6 flex flex-1 flex-col gap-1" aria-label="Main">
          {navItems.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
        </nav>
        <div className="mt-4 border-t border-border pt-4">
          {account}
          <nav className="mt-2 flex flex-col gap-1" aria-label="Account">
            {secondaryNav.map((item) => (
              <NavItem key={item.to} {...item} />
            ))}
          </nav>
        </div>
      </aside>

      <div className="flex min-h-screen flex-col">
        <header className="border-b border-border bg-card px-4 py-3 md:hidden">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-semibold tracking-wide text-primary uppercase">
              Vineyard Manager
            </p>
            <div className="text-right">
              {user ? (
                <>
                  <p className="text-sm font-medium">{user.displayName}</p>
                  <p className="text-xs text-muted capitalize">
                    {formatRole(user.role)}
                  </p>
                </>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-1 h-8 px-2"
                onClick={() => void onSignOut()}
              >
                Sign out
              </Button>
            </div>
          </div>
          <nav
            className="-mx-1 mt-3 flex gap-1 overflow-x-auto pb-1"
            aria-label="Main"
          >
            {[...navItems, ...secondaryNav].map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={"end" in item ? item.end : false}
                className={({ isActive }) =>
                  cn(
                    "shrink-0 rounded-md px-3 py-2 text-sm font-medium",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-foreground",
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-8">
          <Outlet context={{ user }} />
        </main>
      </div>
    </div>
  );
}
