import type { AddressDTO } from "@wovenwhale/backend/contracts";
import { AddressBook } from "@/components/store/account/AddressBook";
import { sessionApi } from "@/lib/api/server";

export const metadata = { title: "Addresses" };

export default async function AddressesPage() {
  return <AddressBook initial={await sessionApi<AddressDTO[]>("/account/addresses")} />;
}
