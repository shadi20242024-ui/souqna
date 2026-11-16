import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, parse } from "node:path";
import { assertSafeHostingOutput } from "../scripts/hosting-output.mjs";

test("Hosting output accepts dedicated dist directories", t => {
  const root = mkdtempSync(join(tmpdir(), "souqna-output-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.equal(assertSafeHostingOutput(join(root, "dist"), root), join(root, "dist"));
  assert.equal(assertSafeHostingOutput(join(root, "qa", "dist"), root), join(root, "qa", "dist"));
});
test("Hosting output rejects repository root, source and unrelated paths", t => {
  const root = mkdtempSync(join(tmpdir(), "souqna-output-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, "sentinel.txt"), "keep");
  for (const target of [root, join(root, "functions"), join(root, "tests"), parse(root).root, join(parse(root).root, "unrelated-souqna", "dist")]) {
    assert.throws(() => assertSafeHostingOutput(target, root));
  }
  assert.equal(readFileSync(join(root, "sentinel.txt"), "utf8"), "keep");
});
test("Hosting output rejects symlink or junction traversal", t => {
  const root = mkdtempSync(join(tmpdir(), "souqna-output-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "outside"));
  try { symlinkSync(join(root, "outside"), join(root, "link"), process.platform === "win32" ? "junction" : "dir"); }
  catch (error) { if (["EPERM", "EACCES"].includes(error.code)) { t.skip("Symlink creation unavailable"); return; } throw error; }
  assert.throws(() => assertSafeHostingOutput(join(root, "link", "dist"), root));
});
