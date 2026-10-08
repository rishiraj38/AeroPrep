"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form } from "@/components/ui/form";
import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import Link from "next/link";
import { toast } from "sonner";
import { AlertCircle, Loader2 } from "lucide-react";
import FormField from "./FormField";
import { useRouter } from "next/navigation";
import { isAuthenticated, login, register } from "@/lib/auth";
import { wakeBackend, warnIfSlow } from "@/lib/api";
import Image from "next/image";

const authFormSchema = (type: FormType) => {
  return z.object({
    name: type === "sign-up" ? z.string().trim().min(2, "Please enter your name") : z.string().optional(),
    email: z.string().email("Please enter a valid email"),
    password: z.string().min(6, "Password must be at least 6 characters"),
  });
};

const AuthForm = ({ type }: { type: FormType }) => {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const formSchema = authFormSchema(type);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
    },
  });

  // Someone who is already signed in has no use for this page. Everyone else is about to
  // need the server, so start waking it while they type.
  useEffect(() => {
    if (isAuthenticated()) router.replace('/');
    else wakeBackend();
    // Sent here because the login stopped being valid: say so, or it looks like a random sign-out
    if (new URLSearchParams(window.location.search).has('expired')) {
      setError('Your session has expired. Please sign in again.');
    }
  }, [router]);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    setError("");
    const done = warnIfSlow();
    try {
      if (type === "sign-up") {
        // Creating an account signs the user straight in
        await register(values.name || "", values.email, values.password);
        await login(values.email, values.password);
        toast.success('Welcome to AeroPrep!');
      } else {
        await login(values.email, values.password);
        toast.success("Signed in successfully!");
      }
      router.push('/');
    } catch (error: any) {
      console.error(error);
      setError(error.message || "An error occurred");
      setIsLoading(false);
    } finally {
      done();
    }
  }

  const isSign = type === "sign-in";

  return (
    <div className="flex flex-col gap-6 rounded-2xl border border-white/10 bg-dark-200/70 backdrop-blur-sm px-6 py-10 sm:px-10 shadow-2xl shadow-black/40">
      <div className="flex flex-col gap-3 items-center text-center">
        <Image src="/ap.png" alt="AeroPrep" width={108} height={72} className="mb-1" priority />
        <h1 className="text-2xl font-bold text-white tracking-tight">
          {isSign ? "Welcome back" : "Create your account"}
        </h1>
        <p className="text-sm text-light-400">
          {isSign ? "Sign in to continue your interview practice." : "Practice interviews with an AI interviewer. Your first 3 are free."}
        </p>
      </div>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="w-full space-y-5 form"
          method="post" // if the page's script has not loaded yet, a submit must not put the password in the URL
          noValidate
        >
          {!isSign && (
            <FormField
              control={form.control}
              name="name"
              label="Name"
              placeholder="Your Name"
              autoComplete="name"
            />
          )}
          <FormField
            control={form.control}
            name="email"
            label="Email"
            placeholder="Your email"
            type="email"
            autoComplete="email"
          />
          <FormField
            control={form.control}
            name="password"
            label="Password"
            placeholder="Enter Your Password"
            type="password"
            autoComplete={isSign ? "current-password" : "new-password"}
            hint={isSign ? undefined : "At least 6 characters"}
          />

          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <button className="btn-primary w-full h-11 cursor-pointer" type="submit" disabled={isLoading}>
            {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            {isLoading ? (isSign ? "Signing in…" : "Creating your account…") : (isSign ? "Sign in" : "Create an Account")}
          </button>
        </form>
      </Form>

      <p className="text-center text-sm text-light-400">
        {isSign ? "No Account Yet?" : "Have an account already?"}
        <Link
          href={!isSign ? "/sign-in" : "/sign-up"}
          className="font-bold text-primary-200 ml-1 hover:text-primary-300 transition-colors"
        >
          {!isSign ? "Sign in" : "Sign up"}
        </Link>
      </p>
    </div>
  );
};

export default AuthForm;
