import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface WaitlistBody {
  email?: unknown;
  source?: unknown;
}

const isUniqueViolation = (err: unknown): boolean =>
  typeof err === "object" &&
  err !== null &&
  "code" in err &&
  (err as { code: unknown }).code === "P2002";

export async function POST(request: NextRequest) {
  let body: WaitlistBody;
  try {
    body = (await request.json()) as WaitlistBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  if (typeof body.email !== "string") {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const email = body.email.trim().toLowerCase();
  if (!EMAIL_REGEX.test(email)) {
    return NextResponse.json(
      { error: "Please enter a valid email address." },
      { status: 400 },
    );
  }

  const source = typeof body.source === "string" ? body.source : null;

  try {
    await prisma.waitlistSignup.create({
      data: { email, source },
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      // Email already on the waitlist — silently confirm
      return NextResponse.json({ message: "already_registered" });
    }
    console.error("[waitlist] DB insert failed:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ message: "success" });
}

export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const count = await prisma.waitlistSignup.count();
  return NextResponse.json({ count });
}