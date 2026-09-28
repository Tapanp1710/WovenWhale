import type { AddressDTO } from "@wovenwhale/backend/contracts";
import { AddressBook } from "@/components/store/account/AddressBook";
import { accountApi } from "@/lib/api/server";

export const metadata = { title: "Addresses" };

export default async function AddressesPage() {
  const addresses = await accountApi<AddressDTO[]>("/account/addresses");
  return addresses && <AddressBook initial={addresses} />;
}
