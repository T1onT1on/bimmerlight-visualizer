'use strict';
/**
 * probe.js - what FLM Probe reads from the two front light modules (FLM2) and how the replies decode.
 *
 * Every request is UDS 0x22 ReadDataByIdentifier, sent through kit/readonly-diag.js, which refuses
 * any other service before it reaches the transport. Nothing here switches a light on or changes
 * the module.
 *
 * Reply layouts come from BMW's FLM02_L / FLM02_R SGBD (revision 2.200) as published by the
 * EdiabasX SGBD Reference (https://emdzej.github.io/ediabasx-docs-sgbd/). Other FLM variants
 * (FLM02X, FLM2_1, FLM03) may lay them out differently: the raw bytes are always kept.
 */
const crypto = require('crypto');

const SIDES = Object.freeze([
    { key: 'left', label: 'Left [43]', addr: 0x43 },
    { key: 'right', label: 'Right [44]', addr: 0x44 },
]);

// what is read, in this order, from each side
const READS = Object.freeze([
    { did: 0xF150, key: 'sgbd', label: 'SGBD index' },
    { did: 0xF186, key: 'session', label: 'Diagnostic session' },
    { did: 0xD9BC, key: 'voltage', label: 'Input voltage' },
    { did: 0xDA71, key: 'variant', label: 'Headlamp variant' },
    { did: 0xD9FC, key: 'ledMap', label: 'LED output map' },
    { did: 0xD6DB, key: 'channels', label: 'LED channels now' },
    { did: 0xD7A7, key: 'functions', label: 'Light functions now' },
    { did: 0x3009, key: 'staging1', label: 'Welcome Staging1', timeoutMs: 4000 },
    { did: 0x300A, key: 'staging2', label: 'Welcome Staging2', timeoutMs: 4000 },
]);

const SGBD_NAMES = Object.freeze({
    '0F2200': 'FLM01_L', '0F2210': 'FLM01_R',
    '0F26C0': 'FLM02_L', '0F26D0': 'FLM02_R',
    '0F26C8': 'FLM02X_L', '0F26D8': 'FLM02X_R',
    '0F26CC': 'FLM2_1_L', '0F26DC': 'FLM2_1_R',
    '0F2E30': 'FLM03_L', '0F2E40': 'FLM03_R',
});
const LAYOUT_KNOWN = Object.freeze(['FLM02_L', 'FLM02_R']);

const SESSIONS = Object.freeze({
    0x01: 'default', 0x02: 'programming', 0x03: 'extended', 0x04: 'safety', 0x41: 'coding', 0x42: 'SWT',
});

// DA71: vehicle (mask 0xFE) and LCI (0x01); headlamp maker (0xE0), right-hand drive (0x10), SA (0x0E), country (0x01)
const VEHICLES = Object.freeze({
    0x20: 'G05', 0x22: 'G06', 0x24: 'G07', 0x26: 'G11', 0x28: 'G12', 0x2A: 'G14', 0x2C: 'G15', 0x2E: 'G16',
    0x40: 'G01', 0x42: 'G02', 0x44: 'G08', 0x46: 'G20', 0x48: 'G21', 0x4A: 'G28', 0x4C: 'G22', 0x4E: 'G23',
    0x50: 'G24', 0x52: 'G26', 0x54: 'G29', 0x56: 'G30', 0x58: 'G31', 0x5A: 'G38', 0x5C: 'G32', 0x5E: 'J29',
});
const MAKERS = Object.freeze({ 0x20: 'Automotive Lighting', 0x60: 'Hella', 0x80: 'ZKW', 0xA0: 'Valeo' });
const SA = Object.freeze({
    0x00: 'no SA', 0x02: '524 adaptive cornering', 0x04: '552 adaptive LED', 0x06: '552 adaptive LED matrix',
    0x08: '5A2 LED', 0x0A: '5A4 LED extended', 0x0C: '5AZ Laserlight',
});

// D9FC: for each light source its LED output, then its binning input, then its NTC input (23 x 3 bytes)
const LAMPS = Object.freeze([
    'Low beam 1', 'Low beam 2', 'Low beam 3', 'Low beam 4',
    'High beam 1', 'High beam 2', 'High beam 3', 'High beam 4', 'High beam 5',
    'High beam 6', 'High beam 7', 'High beam 8', 'High beam 9', 'High beam 10',
    'DRL / position 1', 'DRL / position 2', 'DRL / position 3', 'DRL / position 4',
    'Turn signal 1', 'Side marker 1', 'Laser 1', 'Laser accent 1', 'Laser accent 2',
]);

// D7A7: light function status bytes as the module sees them on the body CAN, both sides
const FN = Object.freeze({
    IDC: 'Turn signal', FMH: 'Follow me home', REMLI: 'Remote light', SPFLS: 'Special flashing', DRL: 'DRL',
    LDSTR_LOWB: 'Low beam distribution', DIPB: 'Low beam', PLI: 'Parking light', POLI: 'Position light',
    MAB: 'High beam', WELL: 'Welcome light', BRIGLEV: 'Brightness', ALIV: 'Alive counter', CORNL: 'Cornering light',
});
const FE1 = ['IDC', 'FMH', 'REMLI', 'SPFLS', 'DRL', 'LDSTR_LOWB', 'DIPB', 'PLI', 'POLI', 'MAB', 'WELL', 'BRIGLEV', 'ALIV'];
const FE2 = ['CORNL', 'FMH', 'REMLI', 'SPFLS', 'DRL', 'LDSTR_LOWB', 'DIPB', 'MAB', 'WELL', 'BRIGLEV', 'ALIV'];
const FUNCTIONS = Object.freeze([].concat(
    FE1.map((f) => ({ side: 'L', group: 1, code: f })), FE2.map((f) => ({ side: 'L', group: 2, code: f })),
    FE1.map((f) => ({ side: 'R', group: 1, code: f })), FE2.map((f) => ({ side: 'R', group: 2, code: f }))));

const STAGING1 = 252, STAGING2 = 168;

const hx = (n, w) => n.toString(16).toUpperCase().padStart(w || 2, '0');
const hexBytes = (b) => (b || []).map((x) => hx(x)).join(' ');

/**
 * One reply (bytes from the module, or null) -> { status, data, nrc }.
 * status: 'ok' (62 <did> <data>), 'refused' (7F 22 <nrc>), 'timeout' (null), 'cancelled' (undefined), 'odd'.
 */
function parseReply(uds, did) {
    if (uds === undefined) return { status: 'cancelled' };
    if (!uds || !uds.length) return { status: 'timeout' };
    if (uds[0] === 0x7F) return { status: 'refused', nrc: uds[2] };
    if (uds[0] === 0x62 && uds[1] === ((did >> 8) & 0xFF) && uds[2] === (did & 0xFF)) return { status: 'ok', data: uds.slice(3) };
    return { status: 'odd', raw: uds.slice() };
}

function decodeSgbd(d) {
    if (!d || d.length < 3) return null;
    const index = hx(((d[0] << 16) | (d[1] << 8) | d[2]) >>> 0, 6);
    const name = SGBD_NAMES[index] || null;
    return { index, name, layoutKnown: LAYOUT_KNOWN.indexOf(name) >= 0 };
}

function decodeSession(d) {
    if (!d || !d.length) return null;
    return { code: d[0], text: SESSIONS[d[0]] || '0x' + hx(d[0]) };
}

function decodeVoltage(d) {
    if (!d || !d.length) return null;
    return { volts: d[0] / 10 };
}

function decodeVariant(d) {
    if (!d || d.length < 2) return null;
    const out = {
        vehicle: VEHICLES[d[0] & 0xFE] || '0x' + hx(d[0] & 0xFE),
        lci: !!(d[0] & 0x01),
        maker: MAKERS[d[1] & 0xE0] || '0x' + hx(d[1] & 0xE0),
        rightHandDrive: !!(d[1] & 0x10),
        sa: SA[d[1] & 0x0E] || '0x' + hx(d[1] & 0x0E),
        country: d[1] & 0x01 ? 'US' : 'ECE',
    };
    if (d.length >= 3) out.version = hx(d[2]);
    if (d.length >= 11) out.ecuVariant = hexBytes(d.slice(3, 11));
    if (d.length >= 12) out.valid = d[11] === 1;
    if (d.length >= 13) out.site = d[12] === 0 ? 'Kronach' : d[12] === 1 ? 'Apodaca' : '0x' + hx(d[12]);
    return out;
}

/**
 * D9FC -> [{ lamp, led, ledRaw, binning, ntc }]. led is the LED channel number (1-15) as D6DB and
 * FLM_KANAL count them: the SGBD scales it by 1/10, but on a G20 5AZ (2026-11-10) the raw values are
 * channel numbers (DRL 1/2/3 -> 5/6/12, the three channels D6DB showed at the same 740 mA).
 */
function decodeLedMap(d) {
    if (!d || d.length < LAMPS.length) return null;
    const n = LAMPS.length;
    return LAMPS.map((lamp, i) => ({
        lamp,
        ledRaw: d[i],
        led: d[i],
        binning: d.length >= 2 * n ? d[n + i] : null,
        ntc: d.length >= 3 * n ? d[2 * n + i] : null,
    }));
}

/** A lamp the map gives an output to (0 and FF read as "none"). */
const wired = (row) => row && row.ledRaw !== 0 && row.ledRaw !== 0xFF;

/** D6DB -> 15 x { channel, pwm %, currentMa, volts, phase } */
function decodeChannels(d) {
    if (!d || d.length < 5) return null;
    const out = [];
    for (let ch = 0; ch < 15 && ch * 5 + 5 <= d.length; ch++) {
        const o = ch * 5;
        out.push({ channel: ch + 1, pwm: d[o], currentMa: (d[o + 1] << 8) | d[o + 2], volts: d[o + 3], phase: d[o + 4] });
    }
    return out;
}

/** D7A7 -> [{ side, group, code, name, value }] for every byte present */
function decodeFunctions(d) {
    if (!d || !d.length) return null;
    return FUNCTIONS.slice(0, d.length).map((f, i) => ({ side: f.side, group: f.group, code: f.code, name: FN[f.code], value: d[i] }));
}

/**
 * Welcome-light staging (3009 + 300A) -> the tracks in it, the same walk as the FLM Light Studio:
 * id u8, pair count u16 big-endian, (duration, brightness) pairs; 00 00 00 at a record head ends it.
 */
function decodeStaging(s1, s2) {
    if (!s1) return null;
    const bytes = new Array(STAGING1 + STAGING2).fill(0);
    s1.slice(0, STAGING1).forEach((b, i) => { bytes[i] = b; });
    (s2 || []).slice(0, STAGING2).forEach((b, i) => { bytes[STAGING1 + i] = b; });
    const tracks = [];
    let at = 0, ended = false, error = null;
    while (at + 3 <= bytes.length) {
        const id = bytes[at], count = (bytes[at + 1] << 8) | bytes[at + 2];
        if (id === 0 && count === 0) { ended = true; break; }
        const end = at + 3 + 2 * count;
        if (end > bytes.length) { error = 'track 0x' + hx(id) + ' runs past 420 bytes'; break; }
        let units = 0, last = 0;
        for (let k = at + 3; k < end; k += 2) { units += bytes[k]; last = bytes[k + 1]; }
        tracks.push({ id: hx(id), pairs: count, units, finalBrightness: last, offset: at });
        at = end;
    }
    return {
        lengths: [s1.length, s2 ? s2.length : 0],
        sha256: crypto.createHash('sha256').update(Buffer.from(bytes)).digest('hex'),
        tracks, used: at + (ended ? 3 : 0), ended, error,
    };
}

const DECODE = { sgbd: decodeSgbd, session: decodeSession, voltage: decodeVoltage, variant: decodeVariant,
    ledMap: decodeLedMap, channels: decodeChannels, functions: decodeFunctions };

/**
 * Read everything from both sides. read(addr, did, timeoutMs) -> reply bytes / null / undefined
 * (ReadOnlyDiag.read, or the demo). onStep(done, total, label) after each request.
 * Returns { at, demo, sides: { left: {...}, right: {...} } }, raw bytes included for the export.
 */
async function runProbe(read, opts) {
    const o = opts || {};
    const total = SIDES.length * READS.length;
    const result = { at: new Date().toISOString(), demo: !!o.demo, source: 'FLM02 rev 2.200 layouts', sides: {} };
    let done = 0;
    for (const side of SIDES) {
        const s = { addr: '0x' + hx(side.addr), label: side.label, reads: {} };
        result.sides[side.key] = s;
        for (const r of READS) {
            if (o.cancelled && o.cancelled()) return result;
            const uds = await read(side.addr, r.did, r.timeoutMs || 1500);
            const p = parseReply(uds, r.did);
            const entry = { did: hx(r.did, 4), status: p.status };
            if (p.status === 'ok') {
                entry.raw = hexBytes(p.data);
                entry.length = p.data.length;
                if (DECODE[r.key]) entry.value = DECODE[r.key](p.data);
                s[r.key + 'Bytes'] = p.data;
            } else if (p.status === 'refused') {
                entry.nrc = '0x' + hx(p.nrc);
            } else if (p.status === 'odd') {
                entry.raw = hexBytes(p.raw);
            }
            s.reads[r.key] = entry;
            done++;
            if (o.onStep) o.onStep(done, total, side.label + ': ' + r.label);
        }
        s.staging = decodeStaging(s.staging1Bytes, s.staging2Bytes);
        delete s.staging1Bytes; delete s.staging2Bytes;
        Object.keys(s).filter((k) => /Bytes$/.test(k)).forEach((k) => delete s[k]);
    }
    return result;
}

module.exports = {
    SIDES, READS, SGBD_NAMES, LAMPS, FUNCTIONS, STAGING1, STAGING2,
    parseReply, decodeSgbd, decodeSession, decodeVoltage, decodeVariant, decodeLedMap, decodeChannels,
    decodeFunctions, decodeStaging, runProbe, wired, hexBytes,
};
