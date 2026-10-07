import {
  BarChart3,
  CalendarCheck,
  ClipboardList,
  Grape,
  LayoutDashboard,
  Map,
  Menu,
  Settings2,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  Link,
  NavLink,
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
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
  reloadUser: (options?: { silent?: boolean }) => Promise<void>;
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
          "flex min-h-11 items-center gap-3 rounded-md px-3 text-base font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card",
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
    <Link
      to="/"
      className="flex min-h-11 min-w-0 items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      aria-label={`${vineyard?.name ?? "Vineyard Manager"}, go to dashboard`}
    >
      {logoUrl ? (
        <img
          src={logoUrl}
          alt=""
          className="h-12 max-w-[11rem] object-contain object-left sm:max-w-[16rem] md:h-16 md:max-w-[22rem]"
        />
      ) : (
        <span className="flex min-w-0 items-center gap-2">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Grape className="size-5" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-base font-semibold leading-tight text-foreground">
              {vineyard?.name ?? "Vineyard Manager"}
            </span>
            {vineyard?.name ? (
              <span className="block text-xs font-medium tracking-wide text-muted uppercase">
                Vineyard Manager
              </span>
            ) : null}
          </span>
        </span>
      )}
    </Link>
  );
}

export function AppLayout() {
  const navigate = useNavigate();
  const { state, reload } = useCurrentUser();
  const user = state.status === "ready" ? state.user : null;
  const [vineyard, setVineyard] = useState<Vineyard | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  // Close the drawer whenever the route changes.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  // Drawer: focus first link, trap Tab, Escape closes, focus returns to toggle.
  useEffect(() => {
    if (!drawerOpen) return;
    const panel = drawerRef.current;
    panel?.querySelector<HTMLElement>("a, button")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setDrawerOpen(false);
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const focusable = panel.querySelectorAll<HTMLElement>(
        "a[href], button:not([disabled])",
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    const toggle = toggleRef.current;
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      toggle?.focus();
    };
  }, [drawerOpen]);

  // If the viewport grows to the pinned (lg) layout, drop the drawer state.
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const onChange = () => {
      if (media.matches) setDrawerOpen(false);
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

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

  const navContent = (
    <>
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
    </>
  );

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh lg:overflow-hidden">
      <header className="sticky top-0 z-20 shrink-0 border-b border-border bg-card px-3 py-2 sm:px-4 lg:static lg:px-6 lg:py-3">
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            ref={toggleRef}
            type="button"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 lg:hidden"
            aria-label={drawerOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={drawerOpen}
            aria-controls={drawerId}
            onClick={() => setDrawerOpen((value) => !value)}
          >
            <Menu className="size-6" aria-hidden />
          </button>
          <div className="min-w-0 flex-1">
            <Brand vineyard={vineyard} logoUrl={logoUrl} />
          </div>
          {user ? (
            <p className="hidden shrink-0 text-right text-sm sm:block lg:hidden">
              <span className="block font-medium">{user.displayName}</span>
              <span className="block text-xs text-muted capitalize">
                {formatRole(user.role)}
              </span>
            </p>
          ) : null}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[16.5rem_1fr]">
        {/* Pinned sidebar on wide screens (lg+). */}
        <aside className="hidden border-r border-border bg-card px-4 py-6 lg:flex lg:min-h-0 lg:flex-col lg:overflow-y-auto">
          {navContent}
        </aside>

        {/* Slide-out drawer below lg. */}
        <div
          className={cn(
            "fixed inset-0 z-50 lg:hidden",
            drawerOpen ? "" : "pointer-events-none",
          )}
          aria-hidden={drawerOpen ? undefined : true}
        >
          <button
            type="button"
            tabIndex={-1}
            aria-label="Close navigation"
            className={cn(
              "absolute inset-0 bg-foreground/40 transition-opacity duration-200 motion-reduce:transition-none",
              drawerOpen ? "opacity-100" : "opacity-0",
            )}
            onClick={() => setDrawerOpen(false)}
          />
          <div
            ref={drawerRef}
            id={drawerId}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            inert={!drawerOpen}
            className={cn(
              "absolute inset-y-0 left-0 flex w-[min(20rem,86vw)] flex-col overflow-y-auto border-r border-border bg-card px-4 pt-3 pb-6 shadow-xl transition-transform duration-200 motion-reduce:transition-none",
              drawerOpen ? "translate-x-0" : "-translate-x-full",
            )}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold tracking-wide text-primary uppercase">
                Menu
              </span>
              <button
                type="button"
                className="inline-flex size-11 items-center justify-center rounded-md text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label="Close navigation"
                onClick={() => setDrawerOpen(false)}
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>
            {navContent}
          </div>
        </div>

        <main className="min-h-0 flex-1 px-4 py-6 sm:px-8 lg:flex lg:flex-col lg:overflow-y-auto">
          <Outlet
            context={
              {
                user,
                vineyard,
                reloadVineyard,
                reloadUser: reload,
              } satisfies AppOutletContext
            }
          />
        </main>
      </div>
    </div>
  );
}
