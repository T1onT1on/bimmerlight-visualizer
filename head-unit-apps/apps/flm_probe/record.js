'use strict';
/**
 * record.js - FLM Probe's recording: reads D6DB (PWM of all 15 LED channels) from both FLM2 modules
 * again and again for a set time, so that a welcome-light animation can be lined up against the
 * staging data that drives it.
 *
 * Read only: every request is UDS 22 through the same read function as the probe (in the car that is
 * kit/readonly-diag.js, which refuses anything else). Each sample keeps the time its request left and
 * the time its reply came back, in ms from the start, so the timing can be checked afterwards.
 * Every fnEvery-th round also reads D7A7, whose WELL bytes say when the module sees the welcome light.
 */
const P = require('./probe');

const D6DB = 0xD6DB, D7A7 = 0xD7A7;

class Recording {
    /**
     * read(addr, did, timeoutMs) -> reply bytes | null | undefined, as runProbe gets it.
     * opts: seconds (length), fnEvery (a D7A7 round every n rounds), timeoutMs (per read),
     *       wake(addr) (called after a read got no answer: readonly-diag skips a unit that stays
     *       silent), onSample(sample), now() and sleep(ms) (tests), demo (marks the file).
     */
    constructor(read, opts) {
        const o = opts || {};
        this.read = read;
        this.now = o.now || Date.now;
        this.sleep = o.sleep || ((ms) => new Promise((res) => setTimeout(res, ms)));
        this.seconds = o.seconds || 60;
        this.fnEvery = o.fnEvery || 10;
        this.timeoutMs = o.timeoutMs || 400;
        this.wake = o.wake || null;
        this.onSample = o.onSample || null;
        this.stopped = false;
        this.running = false;
        this.t0 = null;
        this.data = {
            kind: 'flm_probe_recording', version: 1, demo: !!o.demo,
            startedAt: null, endedAt: null, seconds: this.seconds,
            note: 'pwm[i] is LED channel i+1 in %, as D6DB reports it; t in ms from the start (sent / got)',
            samples: [], functions: [], misses: { left: 0, right: 0 }, stoppedEarly: false,
        };
    }

    stop() { this.stopped = true; }
    elapsed() { return this.t0 === null ? 0 : this.now() - this.t0; }

    async run() {
        this.running = true;
        this.t0 = this.now();
        this.data.startedAt = new Date().toISOString();
        let round = 0;
        try {
            while (!this.stopped && this.elapsed() < this.seconds * 1000) {
                let answered = 0;
                for (const side of P.SIDES) {
                    if (this.stopped) break;
                    if (await this.sampleChannels(side)) answered++;
                }
                if (round % this.fnEvery === 0) {
                    for (const side of P.SIDES) if (!this.stopped) await this.sampleFunctions(side);
                }
                round++;
                // neither module answered: don't spin on a link that returns at once
                if (!answered && !this.stopped) await this.sleep(100);
            }
        } finally {
            this.running = false;
            this.data.stoppedEarly = this.stopped;
            this.data.endedAt = new Date().toISOString();
            this.data.durationMs = this.elapsed();
            this.data.stats = stats(this.data);
        }
        return this.data;
    }

    async sampleChannels(side) {
        const sent = this.elapsed();
        const uds = await this.read(side.addr, D6DB, this.timeoutMs);
        const got = this.elapsed();
        const p = P.parseReply(uds, D6DB);
        const ch = p.status === 'ok' ? P.decodeChannels(p.data) : null;
        if (!ch) {
            this.data.misses[side.key]++;
            if (this.wake) this.wake(side.addr);
            return false;
        }
        const sample = { side: side.key, sent, got, pwm: ch.map((c) => c.pwm) };
        this.data.samples.push(sample);
        if (this.onSample) this.onSample(sample);
        return true;
    }

    async sampleFunctions(side) {
        const sent = this.elapsed();
        const uds = await this.read(side.addr, D7A7, this.timeoutMs);
        const got = this.elapsed();
        const p = P.parseReply(uds, D7A7);
        if (p.status !== 'ok') return;
        const fn = P.decodeFunctions(p.data) || [];
        const own = fn.filter((f) => f.value !== 0xFF);
        const pick = (code) => own.filter((f) => f.code === code).map((f) => f.value);
        this.data.functions.push({ side: side.key, sent, got, well: pick('WELL'), drl: pick('DRL'), lowBeam: pick('DIPB'), raw: P.hexBytes(p.data) });
    }
}

/** Per side: samples, samples a second, the median gap between two samples, and which channels moved. */
function stats(data) {
    const out = {};
    P.SIDES.forEach((s) => {
        const xs = data.samples.filter((x) => x.side === s.key);
        const gaps = xs.slice(1).map((x, i) => x.got - xs[i].got).sort((a, b) => a - b);
        const moved = [];
        for (let c = 0; c < 15; c++) {
            const v = xs.map((x) => x.pwm[c]);
            if (v.length && Math.max.apply(null, v) !== Math.min.apply(null, v)) moved.push(c + 1);
        }
        out[s.key] = {
            samples: xs.length,
            perSecond: data.durationMs ? Math.round(xs.length / (data.durationMs / 1000) * 10) / 10 : 0,
            medianGapMs: gaps.length ? gaps[Math.floor(gaps.length / 2)] : null,
            channelsThatMoved: moved,
        };
    });
    return out;
}

/** The samples of one side as one series per channel: [{ channel, points: [[t, pwm], ...] }] (t = got). */
function series(data, sideKey) {
    const xs = data.samples.filter((x) => x.side === sideKey);
    const out = [];
    for (let c = 0; c < 15; c++) out.push({ channel: c + 1, points: xs.map((x) => [x.got, x.pwm[c]]) });
    return out;
}

module.exports = { Recording, stats, series, D6DB, D7A7 };
