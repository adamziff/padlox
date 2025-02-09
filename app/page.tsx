import { login } from "./(auth)/actions";
import { NavBar } from "@/components/nav-bar";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      <NavBar />
      <main className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="max-w-2xl w-full mx-auto text-center space-y-8">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground">
            Your Digital Home Inventory Solution
          </h1>

          <p className="text-lg sm:text-xl text-muted-foreground mx-auto max-w-xl">
            Keep track of your valuable possessions with ease. Our home inventory app helps you document,
            organize, and protect your assets with a simple, future-proof solution.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="/auth/login"
              className="inline-flex h-11 items-center justify-center rounded-md bg-foreground px-8 text-base font-medium text-background transition-colors hover:bg-foreground/90"
            >
              Log In
            </a>
            <a
              href="/auth/register"
              className="inline-flex h-11 items-center justify-center rounded-md border border-foreground px-8 text-base font-medium transition-colors hover:bg-muted"
            >
              Register
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
