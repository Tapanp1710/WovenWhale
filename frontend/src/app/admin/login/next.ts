/** Only same-site admin paths are honoured, so `next` can't become an open redirect. */
export const safeNext = (value: unknown) =>
  typeof value === "string" && value.startsWith("/admin") && !value.startsWith("/admin/login")
    ? value
    : "/admin";
