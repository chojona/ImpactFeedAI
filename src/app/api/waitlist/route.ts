import { NextRequest, NextResponse } from "next/server";

const waitlist: string[] = [];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface WaitlistBody {
  email?: unknown;
}

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

  if (!waitlist.includes(email)) {
    waitlist.push(email);
  }

  console.log(
    `[waitlist] signup: ${email} (total: ${waitlist.length})`,
  );

  return NextResponse.json({ success: true, count: waitlist.length });
}

export async function GET() {
  return NextResponse.json({ count: waitlist.length, emails: waitlist });
}
