import Link from "next/link";
import { Button } from "@/components/common";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-helpers";

export default async function Home() {
  const user = await getCurrentUser();
  
  // If user is authenticated, redirect to agents page
  if (user) {
    redirect("/agents");
  }

  // If not authenticated, redirect to login
  redirect("/auth/login");
}