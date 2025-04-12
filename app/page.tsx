import { NavBar } from "@/components/nav-bar";
import { createClient } from '@/utils/supabase/server';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle, BarChart, Layers } from 'lucide-react'; // Example icons

export default async function Home() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const isLoggedIn = !!session;

  return (
    <div className="flex flex-col min-h-screen">
      <NavBar />
      <main className="flex-1">
        {/* Hero Section */}
        <section className="w-full py-20 md:py-32 lg:py-40 xl:py-48 bg-gradient-to-b from-background to-secondary/30">
          <div className="container mx-auto px-4 md:px-6">
            <div className="flex flex-col items-center gap-6 text-center lg:text-left lg:items-start lg:gap-12">
              <div className="flex flex-col justify-center space-y-4">
                <div className="space-y-2">
                  <h1 className="text-4xl font-bold tracking-tighter sm:text-5xl xl:text-6xl/none bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
                    Close the Coverage Gap
                  </h1>
                  <p className="max-w-[700px] text-muted-foreground md:text-xl">
                    Padlox offers the industry&apos;s best video capture experience for home inventories, identifying coverage gaps and helping accelerate legitimate claims through comprehensive documentation.
                  </p>
                </div>
                <div className="flex flex-col gap-2 min-[400px]:flex-row justify-center lg:justify-start">
                  <Button size="lg" asChild>
                    <a href="mailto:adam@padlox.io">
                      Request a Demo <ArrowRight className="ml-2 h-5 w-5" />
                    </a>
                  </Button>
                  {isLoggedIn && (
                    <Button variant="outline" size="lg" asChild>
                      <Link href="/dashboard">Go to Dashboard</Link>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Problem/Solution Section */}
        <section className="w-full py-12 md:py-24 lg:py-32 bg-background">
          <div className="container mx-auto px-4 md:px-6">
            <div className="flex flex-col items-center justify-center space-y-4 text-center">
              <div className="space-y-2">
                <div className="inline-block rounded-lg bg-secondary px-3 py-1 text-sm">The Challenge</div>
                <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl">
                  Inaccurate Valuations & Slow Claims Processes
                </h2>
                <p className="max-w-[900px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
                  Manual inventories are tedious and often miss valuable items, leading to underinsurance for HNW clients. Incomplete documentation slows down the claims process for everyone.
                </p>
              </div>
            </div>
            <div className="mx-auto grid max-w-4xl items-start gap-8 py-12 sm:grid-cols-1 md:gap-12">
              <div className="flex flex-col justify-center space-y-4">
                <ul className="grid gap-6 md:grid-cols-3">
                  <li>
                    <div className="grid gap-1 text-center md:text-left">
                      <h3 className="text-xl font-bold flex items-center justify-center md:justify-start"><ArrowRight className="mr-2 h-5 w-5 text-primary" />Effortless AI Capture</h3>
                      <p className="text-muted-foreground">
                        Our AI-powered video analysis makes creating comprehensive home inventories fast and easy for policyholders, improving data quality.
                      </p>
                    </div>
                  </li>
                  <li>
                    <div className="grid gap-1 text-center md:text-left">
                      <h3 className="text-xl font-bold flex items-center justify-center md:justify-start"><Layers className="mr-2 h-5 w-5 text-primary" />Identify Value Gaps</h3>
                      <p className="text-muted-foreground">
                        Automatically flag high-value, unscheduled items (collections, art, electronics) to ensure appropriate HNW coverage and unlock premium opportunities.
                      </p>
                    </div>
                  </li>
                  <li>
                    <div className="grid gap-1 text-center md:text-left">
                      <h3 className="text-xl font-bold flex items-center justify-center md:justify-start"><CheckCircle className="mr-2 h-5 w-5 text-primary" />Expedite Claims</h3>
                      <p className="text-muted-foreground">
                        Provide adjusters with comprehensive, AI-generated inventory reports, speeding up the validation of legitimate claims through better data.
                      </p>
                    </div>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Features/Benefits Section */}
        <section className="w-full py-12 md:py-24 lg:py-32 bg-secondary/50">
          <div className="container mx-auto grid items-center gap-6 px-4 md:px-6 lg:grid-cols-2 lg:gap-10">
            <div className="space-y-4">
              <div className="inline-block rounded-lg bg-secondary px-3 py-1 text-sm">Key Benefits</div>
              <h2 className="text-3xl font-bold tracking-tighter md:text-4xl/tight">
                Improve Policyholder Experience & Underwriting Precision
              </h2>
              <p className="max-w-[600px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
                Padlox combines the best capture technology with verifiable data to increase premium accuracy, accelerate payouts, and reduce operational overhead.
              </p>
            </div>
            <div className="flex space-x-4">
              <div className="grid gap-4">
                <div className="flex items-start gap-3">
                  <ArrowRight className="mt-1 h-6 w-6 flex-shrink-0 text-primary" />
                  <div>
                    <h3 className="font-semibold">Best-in-Class Capture</h3>
                    <p className="text-sm text-muted-foreground">AI video analysis provides a fast, comprehensive, and user-friendly inventory experience.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <BarChart className="mt-1 h-6 w-6 flex-shrink-0 text-primary" />
                  <div>
                    <h3 className="font-semibold">Unlock Premium Opportunities</h3>
                    <p className="text-sm text-muted-foreground">Identify HNW coverage gaps for appropriate upselling and premium adjustments.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="mt-1 h-6 w-6 flex-shrink-0 text-primary" />
                  <div>
                    <h3 className="font-semibold">Accelerate Claim Payouts</h3>
                    <p className="text-sm text-muted-foreground">Provide comprehensive inventory reports to fast-track validation for legitimate claims.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Layers className="mt-1 h-6 w-6 flex-shrink-0 text-primary" />
                  <div>
                    <h3 className="font-semibold">White-Label Ready</h3>
                    <p className="text-sm text-muted-foreground">Integrate Padlox features seamlessly into your existing insurer apps.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works Section (Icons Updated) */}
        <section className="w-full py-12 md:py-24 lg:py-32">
          <div className="container mx-auto px-4 md:px-6">
            <div className="flex flex-col items-center justify-center space-y-4 text-center mb-12">
              <div className="space-y-2">
                <div className="inline-block rounded-lg bg-secondary px-3 py-1 text-sm">Process</div>
                <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl">Simple, Secure, Integrated</h2>
                <p className="max-w-[900px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
                  Padlox streamlines inventory capture and data verification for policyholders and insurers.
                </p>
              </div>
            </div>
            <div className="relative grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              <div className="flex flex-col items-center text-center p-4">
                <div className="mb-4 rounded-full bg-primary p-3 text-primary-foreground">
                  <ArrowRight className="h-6 w-6" />
                </div>
                <h3 className="mb-1 font-semibold">1. AI Video Capture</h3>
                <p className="text-sm text-muted-foreground">Policyholder easily captures inventory via video walk-through.</p>
              </div>
              <div className="flex flex-col items-center text-center p-4">
                <div className="mb-4 rounded-full bg-primary p-3 text-primary-foreground">
                  <BarChart className="h-6 w-6" />
                </div>
                <h3 className="mb-1 font-semibold">2. Analyze & Store</h3>
                <p className="text-sm text-muted-foreground">AI identifies items, estimates value, flags HNW assets, generates reports.</p>
              </div>
              <div className="flex flex-col items-center text-center p-4">
                <div className="mb-4 rounded-full bg-primary p-3 text-primary-foreground">
                  <CheckCircle className="h-6 w-6" />
                </div>
                <h3 className="mb-1 font-semibold">3. Integrate & Use</h3>
                <p className="text-sm text-muted-foreground">Access comprehensive reports for underwriting and claims via API/integration.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Target Audience / HNW Focus (Updated) */}
        <section className="w-full py-12 md:py-24 lg:py-32 bg-secondary/30">
          <div className="container mx-auto grid items-center justify-center gap-4 px-4 text-center md:px-6">
            <div className="space-y-3">
              <h2 className="text-3xl font-bold tracking-tighter md:text-4xl/tight">Close the High Net Worth Coverage Gap</h2>
              <p className="mx-auto max-w-[700px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
                Effortlessly identify valuable collections, art, electronics, and unique property features often missed in standard assessments. Provide tailored, accurate coverage for HNW clients and increase appropriate premium capture.
              </p>
            </div>
          </div>
        </section>

        {/* Final CTA Section (Updated) */}
        <section className="w-full py-12 md:py-24 lg:py-32 border-t">
          <div className="container mx-auto grid items-center justify-center gap-4 px-4 text-center md:px-6">
            <div className="space-y-3">
              <h2 className="text-3xl font-bold tracking-tighter md:text-4xl">Optimize Coverage & Streamline Claims Today</h2>
              <p className="mx-auto max-w-[600px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
                Discover how Padlox&apos;s AI-powered capture can enhance your underwriting precision and claims efficiency through better data.
              </p>
            </div>
            <div className="mx-auto w-full max-w-sm space-y-2">
              <Button size="lg" className="w-full" asChild>
                <a href="mailto:adam@padlox.io">
                  Request a Personalized Demo
                </a>
              </Button>
              <p className="text-xs text-muted-foreground">
                Partner with Padlox. Secure your future.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Simple Footer */}
      <footer className="flex flex-col gap-2 sm:flex-row py-6 w-full shrink-0 items-center px-4 md:px-6 border-t">
        <div className="container mx-auto flex flex-col sm:flex-row items-center">
          <p className="text-xs text-muted-foreground sm:mr-auto">&copy; {new Date().getFullYear()} Padlox. All rights reserved.</p>
          <nav className="flex gap-4 sm:gap-6 mt-2 sm:mt-0">
            {/* <Link href="/terms" className="text-xs hover:underline underline-offset-4" prefetch={false}>
              Terms of Service
            </Link>
            <Link href="/privacy" className="text-xs hover:underline underline-offset-4" prefetch={false}>
              Privacy
            </Link> */}
          </nav>
        </div>
      </footer>
    </div>
  );
}
