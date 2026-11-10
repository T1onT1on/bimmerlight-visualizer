'use strict';
// FLM Lab (apps/flm_lab): the exact request bytes, the extended-session and 1-byte-LV fallbacks, nothing sent
// while the car moves, shows run in order and stop (by Stop or by moving), and fault reads decode.
//   node kit/tools/test_flm_lab.js
const assert = require('assert'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
// lab.js requires './kit/diag' as the built app has it; point that at the kit's runtime for the test
const Module = require('module');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, parent, ...rest) {
    if (req === './kit/diag') return path.join(ROOT, 'kit', 'runtime', 'diag.js');
    return origResolve.call(this, req, parent, ...rest);
};
const { Lab, CMD, FUNCTIONS, CHANNELS } = require(path.join(ROOT, 'apps', 'flm_lab', 'lab'));
const { SHOWS } = require(path.join(ROOT, 'apps', 'flm_lab', 'shows'));

let checks = 0;
const ok = (c, msg) => { checks++; assert.ok(c, msg); };
const quiet = { info() {}, warn() {}, error() {} };
const hx = (c) => [c.sid].concat(c.data).map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');

/** a module pair that records requests; answer(target, sid, data) -> reply bytes or null */
function fakeDiag(answer) {
    const sent = [];
    return {
        sent,
        async physical(target, sid, data) {
            sent.push({ target, sid, data: data.slice(), hex: [sid].concat(data).map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ') });
            return answer(target, sid, data);
        },
    };
}
const positive = (target, sid, data) => (sid === 0x19 ? [0x59, 0x02, 0xFF] : [sid + 0x40].concat(data.slice(0, 3)));

(async () => {
    // ---- request bytes ----
    ok(hx(CMD.functionOn(0x39, 10, 2)) === '2E D6 DC 00 39 0A', 'welcome 1, 2-byte LV');
    ok(hx(CMD.functionOn(0x39, 10, 1)) === '2E D6 DC 39 0A', 'welcome 1, 1-byte LV');
    ok(hx(CMD.channelOn(12, 50, 2)) === '31 01 A5 4B 0C 32 02', 'channel 12 at 50 % for 2 s');
    ok(hx(CMD.channelOn(0, 150, 300)) === '31 01 A5 4B 00 64 FF', 'PWM capped at 100, seconds at 255');
    ok(hx(CMD.channelStop()) === '31 02 A5 4B' && hx(CMD.session(3)) === '10 03' && hx(CMD.session(1)) === '10 01', 'stop and sessions');
    ok(hx(CMD.readFaults()) === '19 02 0C' && hx(CMD.clearFaults()) === '14 FF FF FF' && hx(CMD.testerPresent()) === '3E 00', 'faults and tester present');
    ok(FUNCTIONS.some((f) => f.lv === 0x39) && FUNCTIONS.some((f) => f.lv === 0x40) && CHANNELS[12] === 'DRL 3' && CHANNELS[0] === 'All channels', 'tables');

    // ---- a function on both modules: left first, one request each ----
    let d = fakeDiag(positive);
    let lab = new Lab(d, quiet);
    let r = await lab.playFunction(0x39, 10, 'B');
    ok(d.sent.length === 2 && d.sent[0].target === 0x43 && d.sent[1].target === 0x44 && r.every((x) => x.ok), 'both modules, left first');
    ok(lab.entries.length === 2 && lab.entries[0].addr === '44' && lab.entries[0].request === '2E D6 DC 00 39 0A', 'logged newest first');

    // ---- refused in the default session: extended session, then again; Stop goes back to default ----
    let inExt = {};
    d = fakeDiag((t, sid, data) => {
        if (sid === 0x10) { inExt[t] = data[0] === 3; return [0x50, data[0]]; }
        if ((sid === 0x31 || sid === 0x2E) && !inExt[t]) return [0x7F, sid, 0x7F];
        return positive(t, sid, data);
    });
    lab = new Lab(d, quiet, { keepAliveMs: 60000 });
    r = await lab.channel('L', 12, 100, 2);
    ok(r[0].ok && d.sent.map((s) => s.hex).join(' | ') === '31 01 A5 4B 0C 64 02 | 10 03 | 31 01 A5 4B 0C 64 02', 'extended session on 7F, then sent again');
    ok(lab.extended[0x43] && !lab.extended[0x44] && lab.timer, 'session kept alive for that module');
    d.sent.length = 0;
    await lab.stopAll();
    ok(d.sent.map((s) => s.target.toString(16) + ':' + s.hex).join(' | ') === '43:31 02 A5 4B | 43:10 01 | 44:31 02 A5 4B', 'stop: routine stop on both, default session where we left it');
    ok(!lab.extended[0x43] && !lab.timer, 'session and keep-alive dropped');

    // ---- bad length for the 2-byte LV: the 1-byte form, remembered ----
    d = fakeDiag((t, sid, data) => (sid === 0x2E && data.length === 5 ? [0x7F, 0x2E, 0x13] : positive(t, sid, data)));
    lab = new Lab(d, quiet);
    await lab.playFunction(0x40, 6, 'R');
    await lab.playFunction(0x39, 6, 'R');
    ok(d.sent.map((s) => s.hex).join(' | ') === '2E D6 DC 00 40 06 | 2E D6 DC 40 06 | 2E D6 DC 39 06', '1-byte LV after NRC 13, kept');

    // ---- nothing while moving ----
    let moving = true;
    d = fakeDiag(positive);
    lab = new Lab(d, quiet, { moving: () => moving });
    r = await lab.playFunction(0x39, 10, 'B');
    ok(d.sent.length === 0 && r.every((x) => !x.ok && /moving/.test(x.text)), 'not sent while moving');
    await lab.runShow(SHOWS[2]);
    ok(d.sent.length === 0 && !lab.show, 'no show while moving');

    // ---- a show runs its steps in order, loops, and waits from when each step was sent ----
    moving = false;
    let clock = 0;
    const waits = [];
    d = fakeDiag(positive);
    lab = new Lab(d, quiet, { moving: () => moving, now: () => clock, sleep: async (ms) => { waits.push(ms); clock += ms; } });
    const pingpong = SHOWS.find((s) => s.name === 'DRL ping-pong');
    await lab.runShow(pingpong, 2);
    ok(d.sent.length === 8 && d.sent.slice(0, 4).map((s) => s.target.toString(16) + ':' + s.hex.slice(-11)).join(' | ') === '43:4B 0C 64 01 | 43:4B 0C 00 01 | 44:4B 0C 64 01 | 44:4B 0C 00 01', 'ping-pong steps in order');
    ok(waits.length === 4 && waits.every((w) => w === 600) && !lab.show, 'waits after the lit steps, show ends');

    // ---- Stop during a show ends it ----
    clock = 0;
    d = fakeDiag(positive);
    lab = new Lab(d, quiet, { moving: () => moving, now: () => clock, sleep: async (ms) => { clock += ms; if (clock > 1000) await lab.stopAll(); } });
    await lab.runShow(SHOWS.find((s) => s.name === 'Blue accent pulse'));
    const lit = d.sent.filter((s) => s.sid === 0x31 && s.data[0] === 0x01).length;
    ok(lit < 10 && d.sent.some((s) => s.hex === '31 02 A5 4B') && !lab.show, 'Stop ends the show (' + lit + ' steps sent)');

    // ---- moving during a show: stop, control back ----
    clock = 0; moving = false;
    let n = 0;
    d = fakeDiag((t, sid, data) => { if (++n === 5) moving = true; return positive(t, sid, data); });   // starts moving at the 5th request
    lab = new Lab(d, quiet, { moving: () => moving, now: () => clock, sleep: async (ms) => { clock += ms; } });
    await lab.runShow(SHOWS.find((s) => s.name === 'DRL breathe'));
    ok(!lab.show && d.sent.some((s) => s.hex === '31 02 A5 4B') && d.sent.filter((s) => s.hex.startsWith('31 01')).length < 21, 'moving stops the show and hands control back');

    // ---- faults ----
    d = fakeDiag((t, sid) => (sid === 0x19 ? (t === 0x43 ? [0x59, 0x02, 0xFF, 0x80, 0x1C, 0xE5, 0x2F] : [0x59, 0x02, 0xFF]) : null));
    lab = new Lab(d, quiet);
    const f = await lab.readFaults();
    ok(f[0x43].ok && f[0x43].dtcs.length === 1 && f[0x43].dtcs[0].code === '801CE5' && f[0x44].dtcs.length === 0, 'faults decoded per module');
    d = fakeDiag(() => null);
    lab = new Lab(d, quiet);
    r = await lab.channel('B', 5, 100, 1);
    ok(r.every((x) => !x.ok && x.text === 'no answer'), 'silence reported');

    // ---- shows only use the services the app is meant to send ----
    ok(SHOWS.every((s) => s.steps.every((st) => (st.fn !== undefined ? FUNCTIONS.some((x) => x.lv === st.fn) : st.ch >= 0 && st.ch <= 15 && st.pwm >= 0 && st.pwm <= 100))), 'show steps are valid functions / channels');

    // ---- Lightning: low beam only (channels 2 and 7), left x2 with the right off, right x2 with the left off, both x2 ----
    const lightning = SHOWS.find((s) => s.name === 'Lightning');
    ok(lightning && lightning.steps.every((st) => st.ch === 2 || st.ch === 7), 'Lightning uses low beam channels only');
    clock = 0; moving = false;
    d = fakeDiag((t, sid, data) => { clock += 200; return positive(t, sid, data); });   // 200 ms a command
    lab = new Lab(d, quiet, { moving: () => moving, now: () => clock, sleep: async (ms) => { clock += ms; } });
    await lab.runShow(lightning, 1);
    const seq = d.sent.map((s) => (s.target === 0x43 ? 'L' : 'R') + s.data[3] + ':' + s.data[4]).join(' ');
    ok(seq === [
        'R2:0 R7:0',
        'L2:100 L7:100 L2:0 L7:0', 'L2:100 L7:100 L2:0 L7:0',
        'L2:0 L7:0',
        'R2:100 R7:100 R2:0 R7:0', 'R2:100 R7:100 R2:0 R7:0',
        'L2:100 R2:100 L7:100 R7:100 L2:0 R2:0 L7:0 R7:0', 'L2:100 R2:100 L7:100 R7:100 L2:0 R2:0 L7:0 R7:0',
    ].join(' '), 'Lightning order: ' + seq);
    // one-side flashes about a second apart: from one flash's first "on" to the next one's
    const ons = [];
    d.sent.forEach((s, i) => { if (s.target === 0x43 && s.data[3] === 2 && s.data[4] === 100) ons.push(i); });
    ok(ons.length === 4, 'four left flashes (two alone, two with the right)');
    const opposite = d.sent.find((s) => s.target === 0x44 && s.data[4] === 0);
    ok(opposite && opposite.data[5] === 3, 'the other side held off for 3 s');

    console.log('flm_lab: ' + checks + ' checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
