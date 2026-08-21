const test = require("node:test");
const assert = require("node:assert/strict");

const Backup = require("../bimmercode.js");

const LEFT_FIXTURE = "YnBsaXN0MDDUAQIDBAUGBwpZJGFyY2hpdmVyWCR2ZXJzaW9uVCR0b3BYJG9iamVjdHNfEA9OU0tleWVkQXJjaGl2ZXISAAGGoNEICVRyb290gAGsCwwTFBkaHyAlKisuVSRudWxs0w0ODxARElNWSU5ZY29kaW5nRUNVWmNvZGluZ0RhdGGAAoADgAVfEBJURVNUVklOMDAwMDAwMDAwMDDSFRYXGFdhZGRyZXNzWmlkZW50aWZpZXIQQ4AEVjBGMjZDMNIbHB0eXkNBRkRJZGVudGlmaWVyXxAXbXV0YWJsZUNvZGluZ0RhdGFCbG9ja3OABoAHWFRFU1RDQUZE0SEiWk5TLm9iamVjdHOiIySACIAK0iYnKClcYmxvY2tBZGRyZXNzVGRhdGERMAmACU8Q/AEAAQEKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAANImJywtETAKgAtPEKgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAARABsAJAApADIARABJAEwAUQBTAGAAZgBtAHEAewCGAIgAigCMAKEApgCuALkAuwC9AMQAyQDYAPIA9AD2AP8BAgENARABEgEUARkBJgErAS4BMAIvAjQCNwI5AAAAAAAAAgEAAAAAAAAALwAAAAAAAAAAAAAAAAAAAuQ=";
const RIGHT_FIXTURE = "YnBsaXN0MDDUAQIDBAUGBwpZJGFyY2hpdmVyWCR2ZXJzaW9uVCR0b3BYJG9iamVjdHNfEA9OU0tleWVkQXJjaGl2ZXISAAGGoNEICVRyb290gAGsCwwTFBkaHyAlKisuVSRudWxs0w0ODxARElNWSU5ZY29kaW5nRUNVWmNvZGluZ0RhdGGAAoADgAVfEBJURVNUVklOMDAwMDAwMDAwMDDSFRYXGFdhZGRyZXNzWmlkZW50aWZpZXIQRIAEVjBGMjZEMNIbHB0eXkNBRkRJZGVudGlmaWVyXxAXbXV0YWJsZUNvZGluZ0RhdGFCbG9ja3OABoAHWFRFU1RDQUZE0SEiWk5TLm9iamVjdHOiIySACIAK0iYnKClcYmxvY2tBZGRyZXNzVGRhdGERMAmACU8Q/AEAAQEKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAANImJywtETAKgAtPEKgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAARABsAJAApADIARABJAEwAUQBTAGAAZgBtAHEAewCGAIgAigCMAKEApgCuALkAuwC9AMQAyQDYAPIA9AD2AP8BAgENARABEgEUARkBJgErAS4BMAIvAjQCNwI5AAAAAAAAAgEAAAAAAAAALwAAAAAAAAAAAAAAAAAAAuQ=";

function fixture(base64) {
  return new Uint8Array(Buffer.from(base64, "base64"));
}

function assertOnlyStagingChanged(before, after, info) {
  const writable = [info.staging1, info.staging2];
  assert.equal(before.length, after.length);
  before.forEach((byte, index) => {
    const insideStaging = writable.some(
      (block) => index >= block.payloadOffset && index < block.payloadOffset + block.length,
    );
    if (!insideStaging) assert.equal(after[index], byte, `unexpected change at byte ${index}`);
  });
}

test("binary plist inspector identifies the left and right FLM2 backups", () => {
  const left = Backup.inspectBackup(fixture(LEFT_FIXTURE), "0F26C0-TESTVIN00000000000-100.cod");
  const right = Backup.inspectBackup(fixture(RIGHT_FIXTURE), "0F26D0-TESTVIN00000000000-100.cod");

  assert.equal(left.side, "left");
  assert.equal(left.ecuAddress, 0x43);
  assert.equal(left.identifier, "0F26C0");
  assert.equal(right.side, "right");
  assert.equal(right.ecuAddress, 0x44);
  assert.equal(right.identifier, "0F26D0");
  assert.equal(left.vin, "TESTVIN00000000000");
  assert.equal(left.staging1.length, 252);
  assert.equal(left.staging2.length, 168);
  assert.equal(Backup.checkPair(left, right), true);
});

test("patcher changes only Staging1 and Staging2 NSData payloads", () => {
  const source = fixture(LEFT_FIXTURE);
  const info = Backup.inspectBackup(source, "left.cod");
  const staging1 = Uint8Array.from({ length: 252 }, (_, index) => index & 0xff);
  const staging2 = Uint8Array.from({ length: 168 }, (_, index) => (255 - index) & 0xff);
  const result = Backup.patchBackup(info, staging1, staging2);

  assert.deepEqual([...result.info.staging1.data], [...staging1]);
  assert.deepEqual([...result.info.staging2.data], [...staging2]);
  assertOnlyStagingChanged(source, result.bytes, info);
});

test("pair validator rejects an ECU side mismatch", () => {
  const left = Backup.inspectBackup(fixture(LEFT_FIXTURE), "left.cod");
  assert.throws(() => Backup.checkPair(left, left), /RIGHT.*0x44/);
});

test("download names share the supplied timestamp and ZIP stores both files", () => {
  assert.equal(
    Backup.outputName("0F26C0-TESTVIN00000000000-100.cod", 123456),
    "0F26C0-TESTVIN00000000000-123456.cod",
  );
  assert.equal(Backup.outputName("custom.cod", 123456), "custom-modified-123456.cod");

  const zip = Backup.createZip([
    { name: "left.cod", bytes: Uint8Array.of(1, 2, 3) },
    { name: "right.cod", bytes: Uint8Array.of(4, 5, 6) },
  ], new Date(2026, 7, 21, 12, 0, 0));
  const text = Buffer.from(zip).toString("latin1");

  assert.equal(new DataView(zip.buffer).getUint32(0, true), 0x04034b50);
  assert.match(text, /left\.cod/);
  assert.match(text, /right\.cod/);
  assert.equal(new DataView(zip.buffer).getUint32(zip.length - 22, true), 0x06054b50);
});

test("non-binary-plist input is rejected", () => {
  assert.throws(() => Backup.inspectBackup(Uint8Array.of(1, 2, 3), "bad.cod"), /binary plist/);
});
