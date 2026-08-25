import { USER_ROLES, type PublicUser } from "@vineyard/shared";
import { useOutletContext } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";

const roleHelp: Record<(typeof USER_ROLES)[number], string> = {
  power_user: "Full setup, vineyard management, and user invites",
  manager: "Operate the vineyard and receive notifications",
  viewer: "Read-only health and suggested tasks",
};

type AppOutletContext = {
  user: PublicUser | null;
};

export function SettingsPage() {
  const { user } = useOutletContext<AppOutletContext>();

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Settings"
        description="Account, notification frequency, and who can change the vineyard."
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardTitle>Signed in as</CardTitle>
          {user ? (
            <dl className="mt-3 space-y-2 text-base">
              <div>
                <dt className="text-sm text-muted">Name</dt>
                <dd className="font-medium">{user.displayName}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted">Email</dt>
                <dd className="font-medium">{user.email}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted">Role</dt>
                <dd className="font-medium capitalize">
                  {user.role.replaceAll("_", " ")}
                </dd>
              </div>
            </dl>
          ) : (
            <CardDescription>Loading account…</CardDescription>
          )}
        </Card>
        <Card>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>
            Weekly growing-season summaries, weather alerts, and task reminders.
            Frequency will come from user notification prefs.
          </CardDescription>
        </Card>
        <Card>
          <CardTitle>Roles</CardTitle>
          <ul className="mt-3 space-y-2">
            {USER_ROLES.map((role) => (
              <li key={role}>
                <p className="font-medium">{role.replace("_", " ")}</p>
                <p className="text-sm text-muted">{roleHelp[role]}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
