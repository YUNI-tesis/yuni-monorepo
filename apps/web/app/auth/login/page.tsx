"use client";

import { useState, useEffect, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { AuthBar } from "@/components/AuthBar";
import { Button, TextField, Card } from "@/components/common";

export const dynamic = "force-dynamic";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (searchParams.get("registered") === "true") {
      setSuccess(true);
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError(result.error);
      } else {
        router.push("/agents");
        router.refresh();
      }
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AuthBar />
      <div className="flex flex-1 items-center justify-center px-4 pt-20">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <Logo size="lg" className="justify-center mb-4" />
            <h2 className="mt-6 text-center text-2xl font-semibold text-foreground">
            Sign in to your account
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter your credentials to access YUNI
          </p>
        </div>
        <Card variant="bordered" padding="lg">
          <form className="space-y-6" onSubmit={handleSubmit}>
            {success && (
              <div className="bg-green-500/20 border border-green-500/50 text-success-theme px-4 py-3 rounded-lg text-sm" role="status">
                Account created successfully! Please sign in.
              </div>
            )}
            {error && (
              <div className="bg-red-500/20 border border-red-500/50 text-error-theme px-4 py-3 rounded-lg text-sm" role="alert">
                {error}
              </div>
            )}
            <div className="space-y-4">
              <TextField
                label="Email address"
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
              <TextField
                label="Password"
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            <div>
              <Button
                type="submit"
                variant="primary"
                size="lg"
                isLoading={loading}
                className="w-full"
              >
                {loading ? "Signing in..." : "Sign in"}
              </Button>
            </div>

            <div className="text-center">
              <p className="text-sm text-muted-foreground">
                Don't have an account?{" "}
                <Link href="/auth/register" className="font-medium text-accent-theme hover:opacity-80 transition-colors">
                  Sign up
                </Link>
              </p>
            </div>
          </form>
        </Card>
      </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <Logo size="lg" className="justify-center mb-4" />
            <h2 className="mt-6 text-center text-2xl font-semibold text-foreground">
              Sign in to your account
            </h2>
          </div>
          <Card variant="bordered" padding="lg">
            <div className="text-center text-muted-foreground">Cargando...</div>
          </Card>
        </div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
