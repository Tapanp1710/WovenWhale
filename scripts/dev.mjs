// Starts the API and the storefront together on any OS (a shell `&` runs them
// one after the other in Windows' cmd.exe). Ctrl+C stops both.
import { spawn } from "node:child_process";

const run = (workspace) => spawn("npm", ["run", "dev", "-w", workspace], { stdio: "inherit", shell: process.platform === "win32" });

const children = [run("backend"), run("frontend")];
const stop = () => children.forEach((c) => c.kill());
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const child of children) child.on("exit", (code) => code && process.exit(code));
