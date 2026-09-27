import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import styles from "./Field.module.css";

interface FieldShellProps {
  label: string;
  error?: string;
  hint?: ReactNode;
  id: string;
  children: ReactNode;
  optional?: boolean;
}

function FieldShell({ label, error, hint, id, children, optional }: FieldShellProps) {
  return (
    <div className={styles.field} data-invalid={error ? "" : undefined}>
      <label className={styles.label} htmlFor={id}>
        {label}
        {optional && <span className={styles.optional}> (optional)</span>}
      </label>
      {children}
      {error ? (
        <p className={styles.error} id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className={styles.hint} id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

const describedBy = (id: string, error?: string, hint?: ReactNode) => (error ? `${id}-error` : hint ? `${id}-hint` : undefined);

type Common = { label: string; error?: string; hint?: ReactNode; optional?: boolean };

export const TextField = forwardRef<HTMLInputElement, Common & InputHTMLAttributes<HTMLInputElement>>(function TextField(
  { label, error, hint, optional, id, className, ...rest },
  ref,
) {
  const auto = useId();
  const fieldId = id ?? auto;
  return (
    <FieldShell label={label} error={error} hint={hint} id={fieldId} optional={optional}>
      <input
        ref={ref}
        id={fieldId}
        className={[styles.control, className].filter(Boolean).join(" ")}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, error, hint)}
        {...rest}
      />
    </FieldShell>
  );
});

export const SelectField = forwardRef<HTMLSelectElement, Common & SelectHTMLAttributes<HTMLSelectElement>>(function SelectField(
  { label, error, hint, optional, id, children, ...rest },
  ref,
) {
  const auto = useId();
  const fieldId = id ?? auto;
  return (
    <FieldShell label={label} error={error} hint={hint} id={fieldId} optional={optional}>
      <select
        ref={ref}
        id={fieldId}
        className={`${styles.control} ${styles.select}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, error, hint)}
        {...rest}
      >
        {children}
      </select>
    </FieldShell>
  );
});

export const TextAreaField = forwardRef<HTMLTextAreaElement, Common & TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextAreaField(
  { label, error, hint, optional, id, ...rest },
  ref,
) {
  const auto = useId();
  const fieldId = id ?? auto;
  return (
    <FieldShell label={label} error={error} hint={hint} id={fieldId} optional={optional}>
      <textarea
        ref={ref}
        id={fieldId}
        className={`${styles.control} ${styles.textarea}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, error, hint)}
        {...rest}
      />
    </FieldShell>
  );
});

export const Checkbox = forwardRef<HTMLInputElement, { label: ReactNode } & InputHTMLAttributes<HTMLInputElement>>(function Checkbox(
  { label, ...rest },
  ref,
) {
  return (
    <label className={styles.checkbox}>
      <input ref={ref} type="checkbox" {...rest} />
      <span>{label}</span>
    </label>
  );
});
