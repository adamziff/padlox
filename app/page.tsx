'use client'

import React, { useState, useEffect } from 'react';
import Link from 'next/link'
import { Button } from "@/components/ui/button"
import { PersonaToggle, Persona } from '@/components/persona-toggle';
import { NavBar } from '@/components/nav-bar';
import { ArrowRight, CheckCircle, BarChart, Layers, FileText, MicIcon } from 'lucide-react';
import { createClient } from "@/utils/supabase/client"

// Existing content (assumed for Insurers)
const InsurerContent = () => (
  <main className="flex-1">
    {/* Hero Section */}
    <section className="w-full py-20 md:py-32 lg:py-40 xl:py-48 bg-gradient-to-b from-background to-secondary">
      <div className="container mx-auto px-4 md:px-6">
        <div className="flex flex-col items-center gap-6 text-center">
          <div className="flex flex-col justify-center space-y-4">
            <div className="space-y-2">
              <h1 className="text-4xl font-bold tracking-tighter sm:text-5xl xl:text-6xl/none bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent">
                Home Inventory, without the hassle.
              </h1>
              <p className="max-w-[700px] mx-auto text-muted-foreground md:text-xl">
                AI-powered home inventory. Identify coverage gaps and fast-track legitimate claims with a better inventory experience than ever before.
              </p>
              <p className="max-w-[700px] mx-auto text-sm text-amber-600 dark:text-amber-500 mt-2">Please note: Padlox is currently in Alpha. You may encounter bugs or unexpected behavior.</p>
            </div>
            <div className="flex flex-col gap-2 min-[400px]:flex-row justify-center pt-4">
              <Button
                size="lg"
                className="bg-gradient-to-r from-primary to-accent text-primary-foreground hover:opacity-90 transition-opacity"
                asChild
              >
                <Link href="/login">
                  Get Started <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
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
              Imagine: Everyone Does A Home Inventory
            </h2>
            <p className="max-w-[900px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
              Manual inventories are time-consuming and tedious, so no one does them. With Padlox, you can <span className="font-semibold">narrate videos of your items</span> to make inventory capture fast and effortless.
            </p>
          </div>
        </div>
        <div className="mx-auto grid max-w-4xl items-start gap-8 py-12 sm:grid-cols-1 md:gap-12">
          <div className="flex flex-col justify-center space-y-4">
            <ul className="grid gap-6 md:grid-cols-3">
              <li>
                <div className="grid gap-1 text-center md:text-left">
                  <h3 className="text-xl font-bold flex items-center justify-center md:justify-start"><ArrowRight className="mr-2 h-5 w-5 text-primary" />Build Inventory Faster</h3>
                  <p className="text-muted-foreground">
                    No more spreadsheets, photos, or manual data entry. Padlox automatically transcribes and analyzes your clients&apos; inventory videos and identifies items, providing detailed descriptions and value estimates.
                  </p>
                </div>
              </li>
              <li>
                <div className="grid gap-1 text-center md:text-left">
                  <h3 className="text-xl font-bold flex items-center justify-center md:justify-start"><Layers className="mr-2 h-5 w-5 text-primary" />Identify Coverage Gaps</h3>
                  <p className="text-muted-foreground">
                    Flag high-value, unscheduled items based on the client&apos;s policy, riders, and limits. Identify underinsured clients and opportunities to enhance coverage.
                  </p>
                </div>
              </li>
              <li>
                <div className="grid gap-1 text-center md:text-left">
                  <h3 className="text-xl font-bold flex items-center justify-center md:justify-start"><CheckCircle className="mr-2 h-5 w-5 text-primary" />Expedite Claims</h3>
                  <p className="text-muted-foreground">
                    Provide adjusters with comprehensive inventory reports and <a href="https://c2pa.org/" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">C2PA-signed media</a>, ensuring proof of video authenticity and speeding up the validation of legitimate claims.
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
            Padlox combines user-friendly video capture with powerful analysis to refine premium accuracy, expedite claim verification, and reduce operational overhead.
          </p>
        </div>
        <div className="flex space-x-4">
          <div className="grid gap-4">
            <div className="flex items-start gap-3">
              <ArrowRight className="mt-1 h-6 w-6 flex-shrink-0 text-primary" />
              <div>
                <h3 className="font-semibold">Efficient Inventory Capture</h3>
                <p className="text-sm text-muted-foreground">Guided video and narration provide a fast, comprehensive inventory method for accurate policyholder documentation.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <BarChart className="mt-1 h-6 w-6 flex-shrink-0 text-primary" />
              <div>
                <h3 className="font-semibold">Identify Premium Opportunities</h3>
                <p className="text-sm text-muted-foreground">Surface coverage gaps, particularly for HNW clients, enabling appropriate premium adjustments.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle className="mt-1 h-6 w-6 flex-shrink-0 text-primary" />
              <div>
                <h3 className="font-semibold">Accelerate Claims Validation</h3>
                <p className="text-sm text-muted-foreground">Provide adjusters with comprehensive, verifiable reports to fast-track legitimate claims processing.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Layers className="mt-1 h-6 w-6 flex-shrink-0 text-primary" />
              <div>
                <h3 className="font-semibold">Seamless Integration</h3>
                <p className="text-sm text-muted-foreground">Integrate Padlox features into existing claims and underwriting systems via white-label options.</p>
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
              Padlox streamlines inventory creation and data analysis for policyholders and insurers.
            </p>
          </div>
        </div>
        <div className="relative grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex flex-col items-center text-center p-4">
            <div className="mb-4 rounded-full bg-primary p-3 text-primary-foreground">
              <ArrowRight className="h-6 w-6" />
            </div>
            <h3 className="mb-1 font-semibold">1. Capture Video</h3>
            <p className="text-sm text-muted-foreground">Policyholder easily captures inventory via video walk-through.</p>
          </div>
          <div className="flex flex-col items-center text-center p-4">
            <div className="mb-4 rounded-full bg-primary p-3 text-primary-foreground">
              <MicIcon className="h-6 w-6" />
            </div>
            <h3 className="mb-1 font-semibold">2. Narrate Details</h3>
            <p className="text-sm text-muted-foreground">AI analysis finds and saves items based on video and audio analysis. Clear narration is still recommended for optimal results and context.</p>
          </div>
          <div className="flex flex-col items-center text-center p-4">
            <div className="mb-4 rounded-full bg-primary p-3 text-primary-foreground">
              <FileText className="h-6 w-6" />
            </div>
            <h3 className="mb-1 font-semibold">3. Analyze & Utilize Data</h3>
            <p className="text-sm text-muted-foreground">Access structured inventory data and reports for enhanced underwriting and faster claims.</p>
          </div>
        </div>
      </div>
    </section>

    {/* Target Audience / HNW Focus (Updated) */}
    <section className="w-full py-12 md:py-24 lg:py-32 bg-secondary/30">
      <div className="container mx-auto grid items-center justify-center gap-4 px-4 text-center md:px-6">
        <div className="space-y-3">
          <h2 className="text-3xl font-bold tracking-tighter md:text-4xl/tight">Close the Coverage Gap</h2>
          <p className="mx-auto max-w-[700px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
            Padlox shows clients the estimated value of their inventory at the top of the dashboard, so they can see if they&apos;re underinsured. Insurers can identify opportunties to enhance coverage for underinsured clients.
          </p>
        </div>
      </div>
    </section>

    {/* Final CTA Section (Updated) */}
    <section className="w-full py-12 md:py-24 lg:py-32 border-t">
      <div className="container mx-auto grid items-center justify-center gap-4 px-4 text-center md:px-6">
        <div className="space-y-3">
          <h2 className="text-3xl font-bold tracking-tighter md:text-4xl">Try Padlox for Free</h2>
          <p className="mx-auto max-w-[600px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
            Discover the best home inventory experience on the market. Sign up for a free account, try out the platform, and see how Padlox can help you.
          </p>
        </div>
        <div className="mx-auto w-full max-w-md flex flex-col sm:flex-row gap-2 justify-center">
          <Button
            size="lg"
            className="bg-gradient-to-r from-primary to-accent text-primary-foreground hover:opacity-90 transition-opacity w-full sm:w-auto"
            asChild
          >
            <Link href="/login">Get Started</Link>
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="w-full sm:w-auto"
            asChild
          >
            <a href="mailto:adam@padlox.io">Contact Us</a>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Build for the future. Partner with Padlox.
        </p>
      </div>
    </section>
  </main>
);

// New content for Policyholders
const PolicyholderContent = ({ isLoggedIn }: { isLoggedIn: boolean }) => (
  <main className="flex-1">
    {/* Hero Section */}
    <section className="w-full py-20 md:py-32 lg:py-40 xl:py-48 bg-gradient-to-b from-background to-primary/10">
      <div className="container mx-auto px-4 md:px-6">
        <div className="flex flex-col items-center gap-6 text-center">
          <div className="flex flex-col justify-center space-y-4">
            <div className="space-y-2">
              <h1 className="text-4xl font-bold tracking-tighter sm:text-5xl xl:text-6xl/none bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent">
                Be Prepared. Inventory Effortlessly.
              </h1>
              <p className="max-w-[700px] mx-auto text-muted-foreground md:text-xl">
                Disaster can strike anytime. A complete home inventory is your key to a faster, smoother insurance claim. Padlox makes it simple with video and AI.
              </p>
              <p className="max-w-[700px] mx-auto text-sm text-amber-600 dark:text-amber-500 mt-2">Please note: Padlox is currently in Alpha. You may encounter bugs or unexpected behavior.</p>
            </div>
            <div className="flex flex-col gap-2 min-[400px]:flex-row justify-center pt-4">
              <Button
                size="lg"
                className="bg-gradient-to-r from-primary to-accent text-primary-foreground hover:opacity-90 transition-opacity"
                asChild
              >
                {isLoggedIn ? (
                  <Link href="/dashboard">My Dashboard</Link>
                ) : (
                  <Link href="/login">Get Started Free</Link>
                )}
              </Button>
              <Button variant="outline" size="lg" asChild>
                <Link href="#why-inventory">Learn Why</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>

    {/* Why Inventory Section */}
    <section id="why-inventory" className="w-full py-12 md:py-24 lg:py-32 bg-background">
      <div className="container mx-auto px-4 md:px-6">
        <div className="flex flex-col items-center justify-center space-y-4 text-center mb-12">
          <div className="inline-block rounded-lg bg-secondary px-3 py-1 text-sm">Preparedness</div>
          <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl">
            Why Every Home Needs an Inventory
          </h2>
          <p className="max-w-[900px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
            After a fire, flood, or theft, remembering everything you owned is nearly impossible. An inventory is essential proof for your insurance claim.
          </p>
        </div>
        <div className="mx-auto grid max-w-4xl items-start gap-8 py-12 sm:grid-cols-1 md:grid-cols-2 md:gap-12">
          <div className="grid gap-1">
            <h3 className="text-xl font-bold flex items-center"><CheckCircle className="mr-2 h-5 w-5 text-primary" />Speed Up Claims</h3>
            <p className="text-muted-foreground">
              Provide exact details and proof of ownership to your adjuster, drastically reducing claim processing time and getting your payout faster.
            </p>
          </div>
          <div className="grid gap-1">
            <h3 className="text-xl font-bold flex items-center"><Layers className="mr-2 h-5 w-5 text-primary" />Ensure Fair Payouts</h3>
            <p className="text-muted-foreground">
              Don&apos;t rely on memory. A detailed inventory ensures you claim the full value for all your belongings, reducing the risk of underpayment.
            </p>
          </div>
          <div className="grid gap-1">
            <h3 className="text-xl font-bold flex items-center"><BarChart className="mr-2 h-5 w-5 text-primary" />Identify Coverage Needs</h3>
            <p className="text-muted-foreground">
              Know the total value of your possessions to ensure your insurance policy limits are adequate before disaster strikes.
            </p>
          </div>
          <div className="grid gap-1">
            <h3 className="text-xl font-bold flex items-center"><FileText className="mr-2 h-5 w-5 text-primary" />Simplify Estate Planning</h3>
            <p className="text-muted-foreground">
              An up-to-date inventory makes settling estates and distributing assets easier for you and your loved ones.
            </p>
          </div>
        </div>
      </div>
    </section>

    {/* Why Padlox Section */}
    <section className="w-full py-12 md:py-24 lg:py-32 bg-secondary/50">
      <div className="container mx-auto px-4 md:px-6">
        <div className="space-y-4 max-w-3xl mx-auto">
          <div className="inline-block rounded-lg bg-secondary px-3 py-1 text-sm">The Padlox Difference</div>
          <h2 className="text-3xl font-bold tracking-tighter md:text-4xl/tight">
            Inventory Made Easy, Accurate, and Secure
          </h2>
          <p className="max-w-[600px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
            Forget tedious spreadsheets and photo apps. Padlox uses AI video analysis for a faster, more comprehensive inventory.
          </p>
          <ul className="list-none space-y-4">
            <li className="flex items-start gap-3">
              <ArrowRight className="mt-1 h-6 w-6 flex-shrink-0 text-primary" />
              <div>
                <h3 className="font-semibold">Simple Video Walkthrough</h3>
                <p className="text-sm text-muted-foreground">Just record a video of your rooms, describing items as you go. Padlox analyzes both video and audio to automatically build a list of your items. Providing context by narrating is helpful.</p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <MicIcon className="mt-1 h-6 w-6 flex-shrink-0 text-primary" />
              <div>
                <h3 className="font-semibold">AI Item Recognition & Transcription</h3>
                <p className="text-sm text-muted-foreground">Padlox automatically saves details from your video and narration (like brand, value, serial numbers), no typing required. Clear speaking is important for accuracy.</p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <FileText className="mt-1 h-6 w-6 flex-shrink-0 text-primary" />
              <div>
                <h3 className="font-semibold">Detailed Reports</h3>
                <p className="text-sm text-muted-foreground">Generate comprehensive reports with item lists, descriptions, and estimated values, ready for your insurance agent. (Coming soon)</p>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </section>

    {/* Final CTA for Policyholders */}
    <section className="w-full py-12 md:py-24 lg:py-32 border-t">
      <div className="container mx-auto grid items-center justify-center gap-4 px-4 text-center md:px-6">
        <div className="space-y-3">
          <h2 className="text-3xl font-bold tracking-tighter md:text-4xl">Ready to Secure Your Peace of Mind?</h2>
          <p className="mx-auto max-w-[600px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
            Start your free home inventory today. It takes minutes to record, and could save you thousands.
          </p>
        </div>
        <div className="mx-auto w-full max-w-sm space-y-2">
          <Button size="lg" className="w-full" asChild>
            <Link href={isLoggedIn ? "/dashboard" : "/login"}>
              {isLoggedIn ? "Go to Dashboard" : "Create Your Free Inventory Now"}
            </Link>
          </Button>
          <Button variant="outline" size="sm" className="w-full" asChild>
            <a href="mailto:adam@padlox.io">Get In Touch</a>
          </Button>
          <p className="text-xs text-muted-foreground">
            Simple setup. Powerful protection.
          </p>
        </div>
      </div>
    </section>
  </main>
);


export default function Home() {
  const [persona, setPersona] = useState<Persona>('insurer'); // Default to insurer view
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false); // Add state for login
  const supabase = createClient(); // Initialize Supabase client

  // Fetch login state
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setIsLoggedIn(!!session);
    };
    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(!!session);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);


  return (
    <div className="flex flex-col min-h-screen">
      <NavBar />
      {/* Add toggle below NavBar or in a dedicated header section */}
      <div className="text-center py-4 border-b bg-background">
        <PersonaToggle initialPersona={persona} onPersonaChange={setPersona} />
      </div>

      {/* Conditionally render content based on persona, pass isLoggedIn to PolicyholderContent */}
      {persona === 'insurer' ? <InsurerContent /> : <PolicyholderContent isLoggedIn={isLoggedIn} />}

      {/* Shared Footer */}
      <footer className="flex flex-col gap-2 sm:flex-row py-6 w-full shrink-0 items-center px-4 md:px-6 border-t">
        <div className="container mx-auto flex flex-col sm:flex-row items-center">
          <p className="text-xs text-muted-foreground sm:mr-auto">&copy; {new Date().getFullYear()} Padlox. All rights reserved.</p>
          {/* <nav className="flex gap-4 sm:gap-6 mt-2 sm:mt-0"> </nav> */}
        </div>
      </footer>
    </div>
  );
}
