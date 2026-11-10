'use strict';
// FLM Probe (apps/flm_probe): a full probe sends only UDS 22 reads to the two FLM2 modules, through the
// read-only link; replies decode as the FLM02 layouts say; refusals and silence are kept apart; the
// welcome staging walk matches the FLM Light Studio's.
//   node kit/tools/test_flm_probe.js
const assert = require('assert'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const { ReadOnlyDiag, check } = require(path.join(ROOT, 'kit', 'runtime', 'readonly-diag'));
const P = require(path.join(ROOT, 'apps', 'flm_probe', 'probe'));
const DEMO = require(path.join(ROOT, 'apps', 'flm_probe', 'demo'));

const quiet = { info() {}, warn() {}, error() {} };
let checks = 0;
const ok = (c, msg) => { checks++; assert.ok(c, msg); };

/** a head unit transport that records every request and answers with the demo module */
function fakeTransport(answer) {
    const sent = [];
    let onResponse = null;
    const signals = {
        proxy: async () => ({}),
        on: async (p, ev, fn) => { onResponse = fn; },
        onAvailable: async (p, fn) => fn(true),
        call: async (p, method, a) => {
            const req = { target: a.targetAddress, sid: a.serviceID, data: Array.from(a.udsData) };
            sent.push(req);
            const uds = answer(req);
            if (uds) setTimeout(() => onResponse({ errorCode: 'NO_ERROR', udsResponse: [0, 0, 0, 0, 0, 0, req.target, 0, 0].concat(uds) }), 1);
            return 'NO_ERROR';
        },
    };
    return { signals, sent };
}

(async () => {
    // ---- decoders ----
    const sg = P.decodeSgbd([0x0F, 0x26, 0xC0]);
    ok(sg.index === '0F26C0' && sg.name === 'FLM02_L' && sg.layoutKnown, 'SGBD index of FLM02_L');
    const sg2 = P.decodeSgbd([0x0F, 0x26, 0xCC]);
    ok(sg2.name === 'FLM2_1_L' && !sg2.layoutKnown, 'FLM2_1_L is named but its layouts are not known');
    ok(P.decodeSession([0x03]).text === 'extended', 'session');
    ok(P.decodeVoltage([138]).volts === 13.8, 'voltage / 10');

    const va = P.decodeVariant([0x46, 0x2C, 0x05, 1, 2, 3, 4, 5, 6, 7, 8, 0x01, 0x00]);
    ok(va.vehicle === 'G20' && !va.lci && va.maker === 'Automotive Lighting' && va.sa === '5AZ Laserlight' && va.country === 'ECE', 'DA71 bit fields');
    ok(!va.rightHandDrive && va.valid && va.site === 'Kronach' && va.ecuVariant === '01 02 03 04 05 06 07 08', 'DA71 tail');
    const va2 = P.decodeVariant([0x47, 0x3D]);
    ok(va2.lci && va2.rightHandDrive && va2.country === 'US' && va2.sa === '5AZ Laserlight', 'DA71 LCI, RHD, US');

    const map = P.decodeLedMap(Array.from({ length: 69 }, (x, i) => i));
    ok(map.length === 23 && map[0].lamp === 'Low beam 1' && map[0].ledRaw === 0 && map[22].lamp === 'Laser accent 2', 'D9FC lamp order');
    ok(map[1].led === 1 && map[1].binning === 24 && map[1].ntc === 47, 'D9FC channel / binning / NTC columns');
    // the G20 5AZ's own map (2026-11-10): DRL 1/2/3 on channels 5/6/12, turn signal on 1, laser on 11
    const real = P.decodeLedMap('02 06 07 08 02 04 06 07 08 09 0A 0B 00 00 05 06 0C 00 01 00 0B 05 00 02 01 02 03 02 04 01 02 03 06 07 0F 00 00 01 01 01 00 05 00 0F 01 00 0D 0E 0D 0C 0D 0B 0E 0D 0C 09 08 00 00 00 0D 0E 0E 00 0E 00 00 0D 00'.split(' ').map((h) => parseInt(h, 16)));
    ok(real[14].led === 5 && real[15].led === 6 && real[16].led === 12 && real[18].led === 1 && real[20].led === 11 && real[21].led === 5, 'real G20 5AZ map');
    ok(!P.wired(map[0]) && P.wired(map[1]) && !P.wired({ ledRaw: 0xFF }), 'unwired lamps');
    ok(P.decodeLedMap([1, 2]) === null, 'D9FC too short');

    const ch = P.decodeChannels([50, 0x01, 0x2C, 12, 1].concat(new Array(70).fill(0)));
    ok(ch.length === 15 && ch[0].pwm === 50 && ch[0].currentMa === 300 && ch[0].volts === 12 && ch[0].phase === 1 && ch[14].channel === 15, 'D6DB 15 x 5 bytes');

    const fn = P.decodeFunctions(new Array(48).fill(0).map((x, i) => (i === 4 ? 1 : 0)));
    ok(fn.length === 48 && fn[4].code === 'DRL' && fn[4].side === 'L' && fn[4].value === 1 && fn[24].side === 'R' && fn[24].code === 'IDC', 'D7A7 order');
    ok(P.FUNCTIONS.length === 48, '48 function bytes');

    // ---- replies ----
    ok(P.parseReply([0x62, 0xF1, 0x50, 1, 2, 3], 0xF150).status === 'ok', 'positive reply');
    ok(P.parseReply([0x7F, 0x22, 0x31], 0xF150).nrc === 0x31, 'refusal keeps its code');
    ok(P.parseReply(null, 0xF150).status === 'timeout' && P.parseReply(undefined, 0xF150).status === 'cancelled', 'silence vs cancelled');
    ok(P.parseReply([0x62, 0xD9, 0xFC, 1], 0xF150).status === 'odd', 'another identifier\'s reply is not this one');

    // ---- staging: the same walk as the FLM Light Studio (01 00 0F ... is 33 bytes) ----
    const s1 = [0x01, 0x00, 0x02, 0x32, 0x00, 0x32, 0x64, 0x02, 0x00, 0x01, 0x0A, 0x1E, 0x00, 0x00, 0x00];
    const st = P.decodeStaging(s1, []);
    ok(st.tracks.length === 2 && st.tracks[0].id === '01' && st.tracks[0].pairs === 2 && st.tracks[0].units === 100 && st.tracks[0].finalBrightness === 100, 'track 1');
    ok(st.tracks[1].offset === 7 && st.tracks[1].units === 10 && st.ended && st.used === 15 && !st.error, 'track 2 and the end header');
    // a track that crosses the 252-byte boundary is read across it: 125 pairs fill bytes 3-252, so the last
    // time byte is Staging1's last and its brightness Staging2's first (as G20 2023 EU CH0D does)
    const big = new Array(252).fill(0x01); big[0] = 0x0D; big[1] = 0x00; big[2] = 0x7D;
    const st2 = P.decodeStaging(big, [0x1E, 0x00, 0x00, 0x00]);
    ok(st2.tracks.length === 1 && st2.tracks[0].pairs === 125 && st2.tracks[0].finalBrightness === 0x1E && st2.ended && st2.used === 256, 'record across Staging1 / Staging2');
    const st3 = P.decodeStaging([0x01, 0xFF, 0xFF], null);
    ok(st3.error && st3.tracks.length === 0, 'a count past 420 bytes is reported, not read');
    ok(P.decodeStaging(null, null) === null, 'no Staging1, no walk');
    ok(/^[0-9a-f]{64}$/.test(st.sha256), 'SHA-256 of the 420 bytes');

    // ---- the whole probe through the read-only link: only 22, only 0x43 / 0x44 ----
    const fake = fakeTransport((req) => DEMO.reply(req.target, (req.data[0] << 8) | req.data[1], 0));
    const link = await new ReadOnlyDiag(fake.signals, quiet, { gapMs: 1 }).init();
    const steps = [];
    const r = await P.runProbe((addr, did, ms) => link.read(addr, did, ms), { onStep: (d, n) => steps.push([d, n]) });
    ok(fake.sent.length === P.READS.length * 2, 'one request per read per side (' + fake.sent.length + ')');
    ok(fake.sent.every((q) => q.sid === 0x22), 'every request is 22 ReadDataByIdentifier');
    ok(fake.sent.every((q) => q.target === 0x43 || q.target === 0x44), 'only the two FLM2 addresses');
    ok(steps.length === 18 && steps[17][0] === 18, 'progress reported');
    ok(r.sides.left.reads.sgbd.value.name === 'FLM02_L' && r.sides.right.reads.sgbd.value.name === 'FLM02_R', 'both sides identified');
    ok(r.sides.left.reads.variant.value.sa === '5AZ Laserlight', 'variant decoded in the run');
    ok(r.sides.left.reads.staging2.status === 'refused' && r.sides.left.reads.staging2.nrc === '0x31', 'refused read kept with its code');
    ok(r.sides.left.staging && r.sides.left.staging.tracks.length === 2, 'staging walked from the read bytes');
    ok(typeof r.sides.left.reads.ledMap.raw === 'string' && r.sides.left.reads.ledMap.length === 69, 'raw bytes kept for the export');
    ok(!Object.keys(r.sides.left).some((k) => /Bytes$/.test(k)), 'no byte arrays left in the saved result');
    JSON.stringify(r);   // must serialise

    // ---- the link itself refuses anything that would act on the module ----
    for (const [sid, data] of [[0x31, [0x01, 0xA5, 0x4B, 0x01, 0x32, 0x02]], [0x2E, [0xD6, 0xDC, 0x00, 0x39, 0x02]], [0x2F, [0x60, 0xFD, 0x00]], [0x10, [0x03]], [0x11, [0x01]]]) {
        let threw = false;
        try { check(0x43, sid, data, false); } catch (e) { threw = true; }
        ok(threw, 'read-only link refuses service 0x' + sid.toString(16));
    }

    // ---- recording: only 22 D6DB / D7A7, on a clock, both sides, silent units woken and counted ----
    const { Recording, series } = require(path.join(ROOT, 'apps', 'flm_probe', 'record'));
    let clock = 0;
    const asked = [], woken = [];
    // a fake module pair: each read takes 40 ms; channel 2 on the left ramps 0 -> 100 % over the first second;
    // the right module is silent between 400 and 800 ms
    const fakeRead = async (addr, did) => {
        asked.push([addr, did]);
        clock += 40;
        if (addr === 0x44 && clock > 400 && clock < 800) return null;
        const t = clock;
        if (did === 0xD6DB) {
            const d = new Array(75).fill(0);
            if (addr === 0x43) d[5] = Math.min(100, Math.round(t / 10));      // channel 2's PWM byte
            d[25] = 31;                                                        // channel 6 steady at 31 %
            return [0x62, 0xD6, 0xDB].concat(d);
        }
        const f = new Array(48).fill(0xFF);
        for (let k = 0; k < 24; k++) f[(addr === 0x43 ? 0 : 24) + k] = k === 10 ? 1 : 0;   // WELL group 1 = 1
        return [0x62, 0xD7, 0xA7].concat(f);
    };
    const recd = await new Recording(fakeRead, { seconds: 2, fnEvery: 5, now: () => clock, sleep: async (ms) => { clock += ms; }, wake: (a) => woken.push(a) }).run();
    ok(asked.every(([a, did]) => (a === 0x43 || a === 0x44) && (did === 0xD6DB || did === 0xD7A7)), 'recording reads only D6DB / D7A7 of the two modules');
    ok(recd.durationMs >= 2000 && recd.durationMs < 2300 && !recd.stoppedEarly, 'recording stops on time');
    const left = recd.samples.filter((s) => s.side === 'left'), right = recd.samples.filter((s) => s.side === 'right');
    ok(left.length > 15 && right.length > 10 && right.length < left.length, 'samples from both sides, fewer while the right was silent');
    ok(recd.misses.right > 0 && recd.misses.left === 0 && woken.every((a) => a === 0x44) && woken.length === recd.misses.right, 'silent reads counted and the unit woken');
    ok(left.every((s, i) => s.got >= s.sent && (i === 0 || s.sent >= left[i - 1].got)), 'times run forward, each sample after the last');
    ok(left[left.length - 1].pwm[1] === 100 && left[0].pwm[1] < 10 && left[0].pwm[5] === 31, 'PWM decoded per channel');
    ok(recd.stats.left.channelsThatMoved.join() === '2' && recd.stats.right.channelsThatMoved.length === 0, 'channels that moved');
    ok(recd.functions.length >= 4 && recd.functions[0].well.join() === '1,0' && /^[0-9A-F ]+$/.test(recd.functions[0].raw), 'D7A7 WELL bytes kept');
    const ser = series(recd, 'left');
    ok(ser.length === 15 && ser[1].points.length === left.length && ser[1].points[0][0] === left[0].got, 'series per channel');
    JSON.stringify(recd);

    // stop() ends it early
    clock = 0;
    const r2 = new Recording(fakeRead, { seconds: 60, now: () => clock, sleep: async (ms) => { clock += ms; }, onSample: (s) => { if (s.got > 500) r2.stop(); } });
    const d2 = await r2.run();
    ok(d2.stoppedEarly && d2.durationMs < 1000, 'stop() ends the recording');

    // neither module answering: it waits between rounds instead of spinning
    clock = 0;
    let calls = 0;
    const d3 = await new Recording(async () => { calls++; return null; }, { seconds: 2, now: () => clock, sleep: async (ms) => { clock += ms; } }).run();
    ok(d3.samples.length === 0 && calls <= 2 * 21 + 2 * 3 && d3.misses.left > 0, 'no busy loop without answers (' + calls + ' reads)');

    console.log('flm_probe: ' + checks + ' checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
