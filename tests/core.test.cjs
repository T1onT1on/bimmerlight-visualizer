const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const Core = require("../core.js");
require("../sample-v15.js");

const sample = globalThis.WelcomeLightSamples.v15;
const original = globalThis.WelcomeLightSamples.original2020;
const doubleSwipeFlash = globalThis.WelcomeLightSamples.doubleSwipeFlash;

function fieldsFromEncoded(encoded) {
  const format = (bytes) => bytes.map(Core.hexByte).join(", ");
  return {
    left1: format(encoded.left.bytes.slice(0, Core.LIMITS.staging1)),
    left2: format(encoded.left.bytes.slice(Core.LIMITS.staging1)),
    right1: format(encoded.right.bytes.slice(0, Core.LIMITS.staging1)),
    right2: format(encoded.right.bytes.slice(Core.LIMITS.staging1)),
  };
}

test("headlight SVG exposes five clean channel groups", () => {
  const svg = fs.readFileSync(path.join(__dirname, "..", "assets", "Headlight1_Right.svg"), "utf8");

  for (let identifier = 1; identifier <= 5; identifier += 1) {
    const id = String(identifier).padStart(2, "0");
    assert.match(svg, new RegExp(`id="channel-${id}"[^>]*data-channel="${id}"`));
  }
  assert.equal((svg.match(/<polyline/g) || []).length, 13);
  assert.doesNotMatch(svg, /undefined|0\.01,0\.01/);
});

test("left headlight SVG mirrors every editable top-level layer", () => {
  const right = fs.readFileSync(path.join(__dirname, "..", "assets", "Headlight1_Right.svg"), "utf8");
  const left = fs.readFileSync(path.join(__dirname, "..", "assets", "Headlight1_Left.svg"), "utf8");

  assert.equal((left.match(/transform="translate\(645 0\) scale\(-1 1\)"/g) || []).length, 6);
  assert.equal((left.match(/<polyline/g) || []).length, (right.match(/<polyline/g) || []).length);
  for (let identifier = 1; identifier <= 5; identifier += 1) {
    const id = String(identifier).padStart(2, "0");
    assert.match(left, new RegExp(`id="channel-${id}"[^>]*data-channel="${id}"`));
  }
});

test("composite SVG embeds the vehicle and exposes unique side-specific layers", () => {
  const svg = fs.readFileSync(path.join(__dirname, "..", "assets", "G20PreLCIBase.svg"), "utf8");
  const ids = [...svg.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);

  assert.match(svg, /id="vehicle-background"[^>]+href="data:image\/jpeg;base64,/);
  assert.ok(svg.indexOf('id="vehicle-background"') < svg.indexOf('id="headlight-left"'));
  assert.equal(new Set(ids).size, ids.length);
  for (const side of ["left", "right"]) {
    assert.match(svg, new RegExp(`id="headlight-${side}"[^>]+data-side="${side}"`));
    assert.match(svg, new RegExp(`id="${side}-housing"[^>]+data-role="housing"`));
    for (let identifier = 1; identifier <= 5; identifier += 1) {
      const id = String(identifier).padStart(2, "0");
      assert.match(
        svg,
        new RegExp(`id="${side}-channel-${id}"[^>]+data-side="${side}"[^>]+data-channel="${id}"`),
      );
    }
  }
});

test("input workbench exposes paste, per-byte, human-readable, chart, and preview controls", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

  for (const id of [
    "pasteModeBtn",
    "byteModeBtn",
    "humanModeBtn",
    "byteSectionsLeft",
    "byteSectionsRight",
    "humanModePanel",
    "humanSectionsLeft",
    "humanSectionsRight",
    "refreshHumanBtn",
    "applyHumanBtn",
    "curveCanvas",
    "viewRightBtn",
    "viewLeftBtn",
    "viewBothBtn",
    "editCurveBtn",
    "applyCurveBtn",
    "saveCurveBtn",
    "loadCurveBtn",
    "pointTimeInput",
    "pointBrightnessInput",
    "zoomOutBtn",
    "zoomFitBtn",
    "zoomInBtn",
    "curvePan",
    "curveContextMenu",
    "addCurvePointBtn",
    "deleteCurvePointBtn",
    "loadDoubleSwipeFlashBtn",
    "bimmerCodeFileInput",
    "bimmerCodeLeftCard",
    "bimmerCodeRightCard",
    "bimmerCodeResetBtn",
    "bimmerCodeExportBtn",
    "bimmerCodeStatus",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, />预览曲线和动画<\/button>/);
  assert.match(html, /width="1351" height="520"/);
  assert.equal((html.match(/class="curve-channel-button/g) || []).length, 5);
  assert.match(html, /src="bimmercode\.js\?/);
});

test("human-readable track description exposes duration, cumulative time, and transitions", () => {
  const result = Core.parseProject(original);
  const description = Core.describeTrack(Core.trackById(result.left, 0x01));

  assert.equal(description.identifier, 0x01);
  assert.equal(description.pairCount, 15);
  assert.equal(description.durationUnits, 688);
  assert.equal(description.durationMs, 6880);
  assert.deepEqual(
    description.pairs[5],
    {
      index: 5,
      durationUnits: 63,
      durationMs: 630,
      startUnits: 175,
      startMs: 1750,
      cumulativeUnits: 238,
      cumulativeMs: 2380,
      startBrightness: 0,
      targetBrightness: 100,
      direction: "up",
    },
  );
  assert.equal(description.pairs[13].direction, "down");
  assert.equal(description.pairs[14].cumulativeMs, 6880);
  assert.equal(description.finalBrightness, 0);
});

test("2020 Original parses five synchronous tracks per side", () => {
  const result = Core.parseProject(original);

  assert.equal(result.valid, true);
  assert.deepEqual(result.channelIds, [1, 2, 3, 4, 5]);
  assert.deepEqual(result.left.tracks.map((track) => track.pairCount), [15, 5, 3, 3, 6]);
  assert.deepEqual(result.left.tracks.map((track) => track.duration), [6880, 1970, 1310, 1220, 2810]);
  assert.deepEqual(
    result.left.tracks.map((track) => track.data),
    result.right.tracks.map((track) => track.data),
  );
  assert.equal(result.duration, 6880);
});

test("PreLCI composite applies the verified lamp mapping", () => {
  const result = Core.parseProject(original);
  const at600 = Core.composeG20PreLci(result.left, 600);
  const at2380 = Core.composeG20PreLci(result.left, 2380);
  const atEnd = Core.composeG20PreLci(result.left, 6880);

  assert.equal(at600.drl, 43);
  assert.equal(at600.low, 46);
  assert.equal(at2380.drl, 67);
  assert.equal(at2380.low, 100);
  assert.equal(atEnd.drl, 67);
  assert.equal(atEnd.low, 14.72);
  assert.equal(atEnd.laser, 0);
});

test("v15 parses five tracks per side with the expected durations", () => {
  const result = Core.parseProject(sample);

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.left.tracks.length, 5);
  assert.equal(result.right.tracks.length, 5);
  assert.deepEqual(result.left.tracks.map((track) => track.pairCount), [15, 23, 19, 11, 9]);
  assert.deepEqual(result.left.tracks.map((track) => track.duration), [9950, 3510, 3080, 3470, 3300]);
  assert.equal(result.duration, 9950);
  assert.deepEqual(result.channelIds, [1, 2, 3, 4, 5]);
});

test("v15 keeps the shared tracks equal and the swipe tracks asymmetric", () => {
  const result = Core.parseProject(sample);

  assert.deepEqual(result.left.tracks[0].data, result.right.tracks[0].data);
  assert.notDeepEqual(result.left.tracks[1].data, result.right.tracks[1].data);
  assert.notDeepEqual(result.left.tracks[2].data, result.right.tracks[2].data);
  assert.deepEqual(result.left.tracks[3].data, result.right.tracks[3].data);
  assert.deepEqual(result.left.tracks[4].data, result.right.tracks[4].data);
});

test("DoubleSwipe&Flash is a valid selectable five-channel template", () => {
  const result = Core.parseProject(doubleSwipeFlash);
  const imported = Core.extractTemplate(doubleSwipeFlash.template);

  assert.equal(doubleSwipeFlash.name, "DoubleSwipe&Flash");
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.left.tracks.map((track) => track.pairCount), [14, 16, 11, 12, 14]);
  assert.deepEqual(result.right.tracks.map((track) => track.pairCount), [14, 18, 12, 12, 14]);
  assert.deepEqual(imported.errors, []);
  assert.equal(imported.fields.left1, doubleSwipeFlash.left1);
  assert.equal(imported.fields.right1, doubleSwipeFlash.right1);
});

test("brightness interpolation follows the cumulative duration pairs", () => {
  const result = Core.parseProject(sample);
  const lb1 = Core.trackById(result.left, 0x01);
  const leftLb2 = Core.trackById(result.left, 0x02);
  const rightLb2 = Core.trackById(result.right, 0x02);

  assert.equal(Core.brightnessAt(lb1, 2350), 0);
  assert.equal(Core.brightnessAt(lb1, 2650), 50);
  assert.equal(Core.brightnessAt(lb1, 2950), 100);
  assert.equal(Core.brightnessAt(lb1, 9200), 75);
  assert.equal(Core.brightnessAt(lb1, 9950), 50);
  assert.equal(Core.brightnessAt(leftLb2, 1230), 60);
  assert.equal(Core.brightnessAt(rightLb2, 1230), 30);
});

test("zero-duration pairs take effect at time zero", () => {
  const parsed = Core.parseSequences([0x01, 0x00, 0x01, 0x00, 0x64, 0x00, 0x00, 0x00], "测试");

  assert.equal(Core.brightnessAt(parsed.tracks[0], 0), 100);
});

test("the complete template importer recovers all four staging fields", () => {
  const imported = Core.extractTemplate(sample.template);

  assert.deepEqual(imported.errors, []);
  assert.equal(imported.fields.left1, sample.left1);
  assert.equal(imported.fields.right1, sample.right1);
  assert.equal(imported.fields.left2, "");
  assert.equal(imported.fields.right2, "");
});

test("invalid declared lengths fail instead of consuming padding", () => {
  const result = Core.parseProject({
    left1: "01, 00, 02, 32, 64",
    left2: "",
    right1: "01, 00, 01, 32, 64, 00, 00, 00",
    right2: "",
  });

  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /剩余字节不足/);
});

test("byte parser accepts 0x notation but rejects ambiguous values", () => {
  const valid = Core.parseByteString("0x01, 0A, ff");
  const invalid = Core.parseByteString("1, 0A, XYZ");

  assert.deepEqual(valid.bytes, [1, 10, 255]);
  assert.deepEqual(valid.errors, []);
  assert.equal(invalid.errors.length, 2);
});

test("curve encoder round-trips Original without changing any track data", () => {
  const parsed = Core.parseProject(original);
  const encoded = Core.encodeProject(parsed);

  assert.equal(encoded.valid, true);
  assert.equal(encoded.left.bytes.length, 420);
  assert.equal(encoded.right.bytes.length, 420);
  assert.equal(encoded.left.usedBytes, 82);
  assert.deepEqual(encoded.left.bytes.slice(79, 82), [0, 0, 0]);
  assert.ok(encoded.left.bytes.slice(82).every((byte) => byte === 0));
  const roundTrip = Core.parseProject(fieldsFromEncoded(encoded));
  assert.equal(roundTrip.valid, true);
  assert.deepEqual(
    roundTrip.left.tracks.map((track) => track.data),
    parsed.left.tracks.map((track) => track.data),
  );
  assert.deepEqual(
    roundTrip.right.tracks.map((track) => track.data),
    parsed.right.tracks.map((track) => track.data),
  );
});

test("curve encoder splits durations above one byte while preserving endpoints", () => {
  const track = {
    identifier: 0x03,
    points: [
      { time: 0, brightness: 0 },
      { time: 6000, brightness: 60 },
    ],
  };
  const encoded = Core.encodeTrack(track);
  const parsed = Core.parseSequences([...encoded.bytes, 0, 0, 0], "测试");

  assert.deepEqual(encoded.errors, []);
  assert.deepEqual(encoded.data.filter((_, index) => index % 2 === 0), [255, 255, 90]);
  assert.equal(parsed.tracks[0].duration, 6000);
  assert.equal(parsed.tracks[0].finalBrightness, 60);
  assert.equal(Core.brightnessAt(parsed.tracks[0], 2550), 26);
});

test("curve encoder keeps left and right edits independent", () => {
  const analysis = Core.parseProject(original);
  const leftCh03 = Core.trackById(analysis.left, 0x03);
  leftCh03.points[1].brightness = 80;
  leftCh03.points[1].rawBrightness = 80;

  const encoded = Core.encodeProject(analysis);
  const roundTrip = Core.parseProject(fieldsFromEncoded(encoded));

  assert.equal(Core.brightnessAt(Core.trackById(roundTrip.left, 0x03), 600), 80);
  assert.equal(Core.brightnessAt(Core.trackById(roundTrip.right, 0x03), 600), 43);
});

test("curve encoder preserves an inserted control point", () => {
  const analysis = Core.parseProject(original);
  const track = Core.trackById(analysis.left, 0x03);
  track.points.splice(2, 0, {
    time: 900,
    brightness: 31,
    rawBrightness: 31,
    duration: 300,
  });

  const encoded = Core.encodeProject(analysis);
  const roundTrip = Core.parseProject(fieldsFromEncoded(encoded));
  const insertedTrack = Core.trackById(roundTrip.left, 0x03);

  assert.equal(encoded.valid, true);
  assert.ok(insertedTrack.points.some((point) => point.time === 900 && point.brightness === 31));
  assert.equal(Core.trackById(roundTrip.right, 0x03).pairCount, 3);
});
