"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, FormField, Input, PageHeader, PageShell, useToast } from "@yuni/ui";
import { login } from "../../../lib/api/auth-api";

type FormSubmitEvent = {
  preventDefault: () => void;
  currentTarget: HTMLFormElement;
};

export default function LoginPage() {
  const router = useRouter();
  const toast = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormSubmitEvent) {
    event.preventDefault();
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);

    try {
      await login({
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? ""),
      });
      toast.success("Ya podés continuar a tu espacio.", {
        title: "Sesión iniciada",
        dedupeKey: "auth:login:success",
      });
      router.push("/dashboard");
      router.refresh();
    } catch (caughtError) {
      toast.error(
        caughtError instanceof Error ? caughtError.message : "Revisá tus datos e intentá nuevamente.",
        {
          title: "No pudimos iniciar sesión",
          dedupeKey: "auth:login:error",
        }
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <PageShell centered maxWidth="460px">
      <Card padding="lg">
        <PageHeader eyebrow="YUNI" title="Iniciar Sesión" />
        <form className="yuni-stack" onSubmit={onSubmit}>
          <FormField label="Email" htmlFor="email">
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="example@gmail.com"
              autoComplete="email"
              required
            />
          </FormField>
          <FormField label="Password" htmlFor="password">
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              minLength={8}
            />
          </FormField>
          <Button type="submit" loading={isSubmitting}>
            Entrar
          </Button>
        </form>
        <p className="app-link-row">
          Todavia no tenes cuenta? <Link href="/auth/register">Crear cuenta</Link>
        </p>
      </Card>
    </PageShell>
  );
}
