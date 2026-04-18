"use client";

import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";

export default function LoginPage() {
  const { login, signup } = useAuth();
  const router = useRouter();
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSignup) {
      signup(email, password, name);
    } else {
      login(email, password);
    }
    router.push("/workshop");
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-24">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 block text-center font-heading text-2xl font-semibold text-[color:var(--umber)]">
          Math In Motion
        </Link>

        <div className="rounded-2xl bg-[color:var(--card)] p-8 shadow-lg ring-1 ring-[color:var(--rule)]/30">
          <h1 className="font-heading text-3xl font-semibold text-[color:var(--umber)]">
            {isSignup ? "Create your account" : "Welcome back"}
          </h1>
          <p className="mt-2 text-sm text-[color:var(--umber)]/60">
            {isSignup
              ? "Sign up to start creating animations"
              : "Sign in to access your studio"}
          </p>

          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
            {isSignup && (
              <div>
                <label htmlFor="name" className="mb-1 block font-heading text-sm text-[color:var(--umber)]/80">
                  Name
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-[color:var(--rule)]/40 bg-[color:var(--paper)] px-3 py-2 font-heading text-sm text-[color:var(--umber)] placeholder:text-[color:var(--umber)]/40 focus:outline-none focus:ring-2 focus:ring-[color:var(--sunflower-deep)]/50"
                  placeholder="Your name"
                />
              </div>
            )}
            <div>
              <label htmlFor="email" className="mb-1 block font-heading text-sm text-[color:var(--umber)]/80">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-[color:var(--rule)]/40 bg-[color:var(--paper)] px-3 py-2 font-heading text-sm text-[color:var(--umber)] placeholder:text-[color:var(--umber)]/40 focus:outline-none focus:ring-2 focus:ring-[color:var(--sunflower-deep)]/50"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1 block font-heading text-sm text-[color:var(--umber)]/80">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-[color:var(--rule)]/40 bg-[color:var(--paper)] px-3 py-2 font-heading text-sm text-[color:var(--umber)] placeholder:text-[color:var(--umber)]/40 focus:outline-none focus:ring-2 focus:ring-[color:var(--sunflower-deep)]/50"
                placeholder="Your password"
              />
            </div>

            <button
              type="submit"
              className="mt-2 w-full rounded-lg bg-[color:var(--sunflower-deep)] px-4 py-2.5 font-heading text-sm font-semibold text-white transition-colors hover:bg-[color:var(--sunflower-deep)]/90"
            >
              {isSignup ? "Create account" : "Sign in"}
            </button>
          </form>

          <p className="mt-4 text-center font-heading text-sm text-[color:var(--umber)]/60">
            {isSignup ? "Already have an account?" : "Don't have an account?"}{" "}
            <button
              onClick={() => setIsSignup(!isSignup)}
              className="font-semibold text-[color:var(--sunflower-deep)] underline-offset-4 hover:underline"
            >
              {isSignup ? "Sign in" : "Sign up"}
            </button>
          </p>
        </div>

        <div className="mt-6 text-center">
          <Link href="/pricing" className="font-heading text-sm italic text-[color:var(--umber)]/60 underline-offset-4 hover:text-[color:var(--sunflower-deep)] hover:underline">
            View pricing plans
          </Link>
        </div>
      </div>
    </div>
  );
}
