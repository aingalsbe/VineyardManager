import assert from "node:assert/strict";
import test from "node:test";
import { FOCUSABLE_SELECTOR, trapTab } from "../src/lib/focus-trap.ts";

test("trapTab wraps Tab from the last element to the first", () => {
  assert.deepEqual(trapTab(3, 2, true, false), { kind: "focus", index: 0 });
});

test("trapTab wraps Shift+Tab from the first element to the last", () => {
  assert.deepEqual(trapTab(3, 0, true, true), { kind: "focus", index: 2 });
});

test("trapTab lets Tab move normally between middle elements", () => {
  assert.deepEqual(trapTab(3, 1, true, false), { kind: "allow" });
  assert.deepEqual(trapTab(3, 1, true, true), { kind: "allow" });
});

test("trapTab pulls focus back into the panel when it escaped", () => {
  assert.deepEqual(trapTab(4, -1, false, false), { kind: "focus", index: 0 });
  assert.deepEqual(trapTab(4, -1, false, true), { kind: "focus", index: 3 });
});

test("trapTab focuses the panel when nothing inside is focusable", () => {
  assert.deepEqual(trapTab(0, -1, true, false), { kind: "panel" });
});

test("a single focusable element keeps focus on itself both ways", () => {
  assert.deepEqual(trapTab(1, 0, true, false), { kind: "focus", index: 0 });
  assert.deepEqual(trapTab(1, 0, true, true), { kind: "focus", index: 0 });
});

test("focusable selector skips disabled controls and tabindex=-1 and includes summary", () => {
  assert.match(FOCUSABLE_SELECTOR, /button:not\(\[disabled\]\)/);
  assert.match(FOCUSABLE_SELECTOR, /select:not\(\[disabled\]\)/);
  assert.match(FOCUSABLE_SELECTOR, /\[tabindex\]:not\(\[tabindex="-1"\]\)/);
  assert.match(FOCUSABLE_SELECTOR, /summary/);
});
