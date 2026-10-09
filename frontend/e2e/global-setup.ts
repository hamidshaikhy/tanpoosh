import { execFileSync } from "node:child_process";
import path from "node:path";

export default function setup() {
  const backend = path.resolve("../backend");
  const python = process.env.E2E_PYTHON || path.join(backend, process.platform === "win32" ? ".venv/Scripts/python.exe" : ".venv/bin/python");
  execFileSync(python, ["manage.py", "seed_e2e"], {cwd:backend, env:{...process.env,E2E_SETUP_ENABLED:"true"},stdio:"pipe"});
}
