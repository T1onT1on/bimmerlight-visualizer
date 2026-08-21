#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const [sourceSvgPath, backgroundPath, outputPath] = process.argv.slice(2);

if (!sourceSvgPath || !backgroundPath || !outputPath) {
  console.error("Usage: node build-composite-svg.cjs <source.svg> <background.jpeg> <output.svg>");
  process.exit(1);
}

const source = fs.readFileSync(sourceSvgPath, "utf8");
const background = fs.readFileSync(backgroundPath).toString("base64");
const sideOrder = ["left", "right"];
const editableIds = new Set([
  "housing",
  "channel-01",
  "channel-02",
  "channel-03",
  "channel-04",
  "channel-05",
  "ch01-inner-projector",
  "ch01-outer-projector",
  "ch02-inner-drl",
  "ch02-outer-drl",
  "ch03-inner-drl",
  "ch03-outer-drl",
  "ch04-inner-projector",
  "ch04-outer-projector",
  "ch05-inner-projector-cap",
  "ch05-inner-projector-frame",
  "ch05-outer-projector-cap",
  "ch05-outer-projector-frame",
]);

const idOccurrences = new Map();
let svg = source.replace(/\bid="([^"]+)"/g, (match, id) => {
  if (!editableIds.has(id)) return match;
  const occurrence = idOccurrences.get(id) || 0;
  const side = sideOrder[occurrence];
  if (!side) throw new Error(`Unexpected extra occurrence of id="${id}"`);
  idOccurrences.set(id, occurrence + 1);
  return `id="${side}-${id}"`;
});

for (const id of editableIds) {
  if (idOccurrences.get(id) !== 2) {
    throw new Error(`Expected two occurrences of id="${id}"`);
  }
}

let outerGroupIndex = 0;
svg = svg.replace(/<g(?=[^>]*\bsketchjs:tool="clipart")/g, () => {
  const side = sideOrder[outerGroupIndex];
  if (!side) throw new Error("Expected exactly two top-level headlight groups");
  outerGroupIndex += 1;
  return `<g id="headlight-${side}" data-side="${side}"`;
});
if (outerGroupIndex !== 2) throw new Error("Expected exactly two top-level headlight groups");

svg = svg.replace(
  /<g id="(left|right)-channel-(\d{2})"/g,
  '<g id="$1-channel-$2" data-side="$1" data-channel="$2"',
);
svg = svg.replace(
  /<g id="(left|right)-housing"/g,
  '<g id="$1-housing" data-side="$1" data-role="housing"',
);

const backgroundImage = [
  '<image id="vehicle-background" data-role="background"',
  ' x="0" y="0" width="1351" height="900"',
  ' preserveAspectRatio="xMidYMid slice"',
  ` href="data:image/jpeg;base64,${background}"/>`,
].join("");

svg = svg.replace(/(<svg\b[^>]*>)/, `$1\n  ${backgroundImage}`);

const outputDirectory = path.dirname(outputPath);
fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(outputPath, svg);

console.log(`Wrote ${outputPath} (${fs.statSync(outputPath).size} bytes)`);
