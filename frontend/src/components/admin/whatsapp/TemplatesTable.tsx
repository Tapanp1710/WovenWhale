"use client";

import type { WhatsAppTemplateDTO } from "@wovenwhale/backend/contracts";
import { useState } from "react";
import { api } from "@/lib/api/client";
import { useAction, useCan } from "../AdminContext";
import { humanize } from "../labels";
import { Switch } from "../ui/Switch";
import { cell, Table } from "../ui/Table";
import styles from "./TemplatesTable.module.css";

type Flag = "isApproved" | "isActive";

/** Mark templates approved (after Meta approval) and switch topics on or off. */
export function TemplatesTable({ templates }: { templates: WhatsAppTemplateDTO[] }) {
  const canEdit = useCan("settings.manage");
  const { run, pending } = useAction();
  const [rows, setRows] = useState(templates);

  async function toggle(t: WhatsAppTemplateDTO, flag: Flag) {
    const next = { ...t, [flag]: !t[flag] };
    setRows((all) => all.map((r) => (r.id === t.id ? next : r)));
    const ok = await run(
      () =>
        api(`/admin/whatsapp/templates/${t.id}`, {
          method: "PUT",
          body: {
            providerTemplateName: next.providerTemplateName,
            language: next.language,
            isApproved: next.isApproved,
            isActive: next.isActive,
          },
        }),
      `${humanize(t.topic)} template updated`,
    );
    if (!ok) setRows((all) => all.map((r) => (r.id === t.id ? t : r)));
  }

  return (
    <Table label="Message templates" minWidth={820}>
      <thead>
        <tr>
          <th scope="col">Topic</th>
          <th scope="col">Message</th>
          <th scope="col">Approved by Meta</th>
          <th scope="col">Active</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((t) => (
          <tr key={t.id}>
            <td>
              <span className={cell.strong}>{humanize(t.topic)}</span>
              <span className={cell.sub}>
                {t.providerTemplateName} · {t.language}
              </span>
            </td>
            <td className={styles.preview}>
              {t.previewBody}
              {t.variables.length > 0 && <span className={cell.sub}>Variables: {t.variables.join(", ")}</span>}
            </td>
            <td>
              <Switch
                checked={t.isApproved}
                label={`${humanize(t.topic)} approved`}
                disabled={!canEdit || pending}
                onClick={() => toggle(t, "isApproved")}
              />
            </td>
            <td>
              <Switch
                checked={t.isActive}
                label={`${humanize(t.topic)} active`}
                disabled={!canEdit || pending}
                onClick={() => toggle(t, "isActive")}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
