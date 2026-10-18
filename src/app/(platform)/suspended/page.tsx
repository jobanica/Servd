import { SuspendedNotice } from "@/components/platform/SuspendedNotice";

/** Shown to non-admin staff when their restaurant's subscription is suspended. */
export default function SuspendedPage() {
  return <SuspendedNotice loginPath="/login" />;
}
