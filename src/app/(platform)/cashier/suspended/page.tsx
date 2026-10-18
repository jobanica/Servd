import { SuspendedNotice } from "@/components/platform/SuspendedNotice";

// Inside the cashier app's scope, so a paused account never sends it out of bounds.
export default function CashierSuspended() {
  return <SuspendedNotice loginPath="/cashier/login" />;
}
