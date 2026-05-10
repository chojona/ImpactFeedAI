import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;

export const resend = apiKey ? new Resend(apiKey) : null;

const FROM_ADDRESS =
  process.env.RESEND_FROM_EMAIL ?? "ImpactFeedAI <onboarding@resend.dev>";

export async function sendWaitlistNotification(email: string): Promise<void> {
  if (!resend) {
    throw new Error("Resend client not initialized — RESEND_API_KEY is missing");
  }

  const notifyEmail = process.env.NOTIFY_EMAIL;
  if (!notifyEmail) {
    throw new Error("NOTIFY_EMAIL is not set");
  }

  const timestamp = new Date().toLocaleString("en-US", {
    dateStyle: "full",
    timeStyle: "short",
  });

  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: notifyEmail,
    subject: `🚀 New signup — ${email}`,
    html: `
      <div style="font-family: monospace; background: #080C10; color: #E6EDF3; padding: 32px; border-radius: 8px; max-width: 480px;">
        <div style="color: #00FF94; font-size: 11px; letter-spacing: 3px; margin-bottom: 16px;">IMPACTFEEDAI — NEW WAITLIST SIGNUP</div>
        <div style="font-size: 20px; font-weight: 700; margin-bottom: 24px;">Someone just joined the waitlist 👀</div>
        <div style="background: #0D1117; border: 1px solid #21262D; padding: 16px; border-radius: 4px; margin-bottom: 16px;">
          <div style="color: #8B949E; font-size: 11px; margin-bottom: 4px;">EMAIL</div>
          <div style="color: #00FF94; font-size: 16px;">${email}</div>
        </div>
        <div style="background: #0D1117; border: 1px solid #21262D; padding: 16px; border-radius: 4px; margin-bottom: 24px;">
          <div style="color: #8B949E; font-size: 11px; margin-bottom: 4px;">SIGNED UP AT</div>
          <div style="font-size: 14px;">${timestamp}</div>
        </div>
        <div style="color: #8B949E; font-size: 11px;">Built by a trader, for traders.</div>
      </div>
    `,
  });

  if (error) {
    throw new Error(`Resend API error: ${error.message}`);
  }
}
export async function sendWaitlistConfirmation(email: string): Promise<void> {
  if (!resend) {
    throw new Error("Resend client not initialized — RESEND_API_KEY is missing");
  }

  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: email,
    subject: "You're on the ImpactFeedAI waitlist 🚀",
    html: `
      <div style="font-family: monospace; background: #080C10; color: #E6EDF3; padding: 32px; border-radius: 8px; max-width: 480px;">
        <div style="color: #00FF94; font-size: 11px; letter-spacing: 3px; margin-bottom: 16px;">IMPACTFEEDAI</div>
        <div style="font-size: 22px; font-weight: 700; margin-bottom: 12px;">You're on the list. 👀</div>
        <div style="color: #8B949E; font-size: 14px; line-height: 1.7; margin-bottom: 24px;">
          Thanks for signing up — you'll get early access when we launch, 
          plus early adopter pricing before we go public.
        </div>
        <div style="background: #0D1117; border: 1px solid #21262D; padding: 16px; border-radius: 4px; margin-bottom: 24px;">
          <div style="color: #8B949E; font-size: 11px; margin-bottom: 8px;">WHILE YOU WAIT</div>
          <div style="color: #E6EDF3; font-size: 13px; line-height: 1.8;">
            → Try the app now at <a href="https://impactfeed-ai.vercel.app" style="color: #00FF94;">impactfeed-ai.vercel.app</a><br/>
            → See how tariffs, Fed decisions, and CPI prints move markets<br/>
            → Check the Pattern Library to build your intuition
          </div>
        </div>
        <div style="color: #8B949E; font-size: 11px;">Built by a trader, for traders. — ImpactFeedAI</div>
      </div>
    `,
  });

  if (error) {
    throw new Error(`Resend API error: ${error.message}`);
  }
}