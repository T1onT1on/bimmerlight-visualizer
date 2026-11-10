'use strict';
/**
 * FLM Probe - reads the two front light modules (FLM2, left 0x43 / right 0x44) and shows what they say.
 *
 * READ ONLY. Every request goes through kit/readonly-diag.js, which lets only UDS 0x22
 * ReadDataByIdentifier through and throws on anything else (routines, writes, I/O control, sessions,
 * resets). No light is switched and nothing in the module is changed.
 *
 * What it reads (probe.js has the list and the decoders):
 *   F150 SGBD index        which FLM variant this is (FLM02_L, FLM2_1_L, ...)
 *   F186 session, D9BC input voltage, DA71 headlamp variant (vehicle, maker, SA 5AZ, ECE / US)
 *   D9FC LED output map    which physical LED output drives which light source
 *   D6DB LED channels      PWM %, current, voltage of channels 1-15 right now
 *   D7A7 light functions   the light function status bytes the module sees
 *   3009 / 300A            the welcome-light staging data (may be refused)
 *
 * Every read is saved with its raw bytes to data/flm_probe_latest.json (and a dated copy), to be
 * copied off the unit and checked on a PC.
 *
 * Record (record.js): reads D6DB from both modules over and over for the set time (still only
 * UDS 22), draws each channel's PWM as it comes in, and saves data/flm_record_latest.json. Started,
 * then the car is locked and unlocked with the key so the welcome light runs while it records.
 *
 * Pages: Modules -> LED map -> Channels -> Functions -> Welcome data -> Record.
 */
const fs = require('fs');
const path = require('path');
const mgu = require('./kit/mgu');
const G = require('./kit/gauges');
const { withAlpha } = require('./kit/canvas');
const { ReadOnlyDiag } = require('./kit/readonly-diag');
const { NRC } = require('./kit/diag');
const P = require('./probe');
const DEMO = require('./demo');
const { Recording, series } = require('./record');

const W = 1600, H = 520;
const PAGES = ['Modules', 'LED map', 'Channels', 'Functions', 'Welcome data', 'Record'];
const REC_PAGE = PAGES.indexOf('Record');
const GO = '#2fd27a';
// one colour per LED channel 1-15 on the Record page
const PALETTE = ['#ff5a5a', '#ffb000', '#ffe14d', '#7ddc5a', '#2fd27a', '#29c7c7', '#2a8cff', '#7a6bff',
    '#c86bff', '#ff6bd2', '#ff8a3d', '#b5e655', '#5ad1ff', '#d0d0d0', '#a07850'];

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

mgu.run({
    async start(ctx) {
        const { ui, settings, log } = ctx;
        const link = new ReadOnlyDiag(ctx.signals, log);
        await link.init();
        const useDemo = () => settings.get('demo') === 'on' || (settings.get('demo') === 'auto' && !link.available);

        const latestFile = path.join(ctx.dataDir, 'flm_probe_latest.json');
        const recordFile = path.join(ctx.dataDir, 'flm_record_latest.json');
        let result = null, page = 0, busy = false, phase = '', progress = '', savedAs = '', gen = 0;
        let rec = null, recData = null;           // the recording running now / the last one finished
        try { result = JSON.parse(fs.readFileSync(latestFile, 'utf8')); phase = 'Last read ' + result.at; } catch (e) { result = null; }
        try { recData = JSON.parse(fs.readFileSync(recordFile, 'utf8')); } catch (e) { recData = null; }

        function save(r) {
            try {
                const stamp = r.at.replace(/[:.]/g, '-');
                const text = JSON.stringify(r, null, 2);
                fs.writeFileSync(latestFile, text);
                fs.writeFileSync(path.join(ctx.dataDir, 'flm_probe_' + stamp + (r.demo ? '_demo' : '') + '.json'), text);
                savedAs = 'data/flm_probe_latest.json';
            } catch (e) { savedAs = ''; log.warn('save: ' + e); }
        }

        async function scan() {
            if (busy || rec) return;
            busy = true;
            const my = ++gen, demo = useDemo();
            phase = demo ? 'Reading (demo data)' : 'Reading';
            progress = '';
            render().catch(() => {});
            const read = demo
                ? async (addr, did) => { await sleep(60); return DEMO.reply(addr, did); }
                : (addr, did, ms) => link.read(addr, did, ms);
            try {
                if (!demo && !link.available) throw new Error('no diagnostic link');
                const r = await P.runProbe(read, {
                    demo,
                    cancelled: () => my !== gen,
                    onStep: (done, total, label) => { progress = done + ' / ' + total + '  ' + label; render().catch(() => {}); },
                });
                if (my !== gen) return;
                result = r;
                save(r);
                const answered = P.SIDES.filter((s) => r.sides[s.key] && Object.keys(r.sides[s.key].reads).some((k) => r.sides[s.key].reads[k].status === 'ok'));
                phase = answered.length ? 'Read ' + r.at.slice(11, 19) + (demo ? ' (demo)' : '') : 'Neither module answered';
                log.info('probe done: ' + JSON.stringify(Object.keys(r.sides).map((k) => [k, Object.keys(r.sides[k].reads).map((x) => r.sides[k].reads[x].status)])));
            } catch (e) {
                phase = 'Not read: ' + (e && e.message || e);
                log.warn('probe: ' + e);
            } finally {
                if (my === gen) { busy = false; progress = ''; }
                render().catch(() => {});
            }
        }

        // ---------- recording ----------
        function recProgress() {
            if (!rec) return '';
            const n = (k) => rec.data.samples.filter((x) => x.side === k).length;
            return 'Recording ' + (rec.elapsed() / 1000).toFixed(1) + ' / ' + rec.seconds + ' s   samples L ' + n('left') + '  R ' + n('right') +
                '   - lock and unlock the car with the key now';
        }

        function saveRecording(d) {
            try {
                const text = JSON.stringify(d);
                fs.writeFileSync(recordFile, text);
                fs.writeFileSync(path.join(ctx.dataDir, 'flm_record_' + d.startedAt.replace(/[:.]/g, '-') + (d.demo ? '_demo' : '') + '.json'), text);
                savedAs = 'data/flm_record_latest.json';
            } catch (e) { savedAs = ''; log.warn('save recording: ' + e); }
        }

        /** Record pressed: start a recording, or stop the one running. */
        async function record() {
            if (rec) { rec.stop(); return; }
            if (busy) return;
            const demo = useDemo();
            if (!demo && !link.available) { phase = 'Not recording: no diagnostic link'; return render(); }
            const read = demo
                ? async (addr, did) => { await sleep(40); return DEMO.reply(addr, did, Date.now()); }
                : (addr, did, ms) => link.read(addr, did, ms);
            let lastDraw = 0;
            rec = new Recording(read, {
                seconds: Number(settings.get('recordSeconds')) || 60,
                demo,
                wake: demo ? null : (addr) => link.wake(addr),
                onSample: () => {
                    const now = Date.now();
                    if (now - lastDraw < 250) return;
                    lastDraw = now;
                    progress = recProgress();
                    render().catch(() => {});
                },
            });
            page = REC_PAGE;
            phase = '';
            progress = recProgress();
            Promise.resolve(ui.text('BTN_REC', 'Stop')).catch(() => {});
            const gap = link.gapMs;
            link.gapMs = 5;                 // as fast as the modules answer, one request at a time
            link.wake();
            log.info('recording ' + rec.seconds + ' s' + (demo ? ' (demo)' : ''));
            render().catch(() => {});
            try {
                const d = await rec.run();
                recData = d;
                saveRecording(d);
                const s = d.stats || {};
                phase = 'Recorded ' + (d.durationMs / 1000).toFixed(1) + ' s' + (d.stoppedEarly ? ' (stopped)' : '') +
                    ', L ' + (s.left ? s.left.perSecond : 0) + '/s, R ' + (s.right ? s.right.perSecond : 0) + '/s' + (demo ? ' (demo)' : '');
                log.info('recording done: ' + JSON.stringify(s));
            } catch (e) {
                phase = 'Recording failed: ' + (e && e.message || e);
                log.warn('recording: ' + e);
            } finally {
                link.gapMs = gap;
                rec = null;
                progress = '';
                Promise.resolve(ui.text('BTN_REC', 'Record')).catch(() => {});
                render().catch(() => {});
            }
        }

        // ---------- drawing ----------
        const side = (k) => result && result.sides && result.sides[k];
        const entry = (k, key) => { const s = side(k); return s && s.reads && s.reads[key]; };
        const value = (k, key) => { const e = entry(k, key); return e && e.status === 'ok' ? e.value : null; };
        function statusText(e) {
            if (!e) return { text: '--', color: 'dim' };
            if (e.status === 'ok') return { text: 'OK ' + e.length + ' B', color: GO };
            if (e.status === 'refused') { const n = parseInt(e.nrc, 16); return { text: 'Refused ' + e.nrc + (NRC[n] ? ' ' + NRC[n] : ''), color: 'warn' }; }
            if (e.status === 'timeout') return { text: 'No answer', color: 'warn' };
            return { text: e.status, color: 'dim' };
        }

        function drawModules(cv, t) {
            P.SIDES.forEach((s, i) => {
                const x = 24 + i * 788, w = 764;
                G.panel(cv, t, x, 44, w, 400, s.label);
                const sg = value(s.key, 'sgbd'), ss = value(s.key, 'session'), v = value(s.key, 'voltage'), va = value(s.key, 'variant');
                let y = 122;
                const line = (label, text, color) => {
                    cv.text(label, x + 24, y, 20, t.dim);
                    cv.text(text, x + 250, y, 22, color ? t[color] || color : t.text, { font: 'bold' });
                    y += 32;
                };
                line('SGBD', sg ? sg.index + '  ' + (sg.name || 'unknown') : '--', sg && !sg.layoutKnown ? 'warn' : null);
                if (sg && !sg.layoutKnown) line('', 'Layouts below are for FLM02: check raw bytes', 'warn');
                line('Session', ss ? ss.text : '--');
                line('Input voltage', v ? v.volts.toFixed(1) + ' V' : '--');
                line('Vehicle', va ? va.vehicle + (va.lci ? ' LCI' : ' pre-LCI') + (va.rightHandDrive ? ', RHD' : ', LHD') : '--');
                line('Headlamp', va ? va.sa + ', ' + va.country : '--');
                line('Maker', va ? va.maker + (va.site ? ', ' + va.site : '') : '--');
                line('Version', va && va.version ? va.version + (va.valid === false ? ' (variant data invalid)' : '') : '--');
                // read status of each request
                const reads = P.READS.map((r) => ({ r, st: statusText(entry(s.key, r.key)) }));
                const short = { sgbd: 'F150', session: 'F186', voltage: 'D9BC', variant: 'DA71', ledMap: 'D9FC', channels: 'D6DB', functions: 'D7A7', staging1: '3009', staging2: '300A' };
                reads.forEach((o, k) => {
                    const cx = x + 24 + (k % 3) * 245, cy = 368 + Math.floor(k / 3) * 25;
                    cv.text(short[o.r.key], cx, cy, 16, t.dim, { font: 'bold' });
                    cv.text(o.st.text, cx + 52, cy, 16, t[o.st.color] || o.st.color);
                });
            });
        }

        function drawLedMap(cv, t) {
            G.panel(cv, t, 24, 44, 1552, 400, 'Which LED channel drives which light (D9FC, read only)');
            const L = value('left', 'ledMap'), R = value('right', 'ledMap');
            if (!L && !R) { cv.text('Not read yet', 48, 150, 24, t.dim); return; }
            let rows = P.LAMPS.map((lamp, i) => ({ lamp, l: L && L[i], r: R && R[i] }));
            const used = rows.filter((x) => P.wired(x.l) || P.wired(x.r));
            if (used.length) rows = used;
            const cell = (m) => (m ? (P.wired(m) ? 'Ch ' + m.led : '-') : '--');
            const cols = [
                { label: 'Light source', w: 340 },
                { label: 'L channel', w: 200 }, { label: 'L bin', w: 120, align: 'right' }, { label: 'L NTC', w: 140, align: 'right' },
                { label: '', w: 80 }, { label: 'R channel', w: 200 }, { label: 'R bin', w: 120, align: 'right' }, { label: 'R NTC', w: 140, align: 'right' },
            ];
            const rh = Math.min(30, Math.floor(310 / Math.max(1, rows.length)));
            G.table(cv, t, 48, 104, 1500, cols, rows.map((x) => [
                x.lamp, cell(x.l), x.l ? x.l.binning : '--', x.l ? x.l.ntc : '--', '',
                cell(x.r), x.r ? x.r.binning : '--', x.r ? x.r.ntc : '--',
            ]), { rowH: rh, size: Math.min(20, rh - 4) });
        }

        function drawChannels(cv, t) {
            G.panel(cv, t, 24, 44, 1552, 400, 'LED channels when read (D6DB): PWM, current, voltage');
            const L = value('left', 'channels'), R = value('right', 'channels');
            if (!L && !R) { cv.text('Not read yet', 48, 150, 24, t.dim); return; }
            const cols = [
                { label: 'Channel', w: 160 },
                { label: 'L PWM', w: 180, align: 'right' }, { label: 'L mA', w: 180, align: 'right' }, { label: 'L V', w: 140, align: 'right' },
                { label: 'R PWM', w: 260, align: 'right' }, { label: 'R mA', w: 180, align: 'right' }, { label: 'R V', w: 140, align: 'right' },
            ];
            const rows = [];
            for (let i = 0; i < 15; i++) {
                const l = L && L[i], r = R && R[i];
                const pwm = (c) => (c ? { text: c.pwm + ' %', color: c.pwm ? GO : 'dim' } : '--');
                rows.push(['Ch ' + (i + 1), pwm(l), l ? l.currentMa : '--', l ? l.volts : '--', pwm(r), r ? r.currentMa : '--', r ? r.volts : '--']);
            }
            G.table(cv, t, 48, 102, 1500, cols, rows, { rowH: 20, size: 17 });
        }

        function drawFunctions(cv, t) {
            P.SIDES.forEach((s, i) => {
                const x = 24 + i * 788, w = 764;
                G.panel(cv, t, x, 44, w, 400, s.label + ' module sees (D7A7)');
                const f = value(s.key, 'functions');
                if (!f) { cv.text('Not read yet', x + 24, 150, 24, t.dim); return; }
                const on = f.filter((x2) => x2.value !== 0 && x2.code !== 'ALIV');
                if (!on.length) { cv.text('Every light function reads 0', x + 24, 150, 22, t.dim); return; }
                on.slice(0, 9).forEach((o, k) => {
                    const y = 124 + k * 28;
                    cv.text(o.side + o.group + '  ' + o.name, x + 24, y, 20, t.text);
                    cv.text('0x' + o.value.toString(16).toUpperCase().padStart(2, '0'), x + w - 40, y, 20, GO, { align: 'right', font: 'bold' });
                });
                if (on.length > 9) cv.text('+' + (on.length - 9) + ' more in the saved file', x + 24, 124 + 9 * 28, 18, t.dim);
                cv.text('L / R: the lamp the status is for, 1 / 2: status group. 0 values hidden.', x + 24, 428, 16, t.dim);
            });
        }

        function drawWelcome(cv, t) {
            P.SIDES.forEach((s, i) => {
                const x = 24 + i * 788, w = 764;
                G.panel(cv, t, x, 44, w, 400, s.label + ' welcome staging (3009 / 300A)');
                const e1 = entry(s.key, 'staging1'), e2 = entry(s.key, 'staging2'), st = side(s.key) && side(s.key).staging;
                const a = statusText(e1), b = statusText(e2);
                cv.text('Staging1  ' + a.text, x + 24, 122, 20, t[a.color] || a.color);
                cv.text('Staging2  ' + b.text, x + 380, 122, 20, t[b.color] || b.color);
                if (!st) { cv.text('Not read (the module may not allow it)', x + 24, 166, 22, t.dim); return; }
                cv.text('SHA-256 ' + st.sha256.slice(0, 24) + '...', x + 24, 154, 18, t.dim);
                cv.text(st.tracks.length + ' tracks, ' + st.used + ' of 420 bytes' + (st.error ? ', ' + st.error : ''), x + 24, 184, 20, st.error ? t.warn : t.text);
                st.tracks.slice(0, 8).forEach((tr, k) => {
                    const y = 218 + k * 26;
                    cv.text('CH' + tr.id, x + 24, y, 19, t.text, { font: 'bold' });
                    cv.text(tr.pairs + ' pairs', x + 120, y, 19, t.text);
                    cv.text(tr.units + ' units  (' + (tr.units / 100).toFixed(2) + ' s at 10 ms)', x + 260, y, 19, t.dim);
                    cv.text('ends ' + tr.finalBrightness + ' %', x + w - 40, y, 19, t.dim, { align: 'right' });
                });
                if (st.tracks.length > 8) cv.text('+' + (st.tracks.length - 8) + ' more in the saved file', x + 24, 218 + 8 * 26, 18, t.dim);
            });
        }

        function drawRecord(cv, t) {
            const d = rec ? rec.data : recData;
            const total = rec ? rec.seconds * 1000 : Math.max(1000, (d && d.durationMs) || 1000);
            P.SIDES.forEach((s, i) => {
                const x = 24 + i * 788, w = 764;
                G.panel(cv, t, x, 44, w, 400, s.label + ' channel PWM (D6DB)');
                const mine = d ? d.samples.filter((v) => v.side === s.key) : [];
                if (d) {
                    const st = d.stats && d.stats[s.key];
                    cv.text(mine.length + ' samples' + (st ? ', ' + st.perSecond + '/s' : '') + (d.misses[s.key] ? ', ' + d.misses[s.key] + ' missed' : ''),
                        x + w - 24, 77, 16, t.dim, { align: 'right' });
                }
                if (!mine.length) {
                    cv.text(rec ? 'Waiting for the first reply...' : 'Press Record, then lock and unlock the car with the key', x + 24, 150, 20, t.dim);
                    return;
                }
                const px = x + 64, pw = w - 92, py = 100, ph = 240;
                [0, 50, 100].forEach((v) => {
                    const y = py + ph - v / 100 * ph;
                    cv.fillRect(px, y, pw, 1, withAlpha('#ffffff', 0.12));
                    cv.text(v + '%', px - 10, y + 5, 14, t.dim, { align: 'right' });
                });
                const secs = total / 1000, step = secs > 60 ? 20 : secs > 20 ? 10 : 5;
                for (let sec = 0; sec <= secs; sec += step) {
                    const xx = px + sec * 1000 / total * pw;
                    cv.fillRect(xx, py, 1, ph, withAlpha('#ffffff', 0.06));
                    cv.text(sec + ' s', xx, py + ph + 20, 14, t.dim, { align: 'center' });
                }
                const lit = [];
                series(d, s.key).forEach((c) => {
                    const vals = c.points.map((p) => p[1]);
                    const mx = Math.max.apply(null, vals), mn = Math.min.apply(null, vals);
                    if (mx === 0) return;                                   // never lit while recording
                    lit.push({ channel: c.channel, moved: mx !== mn });
                    const n = c.points.length, every = Math.max(1, Math.ceil(n / 350)), pts = [];
                    for (let k = 0; k < n; k += every) pts.push(c.points[k]);
                    if (pts[pts.length - 1] !== c.points[n - 1]) pts.push(c.points[n - 1]);
                    const xy = pts.map((p) => [px + Math.min(p[0], total) / total * pw, py + ph - p[1] / 100 * ph]);
                    if (xy.length > 1) cv.polyline(xy, 2, PALETTE[c.channel - 1]);
                });
                lit.forEach((m, k) => {
                    const lx = x + 24 + (k % 8) * 92, ly = 392 + Math.floor(k / 8) * 24;
                    cv.fillRect(lx, ly - 9, 16, 4, PALETTE[m.channel - 1]);
                    cv.text('Ch ' + m.channel + (m.moved ? '' : ' flat'), lx + 22, ly - 3, 15, m.moved ? t.text : t.dim);
                });
            });
        }

        async function render() {
            const t = ctx.theme(), cv = ctx.canvas(W, H).clear(t.bg);
            [drawModules, drawLedMap, drawChannels, drawFunctions, drawWelcome, drawRecord][page](cv, t);
            // footer: what is happening, where it was saved, and the read-only promise
            const y = 470 + G.pageBottom(cv) - G.BOTTOM;
            const mode = useDemo() ? 'DEMO DATA' : link.available ? 'CAR' : 'NO LINK';
            G.pill(cv, t, 24, y - 22, 150, 30, mode, { color: useDemo() ? 'warn' : link.available ? GO : 'crit', size: 16 });
            cv.text(progress || phase || 'Press Read to read both modules', 196, y, 20, busy || rec ? t.accent : t.text);
            if (!rec) cv.text('Read only: UDS 22 only' + (savedAs ? '   Saved: ' + savedAs : ''), W - 24, y, 18, t.dim, { align: 'right' });
            G.frame(cv, t, PAGES, page, [busy && { text: 'READING' }, rec && { text: 'REC' }, useDemo() && { text: 'DEMO' }]);
            await ui.image('MAIN_GFX', cv);
        }

        const go = (p) => { page = (p + PAGES.length) % PAGES.length; return render(); };
        ui.onClick('BTN_SCAN', () => { scan(); });
        ui.onClick('BTN_PAGE', () => go(page + 1));
        ui.onClick('BTN_REC', () => { record(); });
        ctx.onTab((i) => go(i));
        settings.onChange(() => render().catch(() => {}));

        // the channel page shows live values only when read again: no polling, so the link stays quiet
        ctx.loop('MAIN', 2, render);
        render().catch((e) => log.warn('first render: ' + e));
        if (settings.get('readOnOpen')) scan();
    },
});
