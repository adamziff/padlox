import { NavBar } from "@/components/nav-bar";
import Image from "next/image";
import { createClient } from '@/utils/supabase/server';
import Link from 'next/link';

export default async function Home() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const isLoggedIn = !!session;

  return (
    <div className="min-h-screen flex flex-col">
      <NavBar />
      <main className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="max-w-2xl w-full mx-auto text-center space-y-8">
          <div className="flex items-center justify-center gap-3">
            <Image src="/lock.svg" alt="Padlox logo" width={40} height={40} className="dark:invert" priority />
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground">
              Padlox
            </h1>
          </div>

          <p className="text-lg sm:text-xl text-muted-foreground mx-auto max-w-xl">
            Keep track of your valuable possessions with ease. Our home inventory app helps you document,
            organize, and protect your assets with a simple, future-proof solution.
          </p>

          <div className="flex justify-center">
            {isLoggedIn ? (
              <Link
                href="/dashboard"
                className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-8 text-base font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                My Dashboard
              </Link>
            ) : (
              <Link
                href="/login"
                className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-8 text-base font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Log In
              </Link>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
