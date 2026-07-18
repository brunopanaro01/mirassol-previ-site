import { readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

export function writeJsonAtomically(file, serialized, validate) {
  const target = resolve(file);
  const temporary = resolve(dirname(target), `.${basename(target)}.${process.pid}.tmp`);
  try {
    writeFileSync(temporary, serialized, { encoding: "utf8", flag: "wx" });
    const persisted = JSON.parse(readFileSync(temporary, "utf8"));
    validate(persisted);
    renameSync(temporary, target);
  } catch (error) {
    try { unlinkSync(temporary); } catch { /* O temporário pode não existir. */ }
    throw error;
  }
}
