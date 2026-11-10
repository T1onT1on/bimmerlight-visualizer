'use strict';
/**
 * shows.js - FLM Lab's light shows. Each step is one command per module (side B = both, sent left then
 * right), and a command takes about 300 ms over the head unit's diagnostic link (FLM Probe, 2026-11-10), so a
 * show changes the lights roughly three times a second at most. Fast effects belong in the module's own
 * welcome animation (coded staging data), which the "Welcome" steps play at the module's own speed.
 *
 *   { side: 'L' | 'R' | 'B', ch: 0-15 (0 = every channel), pwm: 0-100, seconds, waitMs }   one LED channel
 *   { side, fn: <light function>, seconds, waitMs }                                      a light function
 *
 * Channels (G20 PreLCI 5AZ): 2/7 low beam, 5 DRL 1 + blue accent, 12 DRL 3, 11 high beam 8 + laser, 0 all.
 */
// low beam of one lamp = channels 2 and 7 (low 1 and low 3: the two the welcome animation's low beam track drives)
const LOW = [2, 7];

/** All low beam channels of `side` to `pwm` for `seconds`; the last command waits `waitMs` (from when it was sent). */
function low(side, pwm, seconds, waitMs) {
    return LOW.map((ch, i) => ({ side, ch, pwm, seconds, waitMs: i === LOW.length - 1 ? waitMs : 0 }));
}

/** One flash of `side`'s low beam: on, then off; about 1 s for one side (4 commands), longer for both (8). */
function flash(side) {
    return low(side, 100, 1, 250).concat(low(side, 0, 1, 350));
}

/**
 * Lightning: left low beam flashes twice while the right one is held off, then the right twice while the left
 * is off, then both twice; loops. Low beam only.
 */
const LIGHTNING = [].concat(
    low('R', 0, 3, 0), flash('L'), flash('L'),
    low('L', 0, 3, 0), flash('R'), flash('R'),
    flash('B'), flash('B'));

const SHOWS = [
    {
        name: 'Lightning',
        note: 'Low beam: left x2 (right off), right x2 (left off), both x2',
        loops: 4,
        steps: LIGHTNING,
    },
    {
        name: 'Welcome now',
        note: 'The coded welcome animation on both sides (function 39)',
        steps: [{ side: 'B', fn: 0x39, seconds: 10, waitMs: 0 }],
    },
    {
        name: 'Welcome, then goodbye',
        note: 'Function 39, then 40 (goodbye) on both sides',
        steps: [{ side: 'B', fn: 0x39, seconds: 8, waitMs: 9000 }, { side: 'B', fn: 0x40, seconds: 6, waitMs: 0 }],
    },
    {
        name: 'DRL ping-pong',
        note: 'DRL 3 (channel 12) left, then right',
        loops: 6,
        steps: [
            { side: 'L', ch: 12, pwm: 100, seconds: 1, waitMs: 600 },
            { side: 'L', ch: 12, pwm: 0, seconds: 1, waitMs: 0 },
            { side: 'R', ch: 12, pwm: 100, seconds: 1, waitMs: 600 },
            { side: 'R', ch: 12, pwm: 0, seconds: 1, waitMs: 0 },
        ],
    },
    {
        name: 'DRL breathe',
        note: 'DRL 3 on both sides, up and down',
        loops: 3,
        steps: [10, 30, 60, 100, 60, 30, 10].map((pwm) => ({ side: 'B', ch: 12, pwm, seconds: 2, waitMs: 0 })),
    },
    {
        name: 'Blue accent pulse',
        note: 'Channel 5 (DRL 1 + blue accent) on both sides',
        loops: 5,
        steps: [
            { side: 'B', ch: 5, pwm: 100, seconds: 1, waitMs: 900 },
            { side: 'B', ch: 5, pwm: 0, seconds: 1, waitMs: 600 },
        ],
    },
    {
        name: 'Whole lamp ping-pong',
        note: 'Every channel (incl. high beam and laser) left, then right',
        loops: 6,
        steps: [
            { side: 'L', ch: 0, pwm: 100, seconds: 1, waitMs: 700 },
            { side: 'L', ch: 0, pwm: 0, seconds: 1, waitMs: 0 },
            { side: 'R', ch: 0, pwm: 100, seconds: 1, waitMs: 700 },
            { side: 'R', ch: 0, pwm: 0, seconds: 1, waitMs: 0 },
        ],
    },
];

module.exports = { SHOWS };
