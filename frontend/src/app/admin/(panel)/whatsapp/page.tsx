import type { WhatsAppConversationDTO, WhatsAppTemplateDTO } from "@wovenwhale/backend/contracts";
import type { Metadata } from "next";
import { adminWith } from "@/components/admin/server";
import { NoAccess } from "@/components/admin/ui/NoAccess";
import { Notice } from "@/components/admin/ui/Notice";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { Panel } from "@/components/admin/ui/Panel";
import { Conversations } from "@/components/admin/whatsapp/Conversations";
import { TemplatesTable } from "@/components/admin/whatsapp/TemplatesTable";
import { sessionApi } from "@/lib/api/server";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "WhatsApp" };

export default async function WhatsAppPage() {
  if (!(await adminWith("whatsapp.view"))) return <NoAccess what="WhatsApp" />;
  const [templates, conversations] = await Promise.all([
    sessionApi<WhatsAppTemplateDTO[]>("/admin/whatsapp/templates"),
    sessionApi<WhatsAppConversationDTO[]>("/admin/whatsapp/conversations"),
  ]);
  return (
    <div className={styles.page}>
      <PageHeader title="WhatsApp" description="Order updates and customer conversations on WhatsApp." />
      <Notice title="Outbound messages are switched off">
        Nothing is sent until the server has <code>WHATSAPP_SEND_ENABLED=true</code> and the topic&apos;s template is both approved by Meta
        and marked active below. Until then, messages are recorded as skipped.
      </Notice>
      <Panel flush title="Message templates" description="Only mark a template approved after Meta has approved it in WhatsApp Manager.">
        <TemplatesTable templates={templates} />
      </Panel>
      <Panel flush title="Conversations">
        <Conversations conversations={conversations} />
      </Panel>
    </div>
  );
}
