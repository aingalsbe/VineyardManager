import { USER_ROLE_LABELS, USER_ROLES, updateMeSchema } from "@vineyard/shared";
import { useEffect, useState, type FormEvent } from "react";
import { useOutletContext } from "react-router-dom";
import type { AppOutletContext } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, changePassword, updateCurrentUser } from "@/lib/api";

const roleHelp: Record<(typeof USER_ROLES)[number], string> = {
  power_user: "Full setup, vineyard management, and user invites",
  manager: "Operate the vineyard and receive notifications",
  viewer: "Read-only health and suggested tasks",
};

export function SettingsPage() {
  const { user, reloadUser } = useOutletContext<AppOutletContext>();

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Settings"
        description="Account, notification frequency, and who can change the vineyard."
      />
      <div className="grid gap-4 md:grid-cols-2">
        <AccountCard user={user} onSaved={() => reloadUser({ silent: true })} />
        <ChangePasswordCard />
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
                <p className="font-medium">{USER_ROLE_LABELS[role]}</p>
                <p className="text-sm text-muted">{roleHelp[role]}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function AccountCard({
  user,
  onSaved,
}: {
  user: AppOutletContext["user"];
  onSaved: () => Promise<void> | void;
}) {
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDisplayName(user?.displayName ?? "");
    setEmail(user?.email ?? "");
  }, [user?.displayName, user?.email]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    const parsed = updateMeSchema.safeParse({ displayName, email });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the form");
      return;
    }
    setSaving(true);
    try {
      await updateCurrentUser(parsed.data);
      await onSaved();
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save account");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardTitle>Your account</CardTitle>
      <CardDescription>Name and email used to sign in.</CardDescription>
      {user ? (
        <form className="mt-4 space-y-4" onSubmit={(event) => void onSubmit(event)}>
          <div>
            <Label htmlFor="settings-name">Display name</Label>
            <Input
              id="settings-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              autoComplete="name"
              disabled={saving}
            />
          </div>
          <div>
            <Label htmlFor="settings-email">Email</Label>
            <Input
              id="settings-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              disabled={saving}
            />
          </div>
          <div>
            <p className="text-sm text-muted">Role</p>
            <p className="font-medium">{USER_ROLE_LABELS[user.role]}</p>
          </div>
          {error ? (
            <p className="text-sm font-medium text-health-red" role="alert">
              {error}
            </p>
          ) : null}
          {saved ? (
            <p className="text-sm font-medium text-health-green" role="status">
              Account saved.
            </p>
          ) : null}
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </form>
      ) : (
        <CardDescription>Loading account…</CardDescription>
      )}
    </Card>
  );
}

function ChangePasswordCard() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    if (newPassword !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (newPassword.length < 10) {
      setError("Password must be at least 10 characters");
      return;
    }
    setSaving(true);
    try {
      await changePassword({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
      setSaved(true);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not change password",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardTitle>Change password</CardTitle>
      <CardDescription>
        Enter your current password, then a new one (at least 10 characters).
      </CardDescription>
      <form className="mt-4 space-y-4" onSubmit={(event) => void onSubmit(event)}>
        <div>
          <Label htmlFor="settings-current-password">Current password</Label>
          <Input
            id="settings-current-password"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            disabled={saving}
          />
        </div>
        <div>
          <Label htmlFor="settings-new-password">New password</Label>
          <Input
            id="settings-new-password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            disabled={saving}
          />
        </div>
        <div>
          <Label htmlFor="settings-confirm-password">Confirm new password</Label>
          <Input
            id="settings-confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            disabled={saving}
          />
        </div>
        {error ? (
          <p className="text-sm font-medium text-health-red" role="alert">
            {error}
          </p>
        ) : null}
        {saved ? (
          <p className="text-sm font-medium text-health-green" role="status">
            Password updated.
          </p>
        ) : null}
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Change password"}
        </Button>
      </form>
    </Card>
  );
}
