import { resetPasswordSchema } from "@vineyard/shared";
import { type FormEvent, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, resetPassword } from "@/lib/api";

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = useMemo(() => params.get("token")?.trim() ?? "", [params]);
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");
  const submitting = status === "loading";
  const missingToken = token.length === 0;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (newPassword !== confirm) {
      setStatus("error");
      setMessage("Passwords do not match");
      return;
    }
    const parsed = resetPasswordSchema.safeParse({ token, newPassword });
    if (!parsed.success) {
      setStatus("error");
      setMessage(parsed.error.issues[0]?.message ?? "Check the form");
      return;
    }
    setStatus("loading");
    try {
      await resetPassword(parsed.data);
      navigate("/login?reset=1", { replace: true });
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof ApiError
          ? error.message
          : "Could not reset the password",
      );
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <p className="mb-4 text-sm font-semibold tracking-wide text-primary uppercase">
          Vineyard Manager
        </p>
        <PageHeader
          title="Set a new password"
          description="Choose a password of at least 10 characters, then sign in."
        />
        <Card>
          {missingToken ? (
            <InvalidResetNotice />
          ) : (
            <form onSubmit={(event) => void onSubmit(event)} className="space-y-4">
              <div>
                <Label htmlFor="reset-password">New password</Label>
                <Input
                  id="reset-password"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  disabled={submitting}
                  required
                />
              </div>
              <div>
                <Label htmlFor="reset-confirm">Confirm password</Label>
                <Input
                  id="reset-confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  disabled={submitting}
                  required
                />
              </div>
              {status === "error" ? (
                <div>
                  <p className="text-sm font-medium text-health-red" role="alert">
                    {message}
                  </p>
                  {message.toLowerCase().includes("invalid") ||
                  message.toLowerCase().includes("expired") ? (
                    <p className="mt-2 text-sm">
                      <Link
                        to="/forgot-password"
                        className="font-medium text-primary underline-offset-4 hover:underline"
                      >
                        Request a new reset link
                      </Link>
                    </p>
                  ) : null}
                </div>
              ) : null}
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Saving…" : "Update password"}
              </Button>
            </form>
          )}
        </Card>
        <p className="mt-4 text-sm">
          <Link
            to="/login"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

function InvalidResetNotice() {
  return (
    <div className="space-y-3">
      <p className="text-base">
        This reset link is missing or invalid. Request a new one.
      </p>
      <Button asChild>
        <Link to="/forgot-password">Forgot password</Link>
      </Button>
    </div>
  );
}
