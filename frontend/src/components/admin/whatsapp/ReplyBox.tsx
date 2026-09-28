"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { whatsappReplySchema, type WhatsAppConversationDTO } from "@wovenwhale/backend/contracts";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/Button";
import { TextAreaField } from "@/components/ui/Field";
import { api } from "@/lib/api/client";
import { formatDateTime } from "@/lib/format";
import { serverErrors, useAction, useCan } from "../AdminContext";
import styles from "./ReplyBox.module.css";

/** Free-form reply, allowed only inside WhatsApp's 24-hour customer-service window. */
export function ReplyBox({ conversation, onSent }: { conversation: WhatsAppConversationDTO; onSent: () => void }) {
  const canReply = useCan("whatsapp.reply");
  const { run } = useAction();
  const form = useForm<z.input<typeof whatsappReplySchema>, unknown, z.output<typeof whatsappReplySchema>>({
    resolver: zodResolver(whatsappReplySchema),
    defaultValues: { body: "" },
  });
  if (!canReply) return null;

  const expires = conversation.serviceWindowExpiresAt;
  if (!expires || new Date(expires) < new Date()) {
    return (
      <p className={styles.closed}>
        {expires ? `The reply window closed ${formatDateTime(expires)}. ` : "The customer hasn't messaged yet. "}
        WhatsApp only allows free-form replies within 24 hours of the customer&apos;s last message.
      </p>
    );
  }

  const submit = form.handleSubmit(async (body) => {
    const ok = await run(
      () => api(`/admin/whatsapp/conversations/${conversation.id}/reply`, { method: "POST", body }),
      "Reply sent",
      serverErrors(form.setError),
    );
    if (ok) {
      form.reset();
      onSent();
    }
  });

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <TextAreaField
        label="Reply"
        rows={3}
        maxLength={1000}
        hint={`You can reply freely until ${formatDateTime(expires)}.`}
        error={form.formState.errors.body?.message}
        {...form.register("body")}
      />
      <div className={styles.actions}>
        <Button type="submit" size="sm" loading={form.formState.isSubmitting}>
          Send reply
        </Button>
      </div>
    </form>
  );
}
