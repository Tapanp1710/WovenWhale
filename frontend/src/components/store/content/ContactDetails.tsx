import { Clock, Mail, MessageCircle, Phone } from "lucide-react";
import styles from "./ContactDetails.module.css";

/** Contact channels from configuration; nothing is shown that the store hasn't set. */
export function ContactDetails() {
  const email = process.env.SUPPORT_EMAIL;
  const phone = process.env.SUPPORT_PHONE;
  const whatsapp = process.env.SUPPORT_WHATSAPP;
  const hours = process.env.SUPPORT_HOURS;
  const channels = [
    email && { icon: Mail, label: "Email", value: email, href: `mailto:${email}` },
    phone && { icon: Phone, label: "Phone", value: phone, href: `tel:${phone.replace(/\s/g, "")}` },
    whatsapp && { icon: MessageCircle, label: "WhatsApp", value: whatsapp, href: `https://wa.me/${whatsapp.replace(/\D/g, "")}` },
  ].filter((c): c is { icon: typeof Mail; label: string; value: string; href: string } => Boolean(c));

  return (
    <div className={styles.card}>
      <h2 className={styles.title}>Other ways to reach us</h2>
      {channels.length > 0 ? (
        <ul className={styles.list}>
          {channels.map(({ icon: Icon, label, value, href }) => (
            <li key={label}>
              <Icon size={18} aria-hidden="true" />
              <span>
                <span className={styles.label}>{label}</span>
                <a href={href}>{value}</a>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.text}>Send us a message with the form and our team will get back to you.</p>
      )}
      {hours && (
        <p className={styles.hours}>
          <Clock size={16} aria-hidden="true" /> {hours}
        </p>
      )}
    </div>
  );
}
