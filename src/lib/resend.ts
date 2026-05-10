import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;

export const resend = apiKey ? new Resend(apiKey) : null;

// onboarding@resend.dev only sends to the email registered with Resend.
// After verifying a domain in Resend, override via RESEND_FROM_EMAIL
// (e.g. "ImpactFeedAI <waitlist@yourdomain.com>").
const FROM_ADDRESS =
  process.env.RESEND_FROM_EMAIL ?? "ImpactFeedAI <onboarding@resend.dev>";

export async function sendWaitlistNotification(email: string): Promise<void> {
  if (!resend) {
    throw new Error(
      "Resend client not initialized — RESEND_API_KEY is missing",
    );
  }

  const notifyEmail = process.env.NOTIFY_EMAIL;
  if (!notifyEmail) {
    throw new Error("NOTIFY_EMAIL is not set");
  }

  const timestamp = new Date().toISOString();
  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: notifyEmail,
    subject: "New ImpactFeedAI waitlist signup",
    text: `Email: ${email} | Signed up at: ${timestamp}`,
  });

  if (error) {
    throw new Error(`Resend API error: ${error.message}`);
  }
}
