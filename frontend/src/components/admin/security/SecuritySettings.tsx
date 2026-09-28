"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { totpCodeSchema, type AdminMfaStatusDTO } from "@wovenwhale/backend/contracts";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { api } from "@/lib/api/client";
import { serverErrors, useAction } from "../AdminContext";
import { RecoveryCodes } from "../auth/RecoveryCodes";
import { Badge } from "../ui/Badge";
import { Facts } from "../ui/Facts";
import { PageHeader } from "../ui/PageHeader";
import { Panel } from "../ui/Panel";
import styles from "./SecuritySettings.module.css";

type Action = "regenerate" | "disable";

/** The signed-in admin's own two-factor settings. */
export function SecuritySettings({ status }: { status: AdminMfaStatusDTO }) {
  const [action, setAction] = useState<Action | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);

  return (
    <>
      <PageHeader title="Sign-in security" description="Two-factor authentication for your own admin account." />
      <Panel
        title="Two-factor authentication"
        description="A code from an authenticator app is needed at every sign-in, in addition to your password."
        actions={status.enabled ? <Badge tone="success">On</Badge> : <Badge>Off</Badge>}
      >
        {status.enabled ? (
          <div className={styles.body}>
            <Facts
              items={[
                ["Account", status.email],
                ["Recovery codes left", String(status.recoveryCodesRemaining)],
                ["Policy", status.required ? "Required for every admin" : "Optional"],
              ]}
            />
            {codes && <RecoveryCodes codes={codes} email={status.email} />}
            <div className={styles.actions}>
              <Button variant="secondary" onClick={() => setAction("regenerate")}>
                Get new recovery codes
              </Button>
              {!status.required && (
                <Button variant="ghost" onClick={() => setAction("disable")}>
                  Turn off
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className={styles.body}>
            <p>Your account is protected by a password only.</p>
            <div className={styles.actions}>
              <ButtonLink href="/admin/login/setup?next=/admin/security">Set up two-factor</ButtonLink>
            </div>
          </div>
        )}
      </Panel>
      {action && (
        <CodeDialog
          action={action}
          onClose={() => setAction(null)}
          onCodes={(c) => {
            setCodes(c);
            setAction(null);
          }}
        />
      )}
    </>
  );
}

const COPY: Record<Action, { title: string; description: string; confirm: string; success: string }> = {
  regenerate: {
    title: "Get new recovery codes",
    description: "Your old recovery codes stop working as soon as new ones are issued.",
    confirm: "Issue new codes",
    success: "New recovery codes issued",
  },
  disable: {
    title: "Turn off two-factor authentication",
    description: "Sign-in will need only your password. Your recovery codes are deleted.",
    confirm: "Turn off",
    success: "Two-factor authentication turned off",
  },
};

function CodeDialog({ action, onClose, onCodes }: { action: Action; onClose: () => void; onCodes: (codes: string[]) => void }) {
  const { run } = useAction();
  const copy = COPY[action];
  const form = useForm<z.input<typeof totpCodeSchema>, unknown, z.output<typeof totpCodeSchema>>({
    resolver: zodResolver(totpCodeSchema),
    defaultValues: { code: "" },
  });

  const submit = form.handleSubmit(async (body) => {
    if (action === "regenerate") {
      const res = await run(
        () => api<{ recoveryCodes: string[] }>("/admin/auth/2fa/recovery-codes", { method: "POST", body }),
        copy.success,
        serverErrors(form.setError),
      );
      if (res) onCodes(res.recoveryCodes);
    } else if (await run(() => api("/admin/auth/2fa/disable", { method: "POST", body }), copy.success, serverErrors(form.setError))) {
      onClose();
    }
  });

  return (
    <Sheet
      open
      side="center"
      onOpenChange={(o) => !o && onClose()}
      title={copy.title}
      description={copy.description}
      footer={
        <div className={styles.footer}>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="mfa-code-form" variant={action === "disable" ? "danger" : "primary"} loading={form.formState.isSubmitting}>
            {copy.confirm}
          </Button>
        </div>
      }
    >
      <form id="mfa-code-form" onSubmit={submit} noValidate>
        <TextField
          label="Authenticator code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          autoFocus
          error={form.formState.errors.code?.message}
          {...form.register("code")}
        />
      </form>
    </Sheet>
  );
}
