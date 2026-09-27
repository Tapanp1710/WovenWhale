import { Panel } from "@/components/admin/ui/Panel";
import { TableSkeleton } from "@/components/admin/ui/Table";
import { Skeleton } from "@/components/ui/Skeleton";
import styles from "./loading.module.css";

export default function AdminLoading() {
  return (
    <div className={styles.wrap} aria-busy="true">
      <span className="visually-hidden" role="status">
        Loading
      </span>
      <Skeleton width="220px" height="2rem" />
      <Skeleton width="340px" height="0.9rem" />
      <Panel flush className={styles.panel}>
        <TableSkeleton />
      </Panel>
    </div>
  );
}
