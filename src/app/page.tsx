import { redirect } from "next/navigation";

/**
 * Personal research terminal home.
 *
 * The marketing landing (and its pricing CTA) is no longer the primary entry.
 * Daily work starts on the macro brief.
 */
export default function HomePage() {
  redirect("/brief");
}
