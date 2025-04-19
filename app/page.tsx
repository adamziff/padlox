'use client'

import React, { useState } from 'react';
import Link from 'next/link'
import { Button } from "@/components/ui/button"
import { PersonaToggle, Persona } from '@/components/persona-toggle';
import { NavBar } from '@/components/nav-bar';
import { ArrowRight, CheckCircle, BarChart, Layers, FileText, MicIcon } from 'lucide-react';

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
                Padlox helps identify coverage gaps and accelerates legitimate claims. Simply record a video showing and talking about your items.
              </p>
            </div>
            <div className="flex flex-col gap-2 min-[400px]:flex-row justify-center">
              <Button size="lg" asChild>
                <a href="mailto:adam@padlox.io">
                  Request a Demo <ArrowRight className="ml-2 h-5 w-5" />
                </a>
              </Button>
              {/* Login button removed as we can't check auth here easily */}
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
              Manual inventories are tedious. Our <span className="font-semibold">guided video and narration</span> process helps capture valuable items often missed, reducing underinsurance and speeding up claims with better data.
            </p>
          </div>
        </div>
        <div className="mx-auto grid max-w-4xl items-start gap-8 py-12 sm:grid-cols-1 md:gap-12">
          <div className="flex flex-col justify-center space-y-4">
            <ul className="grid gap-6 md:grid-cols-3">
              <li>
                <div className="grid gap-1 text-center md:text-left">
                  <h3 className="text-xl font-bold flex items-center justify-center md:justify-start"><ArrowRight className="mr-2 h-5 w-5 text-primary" />Effortless Video Capture</h3>
                  <p className="text-muted-foreground">
                    Our guided video process makes creating comprehensive home inventories fast and easy. Just hit record and describe your items as you go!
                  </p>
                </div>
              </li>
              <li>
                <div className="grid gap-1 text-center md:text-left">
                  <h3 className="text-xl font-bold flex items-center justify-center md:justify-start"><Layers className="mr-2 h-5 w-5 text-primary" />Identify Value Gaps</h3>
                  <p className="text-muted-foreground">
                    Our analysis flags high-value, unscheduled items (collections, art, electronics) based on your video capture, helping ensure appropriate HNW coverage and unlock premium opportunities.
                  </p>
                </div>
              </li>
              <li>
                <div className="grid gap-1 text-center md:text-left">
                  <h3 className="text-xl font-bold flex items-center justify-center md:justify-start"><CheckCircle className="mr-2 h-5 w-5 text-primary" />Expedite Claims</h3>
                  <p className="text-muted-foreground">
                    Provide adjusters with comprehensive inventory reports from your captured data, speeding up the validation of legitimate claims.
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
            Padlox combines easy video capture with powerful analysis to increase premium accuracy, accelerate payouts, and reduce operational overhead.
          </p>
        </div>
        <div className="flex space-x-4">
          <div className="grid gap-4">
            <div className="flex items-start gap-3">
              <ArrowRight className="mt-1 h-6 w-6 flex-shrink-0 text-primary" />
              <div>
                <h3 className="font-semibold">Best-in-Class Capture & Narration</h3>
                <p className="text-sm text-muted-foreground">Guided video + clear narration provides a fast, comprehensive, and user-friendly inventory experience for accurate documentation.</p>
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
                <p className="text-sm text-muted-foreground">Integrate Padlox features seamlessly into your existing claims and underwriting systems.</p>
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
              <MicIcon className="h-6 w-6" />
            </div>
            <h3 className="mb-1 font-semibold">2. Narrate Details</h3>
            <p className="text-sm text-muted-foreground">Speak clearly about each item (brand, value, etc.) while recording for the most accurate results.</p>
          </div>
          <div className="flex flex-col items-center text-center p-4">
            <div className="mb-4 rounded-full bg-primary p-3 text-primary-foreground">
              <FileText className="h-6 w-6" />
            </div>
            <h3 className="mb-1 font-semibold">3. Analyze & Use</h3>
            <p className="text-sm text-muted-foreground">Access comprehensive reports generated from your video for underwriting and claims.</p>
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
            Effortlessly identify valuable collections, art, electronics, and unique property features often missed, based on your <span className="font-semibold">video walkthrough and detailed narration</span>. Provide tailored, accurate coverage for clients and increase appropriate premium capture.
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
            Discover how Padlox&apos;s AI-powered video documentation can enhance your underwriting precision and claims efficiency through better data.
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
);

// New content for Policyholders
const PolicyholderContent = () => (
  <main className="flex-1">
    {/* Hero Section */}
    <section className="w-full py-20 md:py-32 lg:py-40 xl:py-48 bg-gradient-to-b from-background to-primary/10"> {/* Subtle primary hint */}
      <div className="container mx-auto px-4 md:px-6">
        <div className="flex flex-col items-center gap-6 text-center">
          <div className="flex flex-col justify-center space-y-4">
            <div className="space-y-2">
              <h1 className="text-4xl font-bold tracking-tighter sm:text-5xl xl:text-6xl/none bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent">
                Be Prepared. Inventory Your Home Effortlessly.
              </h1>
              <p className="max-w-[700px] mx-auto text-muted-foreground md:text-xl">
                Disaster can strike anytime. A complete home inventory is your key to a faster, smoother insurance claim. Padlox makes it simple with video and AI.
              </p>
            </div>
            <div className="flex flex-col gap-2 min-[400px]:flex-row justify-center">
              <Button size="lg" asChild>
                {/* Link to dashboard/signup */}
                <Link href="/dashboard">Get Started Free</Link>
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
              Don&apos;t rely on memory. A detailed inventory ensures you claim the full value for all your belongings, preventing underpayment.
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
              An up-to-date inventory makes settling estates and distributing assets much easier for your loved ones.
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
                <p className="text-sm text-muted-foreground">Just record a video of your rooms, describing items as you go. No typing required!</p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <MicIcon className="mt-1 h-6 w-6 flex-shrink-0 text-primary" />
              <div>
                <h3 className="font-semibold">AI Item Recognition & Transcription</h3>
                <p className="text-sm text-muted-foreground">Our AI automatically identifies items from your video and transcribes your spoken details (like brand, value, serial numbers).</p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <FileText className="mt-1 h-6 w-6 flex-shrink-0 text-primary" />
              <div>
                <h3 className="font-semibold">Detailed Reports</h3>
                <p className="text-sm text-muted-foreground">Generate comprehensive reports with item lists, descriptions, and estimated values, ready for your insurance agent.</p>
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
            <Link href="/dashboard">
              Create Your Free Inventory Now
            </Link>
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

  return (
    <div className="flex flex-col min-h-screen">
      <NavBar />
      {/* Add toggle below NavBar or in a dedicated header section */}
      <div className="text-center py-4 border-b bg-background">
        <PersonaToggle initialPersona={persona} onPersonaChange={setPersona} />
      </div>

      {/* Conditionally render content based on persona */}
      {persona === 'insurer' ? <InsurerContent /> : <PolicyholderContent />}

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
