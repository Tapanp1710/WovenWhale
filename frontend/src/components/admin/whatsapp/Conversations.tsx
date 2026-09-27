"use client";

import type { NotificationStatus, WhatsAppConversationDTO } from "@wovenwhale/backend/contracts";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/Skeleton";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { formatDateTime, formatPhone } from "@/lib/format";
import { humanize } from "../labels";
import styles from "./Conversations.module.css";

interface Message {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  body: string | null;
  status: NotificationStatus;
  templateTopic: string | null;
  error: string | null;
  createdAt: string;
}

/** Conversation list with a read-only message pane. */
export function Conversations({ conversations }: { conversations: WhatsAppConversationDTO[] }) {
  const [selected, setSelected] = useState<string | null>(conversations[0]?.id ?? null);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selected) return;
    const ctrl = new AbortController();
    setMessages(null);
    setError(null);
    api<Message[]>(`/admin/whatsapp/conversations/${selected}/messages`, { signal: ctrl.signal })
      .then(setMessages)
      .catch((e: unknown) => (e as Error).name !== "AbortError" && setError(errorMessage(e)));
    return () => ctrl.abort();
  }, [selected]);

  if (!conversations.length) return <p className={styles.none}>No conversations yet. Messages appear here once WhatsApp is connected.</p>;

  return (
    <div className={styles.split}>
      <ul className={styles.list} aria-label="Conversations">
        {conversations.map((c) => (
          <li key={c.id}>
            <button type="button" className={styles.item} aria-pressed={c.id === selected} onClick={() => setSelected(c.id)}>
              <span className={styles.name}>{c.customerName ?? formatPhone(c.phone)}</span>
              <span className={styles.meta}>
                {c.messageCount} messages{c.lastMessageAt && ` · ${formatDateTime(c.lastMessageAt)}`}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className={styles.pane} aria-live="polite">
        {error ? (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        ) : !messages ? (
          <div className={styles.loading}>
            <Skeleton height="2.5rem" width="60%" />
            <Skeleton height="2.5rem" width="50%" />
            <Skeleton height="2.5rem" width="70%" />
          </div>
        ) : (
          <ol className={styles.chat}>
            {messages.map((m) => (
              <li key={m.id} className={m.direction === "INBOUND" ? styles.inbound : styles.outbound}>
                <p>{m.body ?? (m.templateTopic ? `Template: ${humanize(m.templateTopic)}` : "No text")}</p>
                <p className={styles.meta}>
                  {formatDateTime(m.createdAt)} · {humanize(m.status)}
                  {m.error && ` · ${m.error}`}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
