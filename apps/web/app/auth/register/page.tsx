"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, FormField, Input, PageHeader, PageShell } from "@yuni/ui";
import { register } from "../../../lib/api/auth-api";

type FormSubmitEvent = {
  preventDefault: () => void;
  currentTarget: HTMLFormElement;
};

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormSubmitEvent) {
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
    <PageShell centered maxWidth="460px">
      <Card padding="lg">
        <PageHeader eyebrow="YUNI" title="Crear cuenta" />
        <form className="yuni-stack" onSubmit={onSubmit}>
          <FormField label="Nombre" htmlFor="name" hint="Opcional. Lo usamos para personalizar tu espacio.">
            <Input id="name" name="name" type="text" autoComplete="name" />
          </FormField>
          <FormField label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </FormField>
          <FormField label="Password" htmlFor="password" hint="Minimo 8 caracteres.">
            <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
          </FormField>
          {error ? <p className="yuni-form-field__error">{error}</p> : null}
          <Button type="submit" loading={isSubmitting}>
            Crear cuenta
          </Button>
        </form>
        <p className="app-link-row">
          Ya tenes cuenta? <Link href="/auth/login">Iniciar sesion</Link>
        </p>
      </Card>
    </PageShell>
  );
}
