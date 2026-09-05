import { forgotPasswordSchema } from "@vineyard/shared";
import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, forgotPassword } from "@/lib/api";

const GENERIC_MESSAGE =
  "If that account exists, we sent a reset link.";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null);
  const submitting = status === "loading";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setDevResetUrl(null);
    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setStatus("error");
      setMessage(parsed.error.issues[0]?.message ?? "Enter a valid email");
      return;
    }
    setStatus("loading");
    try {
      const result = await forgotPassword(parsed.data.email);
      setStatus("sent");
      setMessage(GENERIC_MESSAGE);
      setDevResetUrl(result.devResetUrl ?? null);
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof ApiError ? error.message : "Could not send a reset link",
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
          title="Forgot password"
          description="Enter the email on your account. We will send a reset link if it exists."
        />
        <Card>
          <form onSubmit={(event) => void onSubmit(event)} className="space-y-4">
            <div>
              <Label htmlFor="forgot-email">Email</Label>
              <Input
                id="forgot-email"
                name="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                disabled={submitting}
              />
            </div>
            {status === "error" ? (
              <p className="text-sm font-medium text-health-red" role="alert">
                {message}
              </p>
            ) : null}
            {status === "sent" ? (
              <p className="text-sm font-medium" role="status">
                {GENERIC_MESSAGE}
              </p>
            ) : null}
            {devResetUrl ? (
              <p className="rounded-md border border-border bg-background px-3 py-2 text-sm">
                <span className="font-medium">Local only (no SMTP): </span>
                <a
                  className="font-medium text-primary underline-offset-4 hover:underline"
                  href={devResetUrl}
                >
                  Open reset link
                </a>
              </p>
            ) : null}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Sending…" : "Send reset link"}
            </Button>
          </form>
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
