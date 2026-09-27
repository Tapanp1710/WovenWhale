import { notFound } from "next/navigation";

/** Routes unknown URLs to the branded not-found page inside the store layout. */
export default function Missing() {
  notFound();
}
