import { USER_ROLES } from "@vineyard/shared";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";

const roleHelp: Record<(typeof USER_ROLES)[number], string> = {
  power_user: "Full setup, vineyard management, and user invites",
  manager: "Operate the vineyard and receive notifications",
  viewer: "Read-only health and suggested tasks",
};

export function SettingsPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Settings"
        description="Account, notification frequency, and who can change the vineyard. Auth is not wired yet."
      />
      <div className="grid gap-4 md:grid-cols-2">
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
