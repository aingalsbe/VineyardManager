import {
  USER_ROLE_LABELS,
  USER_ROLES,
  inviteUserSchema,
  type PublicUser,
  type UserRole,
} from "@vineyard/shared";
import { useEffect, useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useVineyardUsers } from "@/hooks/useVineyardUsers";
import {
  ApiError,
  inviteVineyardUser,
  removeVineyardUser,
  updateVineyardUser,
} from "@/lib/api";

const selectClassName =
  "h-11 w-full rounded-md border border-border bg-card px-3 text-base";

export function PeopleCard({
  vineyardId,
  ownerId,
  currentUserId,
}: {
  vineyardId: string;
  ownerId: string;
  currentUserId: string;
}) {
  const { state, reload } = useVineyardUsers(vineyardId);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [roleDrafts, setRoleDrafts] = useState<Record<string, UserRole>>({});

  const users = state.status === "ready" ? state.users : [];

  async function saveRole(user: PublicUser) {
    const role = roleDrafts[user.id] ?? user.role;
    if (role === user.role) return;
    setPendingId(user.id);
    setError(null);
    try {
      await updateVineyardUser(vineyardId, user.id, { role });
      await reload({ silent: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not change role");
    } finally {
      setPendingId(null);
    }
  }

  async function setDisabled(user: PublicUser, disabled: boolean) {
    setPendingId(user.id);
    setError(null);
    try {
      await updateVineyardUser(vineyardId, user.id, { disabled });
      await reload({ silent: true });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : disabled
            ? "Could not disable this person"
            : "Could not enable this person",
      );
    } finally {
      setPendingId(null);
    }
  }

  async function removePerson(user: PublicUser) {
    const confirmed = window.confirm(
      `Remove ${user.displayName} from this vineyard? They will not be able to sign in.`,
    );
    if (!confirmed) return;
    setPendingId(user.id);
    setError(null);
    try {
      await removeVineyardUser(vineyardId, user.id);
      await reload({ silent: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not remove this person");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-primary">People</p>
          <CardTitle className="mt-1">Who can sign in</CardTitle>
          <CardDescription>
            Invite managers and viewers. The temporary password is shown once —
            we do not email it yet.
          </CardDescription>
        </div>
        <Button type="button" onClick={() => setInviteOpen(true)}>
          Invite person
        </Button>
      </div>

      {state.status === "loading" ? (
        <p className="mt-4 text-muted">Loading people…</p>
      ) : null}

      {state.status === "error" ? (
        <div className="mt-4">
          <p className="text-sm font-medium text-health-red" role="alert">
            {state.message}
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-2"
            onClick={() => void reload()}
          >
            Try again
          </Button>
        </div>
      ) : null}

      {state.status === "ready" ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-left text-base">
            <thead>
              <tr className="border-b border-border text-sm text-muted">
                <th className="py-2 pr-3 font-medium">Name</th>
                <th className="py-2 pr-3 font-medium">Email</th>
                <th className="py-2 pr-3 font-medium">Role</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const isSelf = user.id === currentUserId;
                const isOwner = user.id === ownerId;
                const canManage = !isSelf && !isOwner;
                const busy = pendingId === user.id;
                const draftRole = roleDrafts[user.id] ?? user.role;
                return (
                  <tr key={user.id} className="border-b border-border/70 align-top">
                    <td className="py-3 pr-3">
                      <span className="font-medium">{user.displayName}</span>
                      {isOwner ? (
                        <Badge className="ml-2" variant="default">
                          Owner
                        </Badge>
                      ) : null}
                    </td>
                    <td className="py-3 pr-3">{user.email}</td>
                    <td className="py-3 pr-3">
                      {canManage ? (
                        <div className="flex min-w-44 flex-col gap-2 sm:flex-row sm:items-center">
                          <select
                            className={selectClassName}
                            aria-label={`Role for ${user.displayName}`}
                            value={draftRole}
                            disabled={busy}
                            onChange={(event) =>
                              setRoleDrafts((current) => ({
                                ...current,
                                [user.id]: event.target.value as UserRole,
                              }))
                            }
                          >
                            {USER_ROLES.map((role) => (
                              <option key={role} value={role}>
                                {USER_ROLE_LABELS[role]}
                              </option>
                            ))}
                          </select>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy || draftRole === user.role}
                            onClick={() => void saveRole(user)}
                          >
                            Save
                          </Button>
                        </div>
                      ) : (
                        <span>{USER_ROLE_LABELS[user.role]}</span>
                      )}
                    </td>
                    <td className="py-3 pr-3">
                      {user.disabledAt ? (
                        <Badge variant="red">Disabled</Badge>
                      ) : (
                        <Badge variant="green">Active</Badge>
                      )}
                    </td>
                    <td className="py-3">
                      {canManage ? (
                        <div className="flex flex-wrap gap-2">
                          {user.disabledAt ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => void setDisabled(user, false)}
                            >
                              Enable
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => void setDisabled(user, true)}
                            >
                              Disable
                            </Button>
                          )}
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => void removePerson(user)}
                          >
                            Remove
                          </Button>
                        </div>
                      ) : (
                        <p className="text-sm text-muted">
                          {isOwner
                            ? "The vineyard owner cannot be disabled, demoted, or removed."
                            : "You cannot change your own role or access."}
                        </p>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 text-sm font-medium text-health-red" role="alert">
          {error}
        </p>
      ) : null}

      <InvitePersonDialog
        vineyardId={vineyardId}
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvited={async () => {
          await reload({ silent: true });
        }}
      />
    </Card>
  );
}

function InvitePersonDialog({
  vineyardId,
  open,
  onClose,
  onInvited,
}: {
  vineyardId: string;
  open: boolean;
  onClose: () => void;
  onInvited: () => Promise<void> | void;
}) {
  const titleId = useId();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<UserRole>("manager");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{
    displayName: string;
    email: string;
    temporaryPassword: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEmail("");
    setDisplayName("");
    setRole("manager");
    setFieldErrors({});
    setFormError(null);
    setSaving(false);
    setResult(null);
    setCopied(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, saving, onClose]);

  if (!open) return null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const parsed = inviteUserSchema.safeParse({ email, displayName, role });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === "string" && !next[key]) next[key] = issue.message;
      }
      setFieldErrors(next);
      return;
    }
    setFieldErrors({});
    setSaving(true);
    try {
      const invited = await inviteVineyardUser(vineyardId, parsed.data);
      setResult({
        displayName: invited.user.displayName,
        email: invited.user.email,
        temporaryPassword: invited.temporaryPassword,
      });
      await onInvited();
    } catch (error) {
      setFormError(
        error instanceof ApiError ? error.message : "Could not invite this person",
      );
    } finally {
      setSaving(false);
    }
  }

  async function copyPassword() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.temporaryPassword);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-foreground/40 px-4 py-8"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-lg"
      >
        {result ? (
          <>
            <h2 id={titleId} className="text-2xl font-semibold tracking-tight">
              Invite created
            </h2>
            <p className="mt-1 text-muted">
              {result.displayName} ({result.email}) can sign in at /login. This
              password is shown once — closing this dialog loses it.
            </p>
            <div className="mt-6">
              <Label htmlFor="temp-password">Temporary password</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  id="temp-password"
                  readOnly
                  value={result.temporaryPassword}
                  className="font-mono"
                />
                <Button type="button" variant="outline" onClick={() => void copyPassword()}>
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <Button type="button" onClick={onClose}>
                Done
              </Button>
            </div>
          </>
        ) : (
          <>
            <h2 id={titleId} className="text-2xl font-semibold tracking-tight">
              Invite person
            </h2>
            <p className="mt-1 text-muted">
              They get a temporary password. We do not send email yet.
            </p>
            <form className="mt-6 space-y-4" onSubmit={(event) => void handleSubmit(event)}>
              <div>
                <Label htmlFor="invite-name">Display name</Label>
                <Input
                  id="invite-name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  autoComplete="name"
                  disabled={saving}
                />
                {fieldErrors.displayName ? (
                  <p className="mt-1 text-sm text-health-red" role="alert">
                    {fieldErrors.displayName}
                  </p>
                ) : null}
              </div>
              <div>
                <Label htmlFor="invite-email">Email</Label>
                <Input
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  disabled={saving}
                />
                {fieldErrors.email ? (
                  <p className="mt-1 text-sm text-health-red" role="alert">
                    {fieldErrors.email}
                  </p>
                ) : null}
              </div>
              <div>
                <Label htmlFor="invite-role">Role</Label>
                <select
                  id="invite-role"
                  className={selectClassName}
                  value={role}
                  disabled={saving}
                  onChange={(event) => setRole(event.target.value as UserRole)}
                >
                  {USER_ROLES.map((item) => (
                    <option key={item} value={item}>
                      {USER_ROLE_LABELS[item]}
                    </option>
                  ))}
                </select>
                {fieldErrors.role ? (
                  <p className="mt-1 text-sm text-health-red" role="alert">
                    {fieldErrors.role}
                  </p>
                ) : null}
              </div>
              {formError ? (
                <p className="text-sm font-medium text-health-red" role="alert">
                  {formError}
                </p>
              ) : null}
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? "Inviting…" : "Invite"}
                </Button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
