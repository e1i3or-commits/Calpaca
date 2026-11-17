import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet } from "@/components/ui/sheet";
import { FormSection } from "@/components/ui/form-section";
import { addWorkspaceDomain, removeWorkspaceDomain, verifyWorkspaceDomain, type WorkspaceDomain } from "@/lib/api";
import { errorText } from "@/lib/error-text";

type DnsRecord = { name: string; value: string };

/** Booking hostnames for the workspace: added in a sheet, then verified by DNS. */
export function CustomDomainsSection({
  domains,
  entitled,
  canManage,
  onChanged,
}: {
  domains: WorkspaceDomain[];
  entitled: boolean;
  canManage: boolean;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [hostname, setHostname] = useState("");
  const [dnsRecord, setDnsRecord] = useState<DnsRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);

  const closeSheet = () => {
    setAdding(false);
    setHostname("");
    setDnsRecord(null);
    setSheetError(null);
  };

  const add = async () => {
    setBusy(true);
    setSheetError(null);
    try {
      const result = await addWorkspaceDomain(hostname.trim());
      setDnsRecord(result.domain.dnsRecord);
      onChanged();
    } catch (reason) {
      setSheetError(errorText(reason));
    } finally {
      setBusy(false);
    }
  };

  const run = (action: () => Promise<unknown>) => {
    setError(null);
    void action().then(onChanged).catch((reason: unknown) => setError(errorText(reason)));
  };

  return (
    <FormSection
      title="Custom domains"
      description={entitled
        ? "Add the hostname here first. DNS remains under your control until verification."
        : "Custom domains require a paid hosted plan."}
      action={entitled && canManage && (
        <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => setAdding(true)}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add domain
        </Button>
      )}
    >
      {error && <p role="alert" className="mb-2 text-sm text-destructive">{error}</p>}
      {domains.length > 0 && (
        <ul className="flex flex-col gap-2">
          {domains.map((domain) => (
            <li key={domain.id} className="flex items-center gap-3 rounded-md border border-border p-3 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{domain.hostname}</span>
                <span className="text-xs text-muted-foreground">{domain.status}</span>
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={domain.status === "verified" || !canManage}
                onClick={() => run(() => verifyWorkspaceDomain(domain.id))}
              >
                {domain.status === "verified" ? "Verified" : "Verify DNS"}
              </Button>
              <Button variant="ghost" size="sm" disabled={!canManage} onClick={() => run(() => removeWorkspaceDomain(domain.id))}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Sheet
        open={adding}
        title="Add custom domain"
        description={dnsRecord
          ? "Add this record at your DNS provider, then choose Verify DNS on the domain."
          : "The hostname invitees will use for your booking links."}
        onClose={closeSheet}
        footer={dnsRecord ? (
          <Button onClick={closeSheet}>Done</Button>
        ) : (
          <>
            <Button variant="outline" onClick={closeSheet}>Cancel</Button>
            <Button type="submit" form="custom-domain-form" disabled={busy || !hostname.trim()}>
              Add domain
            </Button>
          </>
        )}
      >
        {sheetError && <p role="alert" className="mb-4 text-sm text-destructive">{sheetError}</p>}
        {dnsRecord ? (
          <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
            <p className="font-medium">DNS verification record</p>
            <code className="mt-2 block overflow-x-auto text-xs">TXT {dnsRecord.name} {dnsRecord.value}</code>
          </div>
        ) : (
          <form
            id="custom-domain-form"
            className="flex flex-col gap-1.5"
            onSubmit={(event) => {
              event.preventDefault();
              void add();
            }}
          >
            <Label htmlFor="custom-domain-hostname">Hostname</Label>
            <Input
              id="custom-domain-hostname"
              required
              placeholder="cal.example.com"
              value={hostname}
              onChange={(event) => setHostname(event.target.value.toLowerCase())}
            />
          </form>
        )}
      </Sheet>
    </FormSection>
  );
}
