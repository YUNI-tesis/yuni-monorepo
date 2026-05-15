"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Button } from "@yuni/ui";
import { register } from "../../../lib/api-client";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") ?? "").trim();

    try {
      await register({
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? ""),
        ...(name ? { name } : {}),
      });
      router.push("/dashboard");
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "No pudimos crear la cuenta.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="shell">
      <section className="auth-panel">
        <p className="eyebrow">YUNI</p>
        <h1>Crear cuenta</h1>
        <form className="auth-form" onSubmit={onSubmit}>
          <label>
            Nombre
            <input name="name" type="text" autoComplete="name" />
          </label>
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="new-password" required minLength={8} />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Creando..." : "Crear cuenta"}
          </Button>
        </form>
        <p className="muted-link">
          Ya tenes cuenta? <Link href="/auth/login">Iniciar sesion</Link>
        </p>
      </section>
    </main>
  );
}
