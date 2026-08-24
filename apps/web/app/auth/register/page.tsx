"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, FormField, Input, PageHeader, PageShell, useToast } from "@yuni/ui";
import { register } from "../../../lib/api/auth-api";

type FormSubmitEvent = {
  preventDefault: () => void;
  currentTarget: HTMLFormElement;
};

export default function RegisterPage() {
  const router = useRouter();
  const toast = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormSubmitEvent) {
    event.preventDefault();
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") ?? "").trim();

    try {
      await register({
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? ""),
        ...(name ? { name } : {}),
      });
      toast.success("Tu cuenta está lista para usar.", {
        title: "Cuenta creada",
        dedupeKey: "auth:register:success",
      });
      router.push("/dashboard");
      router.refresh();
    } catch (caughtError) {
      toast.error(
        caughtError instanceof Error ? caughtError.message : "Revisá tus datos e intentá nuevamente.",
        {
          title: "No pudimos crear la cuenta",
          dedupeKey: "auth:register:error",
        }
      );
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
            <Input id="name" name="name" type="text" autoComplete="name" placeholder="Juan Martinez" />
          </FormField>
          <FormField label="Email" htmlFor="email">
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="example@gmail.com"
              required
            />
          </FormField>
          <FormField label="Password" htmlFor="password" hint="Minimo 8 caracteres.">
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
            />
          </FormField>
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
