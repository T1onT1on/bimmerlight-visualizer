'use strict';
/**
 * lab.js - FLM Lab's commands to the two front light modules (FLM2, left 0x43 / right 0x44).
 *
 * EXPERIMENTAL: these requests switch lights. They are BMW's own FLM02 jobs (SGBD FLM02_L / FLM02_R,
 * revision 2.200, as published by the EdiabasX SGBD Reference), but the byte layouts below were worked out
 * from the SGBD tables and were not seen on a car before this app:
 *
 *   FLM_FUNKTION_LICHTVERTEILUNG  2E D6 DC <LV hi> <LV lo> <seconds>   a light function (welcome, goodbye, DRL, ...)
 *                                 (LV is a signed int: 2 bytes; a module that answers "bad length" gets 1 byte)
 *   FLM_KANAL start               31 01 A5 4B <channel> <PWM %> <seconds>   one LED channel, or 0 = all of them
 *   FLM_KANAL stop                31 02 A5 4B
 *   session                       10 03 (extended) / 10 01 (default), kept up with 3E 00
 *   faults                        19 02 0C read, 14 FF FF FF clear
 *
 * seconds: how long the module holds it (255 = until stopped). Nothing else is implemented: no LED current,
 * no stepper motors, no resets, no coding writes.
 *
 * The one gate: no command while the car moves (above 3 km/h, kit/parked.js); a show stops and the
 * modules get control back when it starts moving.
 */
const { hex, NRC, replyTo, parseDtcReply } = require('./kit/diag');

const SIDES = Object.freeze([
    { key: 'left', label: 'Left [43]', short: 'L', addr: 0x43 },
    { key: 'right', label: 'Right [44]', short: 'R', addr: 0x44 },
]);
const ADDR = { L: [0x43], R: [0x44], B: [0x43, 0x44] };

// TAB_LF_LV_FRONT_ARG (FLM02 rev 2.200): every light function the module takes
const FUNCTIONS = Object.freeze([
    [0x39, 'Welcome light 1'], [0x3A, 'Welcome light 2'], [0x3B, 'Welcome light 3'], [0x3C, 'Welcome light 4'], [0x3D, 'Welcome light 5'],
    [0x40, 'Goodbye light 1'], [0x41, 'Goodbye light 2'], [0x42, 'Goodbye light 3'], [0x43, 'Goodbye light 4'], [0x44, 'Goodbye light 5'],
    [0x33, 'Daytime running light'], [0x34, 'Cornering light'], [0x35, 'Position light 1'], [0x36, 'Position light 2'],
    [0x37, 'Position light 3'], [0x38, 'Parking light'], [0x3E, 'Follow me home'], [0x3F, 'Remote light'],
    [0x45, 'High beam flash'], [0x46, 'Hold-up alarm'], [0x47, 'Alarm system flash'], [0x48, 'Panic mode'],
    [0x49, 'Flashing'], [0x4A, 'Flashing 2'], [0x4B, 'ECO+ dimming 1'], [0x4C, 'ECO+ dimming 2'], [0x4D, 'ECO+ dimming 3'], [0x4E, 'SML'],
    [0x01, 'Low beam LV1 bad weather C1'], [0x02, 'Low beam LV2 bad weather C2'], [0x03, 'Low beam LV3 town'], [0x04, 'Low beam LV4 SAE'],
    [0x05, 'Low beam LV5 country'], [0x06, 'Low beam LV6 motorway E3'], [0x07, 'Low beam LV7 motorway E2'], [0x08, 'Low beam LV8 motorway E1'],
    [0x09, 'Low beam LV9 motorway E'], [0x0A, 'Low beam LV10 H2'], [0x0B, 'Low beam LV11 H0'], [0x0C, 'Low beam LV12 H+2'], [0x0D, 'Low beam LV13 H+4'],
    [0x0E, 'Glare-free high beam'], [0x0F, 'High beam mode 1a'], [0x10, 'High beam mode 1b'], [0x11, 'High beam mode 2a'], [0x12, 'High beam mode 2b'],
    [0x13, 'High beam mode 3a'], [0x14, 'High beam mode 3b'],
].map(([lv, name]) => Object.freeze({ lv, name })));

// physical LED channels of a G20 PreLCI 5AZ (FLM Probe D9FC, 2026-11-10); 0 = every channel at once
const CHANNELS = Object.freeze({
    0: 'All channels', 1: 'Turn signal', 2: 'Low 1 / high 1', 3: '(none)', 4: 'High 2', 5: 'DRL 1 / blue accent',
    6: 'Low 2 / high 3 / DRL 2', 7: 'Low 3 / high 4', 8: 'Low 4 / high 5', 9: 'High 6', 10: 'High 7', 11: 'High 8 / laser',
    12: 'DRL 3', 13: '(none)', 14: '(none)', 15: '(none)',
});

const byte = (n) => Math.max(0, Math.min(255, Math.round(n))) & 0xFF;
const toHex = (b) => (b || []).map((x) => hex(x)).join(' ');

const CMD = {
    functionOn(lv, seconds, width) {
        const v = lv & 0xFFFF;
        const lvBytes = width === 1 ? [v & 0xFF] : [(v >> 8) & 0xFF, v & 0xFF];
        return { sid: 0x2E, data: [0xD6, 0xDC].concat(lvBytes, [byte(seconds)]), what: 'function 0x' + hex(lv) + ' for ' + seconds + ' s' };
    },
    channelOn(channel, pwm, seconds) {
        return { sid: 0x31, data: [0x01, 0xA5, 0x4B, byte(channel), byte(Math.min(100, pwm)), byte(seconds)],
            what: (channel ? 'channel ' + channel : 'all channels') + ' ' + pwm + ' % for ' + seconds + ' s' };
    },
    channelStop() { return { sid: 0x31, data: [0x02, 0xA5, 0x4B], what: 'stop channels' }; },
    session(n) { return { sid: 0x10, data: [n], what: n === 3 ? 'extended session' : 'default session' }; },
    testerPresent() { return { sid: 0x3E, data: [0x00], what: 'tester present' }; },
    readFaults() { return { sid: 0x19, data: [0x02, 0x0C], what: 'read faults' }; },
    clearFaults() { return { sid: 0x14, data: [0xFF, 0xFF, 0xFF], what: 'clear faults' }; },
};

/** A module reply -> { ok, nrc, text } */
function verdict(uds, sid) {
    if (!uds) return { ok: false, nrc: null, text: 'no answer' };
    if (uds[0] === 0x7F) return { ok: false, nrc: uds[2], text: 'refused ' + hex(uds[2]) + (NRC[uds[2]] ? ' ' + NRC[uds[2]] : '') };
    if (uds[0] === sid + 0x40) return { ok: true, nrc: null, text: 'OK' };
    return { ok: false, nrc: null, text: 'unexpected ' + toHex(uds.slice(0, 4)) };
}

class Lab {
    /**
     * diag: kit/diag.js Diag (physical(target, sid, data, timeoutMs, accept)).
     * opts: moving() (true while the car drives), now(), sleep(ms), onLog(entry), onChange(), keepAliveMs.
     */
    constructor(diag, log, opts) {
        const o = opts || {};
        this.diag = diag;
        this.log = log;
        this.moving = o.moving || (() => false);
        this.now = o.now || Date.now;
        this.sleep = o.sleep || ((ms) => new Promise((res) => setTimeout(res, ms)));
        this.onLog = o.onLog || null;
        this.onChange = o.onChange || null;
        this.keepAliveMs = o.keepAliveMs || 2000;
        this.chain = Promise.resolve();
        this.extended = {};            // address -> true while we put it in the extended session
        this.lvWidth = {};             // address -> 2 or 1 (bytes of LV that module takes)
        this.lastSent = {};            // address -> time of our last request (keep-alive)
        this.entries = [];             // the last commands, newest first
        this.show = null;              // { name, step, steps } while a show runs
        this.stopGen = 0;              // counted up by stopAll(): a show still running ends
        this.faults = {};              // address -> { at, ok, text, dtcs }
        this.timer = null;
    }

    changed() { if (this.onChange) try { this.onChange(); } catch (e) { /* drawing only */ } }

    /** Run fn after every command before it (one request on the link at a time). */
    queue(fn) {
        const p = this.chain.then(fn, fn);
        this.chain = p.catch(() => {});
        return p;
    }

    /** One request to one module, logged. Resolves { ok, nrc, text, reply, ms }. */
    raw(addr, cmd, timeoutMs) {
        return this.queue(async () => {
            const t0 = this.now();
            let uds = null, err = null;
            try {
                uds = await this.diag.physical(addr, cmd.sid, cmd.data, timeoutMs || 2500, replyTo(cmd.sid, cmd.data));
            } catch (e) { err = String(e && e.message || e); }
            this.lastSent[addr] = this.now();
            const v = err ? { ok: false, nrc: null, text: err } : verdict(uds, cmd.sid);
            const entry = { at: new Date().toISOString(), addr: hex(addr), request: hex(cmd.sid) + ' ' + toHex(cmd.data), what: cmd.what,
                reply: toHex(uds), ok: v.ok, nrc: v.nrc, text: v.text, ms: this.now() - t0 };
            this.entries.unshift(entry);
            if (this.entries.length > 60) this.entries.length = 60;
            if (this.onLog) try { this.onLog(entry); } catch (e) { /* log file only */ }
            this.changed();
            return Object.assign({ uds }, entry);
        });
    }

    /**
     * A lighting command to one module: refused for the session (7E / 7F) -> extended session and again once;
     * a function the module answers "bad length" (13) -> the 1-byte LV form and again once.
     */
    async command(addr, make) {
        if (this.moving()) return { ok: false, text: 'car is moving: not sent' };
        let cmd = make(this.lvWidth[addr] || 2);
        let r = await this.raw(addr, cmd);
        if (!r.ok && (r.nrc === 0x7E || r.nrc === 0x7F) && !this.extended[addr]) {
            const s = await this.raw(addr, CMD.session(3));
            if (s.ok) { this.extended[addr] = true; this.startKeepAlive(); }
            r = await this.raw(addr, cmd);
        }
        if (!r.ok && r.nrc === 0x13 && cmd.sid === 0x2E && (this.lvWidth[addr] || 2) === 2) {
            this.lvWidth[addr] = 1;
            cmd = make(1);
            r = await this.raw(addr, cmd);
        }
        return r;
    }

    sides(which) { return ADDR[which] || ADDR.B; }

    async playFunction(lv, seconds, which) {
        const out = [];
        for (const a of this.sides(which)) out.push(await this.command(a, (w) => CMD.functionOn(lv, seconds, w)));
        return out;
    }

    async channel(which, ch, pwm, seconds) {
        const out = [];
        for (const a of this.sides(which)) out.push(await this.command(a, () => CMD.channelOn(ch, pwm, seconds)));
        return out;
    }

    /** Stop everything: any show, the channel routine on both modules, and the extended session. */
    async stopAll(reason) {
        this.stopGen++;
        this.show = null;
        if (reason) this.log.info('stop: ' + reason);
        for (const s of SIDES) {
            await this.raw(s.addr, CMD.channelStop());
            if (this.extended[s.addr]) { await this.raw(s.addr, CMD.session(1)); this.extended[s.addr] = false; }
        }
        this.stopKeepAlive();
        this.changed();
    }

    /**
     * A show: steps [{ side: 'L'|'R'|'B', ch, pwm, seconds, waitMs }] or [{ side, fn: lv, seconds, waitMs }],
     * repeated `loops` times. Each step is sent, then waitMs passes (counted from when it was sent).
     */
    async runShow(show, loops) {
        if (this.show) return;
        if (this.moving()) return;
        const gen = this.stopGen, total = loops || show.loops || 1;
        this.show = { name: show.name, step: 0, steps: show.steps.length, loop: 0, loops: total };
        this.changed();
        try {
            for (let l = 0; l < total; l++) {
                for (let i = 0; i < show.steps.length; i++) {
                    if (gen !== this.stopGen || !this.show) return;
                    if (this.moving()) { await this.stopAll('car moving'); return; }
                    const st = show.steps[i];
                    this.show.step = i + 1; this.show.loop = l + 1;
                    this.changed();
                    const t0 = this.now();
                    if (st.fn !== undefined) await this.playFunction(st.fn, st.seconds || 5, st.side);
                    else await this.channel(st.side, st.ch, st.pwm, st.seconds || 1);
                    const left = (st.waitMs || 0) - (this.now() - t0);
                    if (left > 0) await this.sleep(left);
                }
            }
        } finally {
            if (gen === this.stopGen) { this.show = null; this.changed(); }
        }
    }

    async readFaults() {
        for (const s of SIDES) {
            const r = await this.raw(s.addr, CMD.readFaults(), 4000);
            const p = r.ok ? parseDtcReply(r.uds, [0x02, 0x0C]) : { ok: false, dtcs: [] };
            this.faults[s.addr] = { at: r.at, ok: r.ok, text: r.text, dtcs: p.dtcs || [] };
        }
        this.changed();
        return this.faults;
    }

    async clearFaults() {
        for (const s of SIDES) await this.raw(s.addr, CMD.clearFaults(), 4000);
        return this.readFaults();
    }

    // the extended session lapses after a few seconds without a request: 3E 00 while it is ours
    startKeepAlive() {
        if (this.timer) return;
        this.timer = setInterval(() => {
            Object.keys(this.extended).forEach((k) => {
                const a = Number(k);
                if (this.extended[a] && this.now() - (this.lastSent[a] || 0) > this.keepAliveMs * 0.75) this.raw(a, CMD.testerPresent());
            });
        }, this.keepAliveMs);
        if (this.timer.unref) this.timer.unref();
    }
    stopKeepAlive() { if (this.timer) { clearInterval(this.timer); this.timer = null; } }
}

module.exports = { Lab, CMD, SIDES, FUNCTIONS, CHANNELS, verdict, toHex };
