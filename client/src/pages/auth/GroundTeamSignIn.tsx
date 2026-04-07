/**
 * GroundTeamSignIn — Sign-in page for on-site event staff
 * Route: /auth/groundteam/signin
 *
 * After login, fetches the assigned event and redirects to
 * /groundteam/:eventId/checkin
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Navigation } from "@/components/Navigation";

const signInSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type SignInFormValues = z.infer<typeof signInSchema>;

export default function GroundTeamSignIn() {
  const [, navigate] = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const { user } = useAuth();

  const form = useForm<SignInFormValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (data: SignInFormValues) => {
    setIsLoading(true);
    setError("");
    try {
      // Sign in with groundTeam role
      const signInRes = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...data, role: "groundTeam" }),
      });

      if (!signInRes.ok) {
        const err = await signInRes.json();
        throw new Error(err.message || "Sign in failed");
      }

      // Fetch assigned events (may be multiple)
      const eventRes = await fetch("/api/groundteam/my-event", {
        credentials: "include",
      });

      if (!eventRes.ok) {
        const err = await eventRes.json();
        throw new Error(err.message || "Could not load assigned event(s)");
      }

      const data = await eventRes.json();
      if (Array.isArray(data)) {
        if (data.length === 1) {
          navigate(`/groundteam/${data[0].id}/checkin`);
        } else {
          navigate(`/groundteam/select`);
        }
      } else if (data?.id) {
        navigate(`/groundteam/${data.id}/checkin`);
      } else {
        throw new Error("No assigned event found");
      }
    } catch (err: any) {
      setError(err.message || "Failed to sign in");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navigation showBack={false} showHome={true} />
      <div className="flex-1 flex items-center justify-center px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-primary">Ground Team Sign In</h1>
            <p className="text-sm text-muted-foreground">For on-site event staff only</p>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-border/60 bg-muted/20 p-1">
            <button
              type="button"
              className="h-9 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
              onClick={() => navigate("/auth/agent/signin")}
            >
              Agent
            </button>
            <button
              type="button"
              className="h-9 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
              aria-current="page"
            >
              Ground Team
            </button>
          </div>

          <div className="bg-card border rounded-2xl p-8 shadow-lg">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input placeholder="staff@example.com" autoComplete="email" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="••••••••" autoComplete="current-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {error && <div className="text-sm text-red-500 text-center">{error}</div>}

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Signing In…
                    </>
                  ) : (
                    "Sign In"
                  )}
                </Button>
              </form>
            </Form>
          </div>

        </motion.div>
      </div>
    </div>
  );
}
