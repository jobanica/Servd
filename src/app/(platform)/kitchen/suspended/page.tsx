import { SuspendedNotice } from "@/components/platform/SuspendedNotice";

// Inside the kitchen app's scope, so a paused account never sends it out of bounds.
export default function KitchenSuspended() {
  return <SuspendedNotice loginPath="/kitchen/login" />;
}
