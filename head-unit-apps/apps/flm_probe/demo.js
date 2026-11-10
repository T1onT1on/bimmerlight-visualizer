'use strict';
/**
 * demo.js - made-up replies in the FLM02 layouts, so the screens can be seen without a car.
 * None of these values come from a real module.
 */
const LAMPS = 23;

function ledMap() {
    const led = new Array(LAMPS).fill(0);
    [2, 6, 7, 8].forEach((v, i) => { led[i] = v; });                     // low beam 1-4 on channels
    [5, 6, 12].forEach((v, i) => { led[14 + i] = v; });                  // DRL / position 1-3
    led[18] = 1; led[20] = 11; led[21] = 5;                              // turn signal, laser, laser accent
    const bin = led.map((v) => (v ? 1 + (v % 3) : 0));
    const ntc = led.map((v) => (v ? 13 : 0));
    return led.concat(bin, ntc);
}

function channels(t) {
    const out = [];
    for (let ch = 1; ch <= 15; ch++) {
        const on = ch <= 6;
        const pwm = on ? Math.round(40 + 40 * Math.abs(Math.sin(t / 900 + ch))) : 0;
        const ma = on ? 300 + ch * 20 : 0;
        out.push(pwm, (ma >> 8) & 0xFF, ma & 0xFF, on ? 12 : 0, on ? 1 : 0);
    }
    return out;
}

function functions() {
    const d = new Array(48).fill(0);
    d[4] = 0x01; d[6] = 0x01; d[11] = 0x64;          // left: DRL, low beam, brightness
    d[28] = 0x01; d[30] = 0x01; d[35] = 0x64;        // right
    d[12] = 0x07; d[36] = 0x07;                      // alive counters
    return d;
}

// a short made-up animation: CH01 rises and holds, CH02 one pulse, then the end header
const STAGING1 = [0x01, 0x00, 0x03, 0x32, 0x00, 0x32, 0x64, 0x64, 0x64,
    0x02, 0x00, 0x02, 0x19, 0x64, 0x19, 0x00, 0x00, 0x00, 0x00];

function reply(addr, did, t) {
    const side = addr === 0x44 ? 'right' : 'left';
    const ok = (data) => [0x62, (did >> 8) & 0xFF, did & 0xFF].concat(data);
    switch (did) {
    case 0xF150: return ok(side === 'left' ? [0x0F, 0x26, 0xC0] : [0x0F, 0x26, 0xD0]);
    case 0xF186: return ok([0x01]);
    case 0xD9BC: return ok([138]);
    case 0xDA71: return ok([0x46, 0x2C, 0x05, 1, 2, 3, 4, 5, 6, 7, 8, 0x01, 0x00]);
    case 0xD9FC: return ok(ledMap());
    case 0xD6DB: return ok(channels(t || Date.now()));
    case 0xD7A7: return ok(functions());
    case 0x3009: return ok(STAGING1.concat(new Array(252 - STAGING1.length).fill(0)));
    case 0x300A: return [0x7F, 0x22, 0x31];        // shows what a refusal looks like
    default: return [0x7F, 0x22, 0x31];
    }
}

module.exports = { reply };
