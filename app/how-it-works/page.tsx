import { NavBar } from "@/components/nav-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Video, Mic, UploadCloud, FileText, Lightbulb } from "lucide-react";

export default function HowItWorksPage() {
    return (
        <div className="flex flex-col min-h-screen">
            <NavBar />
            <main className="flex-1 container mx-auto px-4 md:px-6 py-12 md:py-24">
                <h1 className="text-4xl font-bold tracking-tighter mb-12 text-center">
                    How Padlox Works: Get the Best Results
                </h1>

                <div className="mb-8 p-4 bg-amber-50 border border-amber-300 rounded-md text-center">
                  <p className="text-amber-700 font-semibold">Welcome to the Alpha release of Padlox!</p>
                  <p className="text-amber-600 text-sm">
                    We&rsquo;re excited for you to try it out. As an alpha product, some features might still be under development, 
                    and you may encounter occasional bugs. Your feedback is invaluable!
                  </p>
                </div>

                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {/* Step 1: Record Video */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Video className="w-6 h-6 text-primary" />
                                1. Record a Video
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-muted-foreground">
                                Walk through your home, room by room.
                                Ensure good lighting and move slowly, keeping items in frame.
                                Videos are the primary source for your inventory.
                            </p>
                        </CardContent>
                    </Card>

                    {/* Step 2: Narrate Details */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Mic className="w-6 h-6 text-primary" />
                                2. Narrate While Recording
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-muted-foreground">
                                <span className="font-semibold">Speak clearly!</span> As you record, describe each significant item.
                                Mention brand, model (if known), condition, estimated value, and any unique story.
                                This narration is key for the <span className="font-semibold">AI transcript analysis</span>.
                            </p>
                        </CardContent>
                    </Card>

                    {/* Step 3: Automatic Processing */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <UploadCloud className="w-6 h-6 text-primary" />
                                3. Automatic Processing
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-muted-foreground">
                                Once finished, stop the recording. The video file will automatically begin processing.
                                You can record multiple shorter videos if needed (e.g., per room).
                            </p>
                        </CardContent>
                    </Card>

                    {/* Step 4: Analysis (Current & Future) */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Lightbulb className="w-6 h-6 text-primary" />
                                4. AI Video and Transcript Analysis
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-muted-foreground">
                                Our system analyzes your video and narration transcript to automatically identify items, estimate values, and flag potential coverage gaps based on your descriptions. While video analysis is active, clear narration provides valuable context and helps ensure the most accurate results.
                            </p>
                        </CardContent>
                    </Card>

                    {/* Step 5: Review Inventory */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <FileText className="w-6 h-6 text-primary" />
                                5. Review Your Inventory
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-muted-foreground">
                                Access your generated inventory list on the dashboard. Review the details captured from your video and transcript analysis. Use this documented proof for insurance discussions or claims.
                            </p>
                        </CardContent>
                    </Card>
                </div>

                <div className="mt-16 text-center p-6 bg-secondary/50 rounded-lg">
                    <h2 className="text-2xl font-semibold mb-3">Why Narration Matters</h2>
                    <p className="text-muted-foreground max-w-2xl mx-auto">
                        Clear audio descriptions provide vital context for our AI. While video analysis helps identify objects, your narration is key for details like brand, model, condition, and value, especially for unique items. This detailed information helps ensure accurate valuation (especially for unique items) and significantly speeds up the validation process during a claim.
                        Think of it as creating verifiable proof for your belongings through your voice.
                    </p>
                </div>

            </main>
        </div>
    );
} 