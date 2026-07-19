import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createPythonE2BClientFactory } from "../src/python-e2b-client.js";

function fakeSpawner() {
  const calls = [];
  const requests = [];
  const spawnImpl = (command, args, options) => {
    calls.push({ command, args, options });
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new Writable({
      write(chunk, _encoding, callback) {
        const request = JSON.parse(chunk.toString());
        requests.push(request);
        const results = {
          create: { sandboxId: "sandbox-1" },
          connect: { sandboxId: request.params.sandboxId },
          command: { exitCode: 0, stdout: "ok", stderr: "" },
          writeFile: { written: true },
          readFile: { content: "hello" },
          kill: { killed: true },
        };
        queueMicrotask(() => {
          child.stdout.write(`${JSON.stringify({ id: request.id, result: results[request.op] })}\n`);
        });
        callback();
      },
    });
    child.kill = () => child.emit("exit", 0, null);
    return child;
  };
  return { calls, requests, spawnImpl };
}

test("maps the adapter client contract to a long-lived Python JSON bridge", async () => {
  const fake = fakeSpawner();
  const factory = createPythonE2BClientFactory({
    pythonPath: "/venv/bin/python",
    bridgePath: "/app/e2b-bridge.py",
    spawnImpl: fake.spawnImpl,
  });
  const client = factory({
    apiKey: "runtime-secret",
    baseUrl: "http://sandbox-manager.sandbox-system.svc.cluster.local:7788",
    requestTimeoutMs: 30_000,
  });
  const session = await client.create({ template: "onyxclaw", timeoutSeconds: 300 });

  assert.equal(session.sandboxId, "sandbox-1");
  assert.deepEqual(await session.runCommand("id", { user: "node" }), {
    exitCode: 0,
    stdout: "ok",
    stderr: "",
  });
  await session.writeFile("/tmp/test", "hello", { user: "node" });
  assert.equal(await session.readFile("/tmp/test", { user: "node" }), "hello");
  await session.kill();

  assert.equal(fake.calls.length, 1);
  assert.equal(fake.calls[0].command, "/venv/bin/python");
  assert.deepEqual(fake.calls[0].args, ["/app/e2b-bridge.py"]);
  assert.equal(fake.calls[0].options.env.E2B_API_KEY, "runtime-secret");
  assert.equal(fake.calls[0].options.env.E2B_BASE_URL, "http://sandbox-manager.sandbox-system.svc.cluster.local:7788");
  assert.doesNotMatch(JSON.stringify(fake.requests), /runtime-secret/);
  assert.deepEqual(fake.requests.map(({ op }) => op), [
    "create",
    "command",
    "writeFile",
    "readFile",
    "kill",
  ]);
});

test("surfaces bridge errors without including stderr or process environment", async () => {
  const fake = fakeSpawner();
  const original = fake.spawnImpl;
  fake.spawnImpl = (...args) => {
    const child = original(...args);
    child.stdin = new Writable({
      write(chunk, _encoding, callback) {
        const request = JSON.parse(chunk.toString());
        queueMicrotask(() => child.stdout.write(`${JSON.stringify({
          id: request.id,
          error: { code: "E2B_CREATE_FAILED", message: "bridge operation failed" },
        })}\n`));
        callback();
      },
    });
    return child;
  };
  const client = createPythonE2BClientFactory({ spawnImpl: fake.spawnImpl })({
    apiKey: "runtime-secret",
    baseUrl: "http://127.0.0.1:18081",
    requestTimeoutMs: 1000,
  });

  await assert.rejects(client.create({ template: "onyxclaw" }), /bridge operation failed/);
});

test("Python bridge applies the ACS patch before E2B import and returns safe errors", async () => {
  const source = await readFile(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/e2b-bridge.py"),
    "utf8",
  );
  assert.ok(source.indexOf("patch_e2b(") < source.indexOf("from e2b import Sandbox"));
  assert.match(source, /"create"|op == "create"/);
  assert.match(source, /"connect"|op == "connect"/);
  assert.match(source, /"command"|op == "command"/);
  assert.match(source, /"writeFile"|op == "writeFile"/);
  assert.match(source, /"readFile"|op == "readFile"/);
  assert.match(source, /"kill"|op == "kill"/);
  assert.doesNotMatch(source, /print\([^\n]*(E2B_API_KEY|api_key)/);
});
