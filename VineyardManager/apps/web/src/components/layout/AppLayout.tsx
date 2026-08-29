import {
  BarChart3,
  CalendarCheck,
  ClipboardList,
  Grape,
  LayoutDashboard,
  Map,
  Settings2,
  SlidersHorizontal,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, NavLink, Navigate, Outlet, useNavigate } from "react-router-dom";
import type { PublicUser, Vineyard } from "@vineyard/shared";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import {
  clearAuthToken,
  fetchVineyardLogoBlob,
  getAuthToken,
  listVineyards,
  logout,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/rows", label: "Rows", icon: Map },
  { to: "/tasks", label: "Tasks", icon: CalendarCheck },
  { to: "/harvests", label: "Harvests", icon: Grape },
  { to: "/metrics", label: "Metrics", icon: BarChart3 },
  { to: "/activities", label: "Log work", icon: ClipboardList },
  { to: "/setup", label: "Setup", icon: Settings2 },
] as const;

const secondaryNav = [
  { to: "/settings", label: "Settings", icon: SlidersHorizontal },
] as const;

export type AppOutletContext = {
  user: PublicUser | null;
  vineyard: Vineyard | null;
  reloadVineyard: () => Promise<void>;
};

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

function Brand({
  vineyard,
  logoUrl,
}: {
  vineyard: Vineyard | null;
  logoUrl: string | null;
}) {
  return (
    <Link to="/" className="flex min-w-0 items-center">
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={vineyard?.name ?? "Home"}
          className="h-14 max-w-[16rem] object-contain object-left md:h-20 md:max-w-[22rem]"
        />
      ) : (
        <span className="text-sm font-semibold tracking-wide text-primary uppercase">
          Vineyard Manager
        </span>
      )}
    </Link>
  );
}

export function AppLayout() {
  const navigate = useNavigate();
  const { state } = useCurrentUser();
  const user = state.status === "ready" ? state.user : null;
  const [vineyard, setVineyard] = useState<Vineyard | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  const reloadVineyard = useCallback(async () => {
    const vineyards = await listVineyards();
    setVineyard(vineyards[0] ?? null);
  }, []);

  useEffect(() => {
    if (!getAuthToken()) return;
    void reloadVineyard().catch(() => {
      setVineyard(null);
    });
  }, [reloadVineyard]);

  useEffect(() => {
    if (!vineyard?.hasLogo) {
      setLogoUrl(null);
      return;
    }
    let cancelled = false;
    void fetchVineyardLogoBlob(vineyard.id)
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        setLogoUrl(url);
      })
      .catch(() => {
        if (!cancelled) setLogoUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [vineyard?.id, vineyard?.hasLogo]);

  useEffect(() => {
    return () => {
      if (logoUrl) URL.revokeObjectURL(logoUrl);
    };
  }, [logoUrl]);

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
    <div className="flex min-h-dvh flex-col md:h-dvh md:overflow-hidden">
      <header className="shrink-0 border-b border-border bg-card px-4 py-2 md:px-6 md:py-3">
        <div className="flex items-center justify-between gap-3">
          <Brand vineyard={vineyard} logoUrl={logoUrl} />
          <div className="flex shrink-0 items-center gap-2 md:hidden">
            {user ? (
              <p className="hidden text-right text-sm font-medium sm:block">
                {user.displayName}
              </p>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void onSignOut()}
            >
              Sign out
            </Button>
          </div>
        </div>
        <nav
          className="-mx-1 mt-3 flex gap-1 overflow-x-auto pb-1 md:hidden"
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

      <div className="flex min-h-0 flex-1 flex-col md:grid md:grid-cols-[16.5rem_1fr]">
        <aside className="hidden border-r border-border bg-card px-4 py-6 md:flex md:min-h-0 md:flex-col md:overflow-y-auto">
          <nav className="flex flex-1 flex-col gap-1" aria-label="Main">
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

        <main className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8 md:flex md:flex-col">
          <Outlet context={{ user, vineyard, reloadVineyard } satisfies AppOutletContext} />
        </main>
      </div>
    </div>
  );
}
