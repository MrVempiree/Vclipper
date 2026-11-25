import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { findHighlights, formatTime, parsePetCommand } = require("../app.js");

test("finds the loudest window first by score, returned in time order", () => {
  const energy = Array(60).fill(0.1);
  for (let i = 30; i < 45; i++) energy[i] = 0.9;
  const clips = findHighlights(energy, 15, 3);
  assert.ok(clips.length >= 1);
  assert.ok(clips.some((c) => c.start === 30), "loudest window at 30s should be picked");
});

test("empty energy returns no clips", () => {
  assert.deepEqual(findHighlights([], 15, 5), []);
});

test("windows never overlap", () => {
  const energy = Array(90).fill(0.5);
  const clips = findHighlights(energy, 15, 5);
  for (let i = 1; i < clips.length; i++) assert.ok(clips[i].start >= clips[i - 1].end);
});

test("formatTime renders one decimal", () => {
  assert.equal(formatTime(12.34), "12.3s");
});

test("pet parses trim commands in Hinglish and English", () => {
  assert.deepEqual(parsePetCommand("clip 10 se 25 second"), { action: "trim", start: 10, end: 25 });
  assert.deepEqual(parsePetCommand("trim 5 to 20"), { action: "trim", start: 5, end: 20 });
});

test("pet parses speed, caption, highlight, export", () => {
  assert.deepEqual(parsePetCommand("speed 1.5 karo"), { action: "speed", value: 1.5 });
  assert.deepEqual(parsePetCommand("caption: Hello World"), { action: "caption", value: "hello world" });
  assert.equal(parsePetCommand("highlight dhundho").action, "highlight");
  assert.equal(parsePetCommand("export karo").action, "export");
  assert.equal(parsePetCommand("").action, "none");
  assert.equal(parsePetCommand("kuch random baat").action, "unknown");
});

test("pet parses transform commands", () => {
  assert.equal(parsePetCommand("rotate karo").action, "rotate");
  assert.deepEqual(parsePetCommand("flip karo"), { action: "flip", value: "h" });
  assert.deepEqual(parsePetCommand("vertical karo"), { action: "aspect", value: "9:16" });
  assert.deepEqual(parsePetCommand("mono filter lagao"), { action: "preset", value: "mono" });
  assert.equal(parsePetCommand("frame photo banao").action, "frame");
  assert.equal(parsePetCommand("reset karo").action, "reset");
});
