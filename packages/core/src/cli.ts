#!/usr/bin/env node
const [command] = process.argv.slice(2);

if (!command) {
  process.stderr.write(JSON.stringify({ error: "missing command", hint: "see docs/core-cli-interface.md" }) + "\n");
  process.exit(1);
}

process.stderr.write(JSON.stringify({ error: `unknown command: ${command}`, hint: "not implemented yet" }) + "\n");
process.exit(1);
