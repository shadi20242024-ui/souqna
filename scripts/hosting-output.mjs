import assert from "node:assert/strict";
import { existsSync, lstatSync } from "node:fs";
import { basename, dirname, relative, resolve, isAbsolute, sep } from "node:path";
import { tmpdir } from "node:os";

function inside(parent, target) {
  const rel = relative(parent, target);
  return rel !== "" && rel !== ".." && !rel.startsWith(".." + sep) && !isAbsolute(rel);
}

export function assertSafeHostingOutput(output, repository) {
  const target = resolve(output), root = resolve(repository);
  const temporary = resolve(tmpdir());
  assert.notEqual(target, root, "Hosting output must never overwrite repository root.");
  assert.equal(basename(target), "dist", "Hosting output directory must be named dist.");
  assert.ok(inside(root, target) || inside(temporary, target), "Hosting output must be inside the repository or OS temporary directory.");
  for (let current = target; ; current = dirname(current)) {
    if (existsSync(current)) assert.ok(!lstatSync(current).isSymbolicLink(), "Hosting output cannot traverse a symlink or junction.");
    const parent = dirname(current);
    if (parent === current) break;
  }
  return target;
}
