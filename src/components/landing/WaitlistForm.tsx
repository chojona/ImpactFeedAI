"use client";

import { useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check } from "lucide-react";

type Status = "idle" | "submitting" | "success" | "error";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (status === "submitting") return;

    const trimmed = email.trim();
    if (!EMAIL_REGEX.test(trimmed)) {
      setStatus("error");
      setErrorMsg("Please enter a valid email address.");
      return;
    }

    setStatus("submitting");
    setErrorMsg("");

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : "Something went wrong. Please try again.",
        );
      }
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.",
      );
    }
  };

  return (
    <div>
      <AnimatePresence mode="wait">
        {status === "success" ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center gap-3"
          >
            <motion.div
              initial={{ scale: 0, rotate: -90 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{
                type: "spring",
                stiffness: 350,
                damping: 18,
                delay: 0.05,
              }}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-[#00FF94]/15"
            >
              <Check className="h-6 w-6 text-[#00FF94]" strokeWidth={3} />
            </motion.div>
            <p className="text-base font-semibold text-zinc-100">
              You&apos;re on the list. We&apos;ll be in touch.
            </p>
          </motion.div>
        ) : (
          <motion.form
            key="form"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onSubmit={submit}
            className="flex flex-col gap-3 sm:flex-row"
            noValidate
          >
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (status === "error") setStatus("idle");
              }}
              placeholder="you@example.com"
              className="w-full flex-1 rounded-md border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 transition focus:border-[#00FF94]/50 focus:outline-none focus:ring-2 focus:ring-[#00FF94]/15"
              aria-invalid={status === "error"}
              aria-describedby={
                status === "error" ? "waitlist-error" : undefined
              }
            />
            <button
              type="submit"
              disabled={status === "submitting"}
              className="rounded-md bg-[#00FF94] px-6 py-3 text-sm font-semibold text-[#080C10] transition hover:bg-[#00FF94]/90 focus:outline-none focus:ring-2 focus:ring-[#00FF94]/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {status === "submitting" ? "Submitting..." : "Get Early Access"}
            </button>
          </motion.form>
        )}
      </AnimatePresence>

      {status === "error" && errorMsg && (
        <p
          id="waitlist-error"
          role="alert"
          className="mt-3 text-sm text-red-400"
        >
          {errorMsg}
        </p>
      )}

      <p className="mt-5 text-xs text-zinc-500">
        Join <span className="font-semibold text-zinc-300">142 traders</span>{" "}
        already on the waitlist.
      </p>
      <p className="mt-1 text-xs text-zinc-600">
        No spam. Early access pricing when we launch.
      </p>
    </div>
  );
}
