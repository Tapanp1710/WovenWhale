"use client";

import { Copy, Download } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import styles from "./RecoveryCodes.module.css";

/** Shows freshly issued recovery codes once, with copy and download. */
export function RecoveryCodes({ codes, email }: { codes: string[]; email: string }) {
  const [copied, setCopied] = useState(false);
  const text = `WovenWhale admin recovery codes for ${email}\nEach code works once.\n\n${codes.join("\n")}\n`;

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "wovenwhale-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={styles.wrap}>
      <p className={styles.note}>
        Save these somewhere safe, such as a password manager. If you lose your phone, each code signs you in once. They won&apos;t be
        shown again.
      </p>
      <ol className={styles.codes} aria-label="Recovery codes" data-testid="recovery-codes">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ol>
      <div className={styles.actions}>
        <Button type="button" size="sm" variant="secondary" onClick={copy} icon={<Copy size={15} aria-hidden="true" />}>
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={download} icon={<Download size={15} aria-hidden="true" />}>
          Download
        </Button>
      </div>
    </div>
  );
}
