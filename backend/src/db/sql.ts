import { getTableName, sql, type Column } from "drizzle-orm";

/**
 * Fully-qualified column reference ("table"."column") for correlated
 * subqueries. Drizzle omits the table name in single-table selects, which
 * would make `inner.fk = "id"` bind to the inner table's own id.
 */
export const ref = (column: Column) => sql.raw(`"${getTableName(column.table)}"."${column.name}"`);
