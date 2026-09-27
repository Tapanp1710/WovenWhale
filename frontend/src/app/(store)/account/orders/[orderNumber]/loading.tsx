import { ListSkeleton } from "@/components/ui/ListSkeleton";

export default function Loading() {
  return <ListSkeleton rows={3} rowHeight="160px" label="Loading order" />;
}
