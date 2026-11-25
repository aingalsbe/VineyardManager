import { type FormEvent, useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, getCurrentUser, login } from "@/lib/api";

export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const passwordUpdated = params.get("reset") === "1";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");
  const [alreadySignedIn, setAlreadySignedIn] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void getCurrentUser(controller.signal)
      .then(() => {
        if (!controller.signal.aborted) setAlreadySignedIn(true);
      })
      .catch(() => {
        // Not signed in; stay on login form.
      });
    return () => controller.abort();
  }, []);

  if (alreadySignedIn) {
    return <Navigate to="/" replace />;
  }

  const submitting = status === "loading";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setMessage("");
    try {
      await login(email, password);
      navigate("/", { replace: true });
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof ApiError ? error.message : "Could not sign in",
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
          title="Sign in"
          description="Use your email and password to open the vineyard."
        />
        <Card>
          <form onSubmit={(event) => void onSubmit(event)} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                disabled={submitting}
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                disabled={submitting}
              />
            </div>
            {passwordUpdated ? (
              <p className="text-sm font-medium text-health-green" role="status">
                Password updated. Sign in with your new password.
              </p>
            ) : null}
            {status === "error" ? (
              <p className="text-sm font-medium text-health-red" role="alert">
                {message}
              </p>
            ) : null}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
            <p className="text-center text-sm">
              <Link
                to="/forgot-password"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Forgot password?
              </Link>
            </p>
          </form>
        </Card>
      </div>
    </div>
  );
}
