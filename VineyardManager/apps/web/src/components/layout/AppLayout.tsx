import {
  CalendarCheck,
  ClipboardList,
  LayoutDashboard,
  Map,
  Settings2,
  SlidersHorizontal,
} from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/rows", label: "Rows", icon: Map },
  { to: "/tasks", label: "Tasks", icon: CalendarCheck },
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

export function AppLayout() {
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
        <nav className="flex flex-col gap-1" aria-label="Account">
          {secondaryNav.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
        </nav>
      </aside>

      <div className="flex min-h-screen flex-col">
        <header className="border-b border-border bg-card px-4 py-3 md:hidden">
          <p className="text-sm font-semibold tracking-wide text-primary uppercase">
            Vineyard Manager
          </p>
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
          <Outlet />
        </main>
      </div>
    </div>
  );
}
