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
      <main className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8">
        <div className="max-w-4xl w-full mx-auto space-y-12 py-12">
          {/* Hero Section */}
          <div className="text-center space-y-6">
            <div className="flex items-center justify-center gap-3 mb-8">
              <Image src="/lock.svg" alt="Padlox logo" width={48} height={48} className="dark:invert" priority />
              <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground">
                Padlox
              </h1>
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground max-w-2xl mx-auto">
              Your Insurance Company Doesn&apos;t Trust You
            </h2>
            <p className="text-xl sm:text-2xl text-muted-foreground font-medium">
              We can help with that
            </p>
          </div>

          {/* Main Content */}
          <div className="space-y-8 px-4">
            <div className="prose dark:prose-invert max-w-none">
              <p className="text-lg sm:text-xl leading-relaxed">
                Home and Renter&apos;s Insurance claims are changing. With AI image and video tools, it&apos;s never been easier to fake what you own.
              </p>

              <p className="text-lg sm:text-xl leading-relaxed">
                Padlox can help. It&apos;s a home inventory app that verifiably signs each image you create using tools from the{' '}
                <Link
                  href="https://contentauthenticity.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:text-primary/90 underline underline-offset-4"
                >
                  Adobe Content Authenticity Initiative
                </Link>
                . It also makes building a home inventory easier with video capture, automatic object recognition, and value estimation.
              </p>

              <p className="text-lg sm:text-xl leading-relaxed">
                We hope you&apos;ll never need your Padlox inventory, and that your home and its belongings are always safe. But when there&apos;s a disaster and you have to file a claim, you need a solution your insurance company can trust and respect.
              </p>
            </div>

            {/* CTA Section */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-6">
              {isLoggedIn ? (
                <Link
                  href="/dashboard"
                  className="w-full sm:w-auto inline-flex h-12 items-center justify-center rounded-md bg-primary px-8 text-base font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Go to Dashboard
                </Link>
              ) : (
                <Link
                  href="/login"
                  className="w-full sm:w-auto inline-flex h-12 items-center justify-center rounded-md bg-primary px-8 text-base font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Sign Up Now
                </Link>
              )}
              <a
                href="mailto:adam@padlox.io"
                className="w-full sm:w-auto inline-flex h-12 items-center justify-center rounded-md border border-input bg-background px-8 text-base font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                Contact Us
              </a>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
