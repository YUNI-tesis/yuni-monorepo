import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
      <main className="flex min-h-screen w-full max-w-4xl flex-col items-center justify-center py-16 px-8">
        <h1 className="text-4xl font-bold mb-4">Yuni AI</h1>
        <p className="text-lg text-gray-600 dark:text-gray-400 mb-8 text-center">
          Plataforma multi-agente para crear, gestionar y chatear con múltiples agentes de IA.
        </p>
        <Link
          href="/agents"
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Ver Agentes
        </Link>
      </main>
    </div>
  );
}
