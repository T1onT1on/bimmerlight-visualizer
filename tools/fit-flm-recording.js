'use strict';
// Second fit: a FIXED time window per event (so every tick is judged on the same samples), and the car's own
// steady state after a staging track ends (welcome: DRL1 ch5 11 %, DRL3 ch12 31 %, low beam held at 100 % after
// its ramp; goodbye: everything to 0, low beam never runs). pwm = 100 * (b/100)^gamma.
//   node tools/fit-flm-recording.js docs/data/flm_record_2026-11-10_unlock-lock-unlock.json .
const path = require('path');
const rec = require(path.resolve(process.argv[2]));
const C = require(path.join(path.resolve(process.argv[3]), 'core.js'));
require(path.join(path.resolve(process.argv[3]), 'sample-v15.js'));
const proj = C.parseProject(globalThis.WelcomeLightSamples.factoryShimmer);
const track = (id) => proj.left.tracks.find((t) => t.identifierHex === id);
const units = (tr) => tr.duration / 10;

const pwmOf = (b, g) => 100 * Math.pow(Math.max(0, Math.min(100, b)) / 100, g);

// model of one physical channel at real time t (ms after the event start)
function model(kind, ch, tr, t, T, g) {
    if (t < 0) return kind === 'welcome' ? 0 : null;           // before a goodbye: the welcome's state (not judged)
    const u = t / T;                                            // staging units elapsed
    if (ch === 2) {
        if (kind === 'goodbye') return 0;                       // low beam is off from the lock on
        return u >= 308 ? 100 : pwmOf(C.brightnessAt(tr, u * 10), g);
    }
    const end = units(tr);
    if (u >= end) return kind === 'welcome' ? (ch === 5 ? 11 : 31) : 0;
    return pwmOf(C.brightnessAt(tr, u * 10), g);
}

const EVENTS = [
    { id: 'w1', kind: 'welcome', range: [10, 14], win: [-1.5, 8] },
    { id: 'g2', kind: 'goodbye', range: [22, 25], win: [-0.3, 6.5] },
    { id: 'w3', kind: 'welcome', range: [32, 35], win: [-1.5, 8] },
];
const CHS = [2, 5, 12];

function eventErr(ev, start, T, g, choice) {
    let err = 0, n = 0;
    const lo = (start + ev.win[0]) * 1000, hi = (start + ev.win[1]) * 1000;
    rec.samples.forEach((x) => {
        if (x.got < lo || x.sent > hi) return;
        CHS.forEach((ch, i) => {
            let best = Infinity;
            for (let k = 0; k <= 6; k++) {
                const t = x.sent + (x.got - x.sent) * k / 6 - start * 1000;
                const p = model(ev.kind, ch, track(choice[i]), t, T, g);
                if (p !== null) best = Math.min(best, Math.abs(p - x.pwm[ch - 1]));
            }
            if (best < Infinity) { err += best; n++; }
        });
    });
    return { err, n };
}

function fit(T, g, choice) {
    let total = 0, n = 0;
    const starts = {};
    EVENTS.forEach((ev) => {
        let best = { err: Infinity };
        for (let s = ev.range[0]; s <= ev.range[1]; s += 0.02) {
            const e = eventErr(ev, s, T, g, choice);
            if (e.err < best.err) best = { err: e.err, n: e.n, s };
        }
        starts[ev.id] = +best.s.toFixed(2); total += best.err; n += best.n;
    });
    return { T, g, choice: choice.join('/'), mae: +(total / n).toFixed(2), n, starts };
}

const choices = [['01', '04', '02'], ['01', '05', '02'], ['01', '04', '03'], ['01', '05', '03']];
const gammas = [1, 1.8, 2.2, 2.5, 2.8, 3.2];
const results = [];
for (let T = 8; T <= 30; T += 0.5) gammas.forEach((g) => choices.forEach((c) => results.push(fit(T, g, c))));
results.sort((a, b) => a.mae - b.mae);
console.log('best 6:'); results.slice(0, 6).forEach((r) => console.log(' ', JSON.stringify(r)));
const bestFor = (T) => results.filter((r) => r.T === T).sort((a, b) => a.mae - b.mae)[0];
console.log('best at 10 ms:', JSON.stringify(bestFor(10)));
console.log('best at 20 ms:', JSON.stringify(bestFor(20)));
const b = results[0];
const line = [];
for (let T = 8; T <= 30; T += 1) { const r = results.filter((x) => x.T === T).sort((p, q) => p.mae - q.mae)[0]; line.push(T + ':' + r.mae); }
console.log('best MAE by tick (any gamma/tracks):\n  ' + line.join('  '));
console.log('MAE by gamma at ' + b.T + ' ms (' + b.choice + '):', gammas.map((g) => g + ':' + results.find((x) => x.T === b.T && x.g === g && x.choice === b.choice).mae).join('  '));
console.log('n per fit (same for every tick?):', [...new Set(results.map((r) => r.n))].slice(0, 8).join(','));
