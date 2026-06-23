import { listClients } from "@/server/crm/queries";
import { CrmBoard } from "@/components/super-admin/CrmBoard";

export const metadata = { title: "Client CRM · Servd" };

export default async function CrmPage() {
  const clients = await listClients();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Client CRM</h1>
        <p className="max-w-2xl text-sm text-plum-ink/50">
          Add the restaurants you&apos;re reaching out to on Facebook, then work them through a
          follow-up sequence until they reply. Each day, “Send today” shows exactly who&apos;s due
          and the message to send.
        </p>
      </div>

      <CrmBoard clients={clients} />
    </div>
  );
}
