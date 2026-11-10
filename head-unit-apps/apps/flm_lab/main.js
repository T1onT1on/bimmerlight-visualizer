'use strict';
/**
 * FLM Lab - EXPERIMENTAL control of the two front light modules (FLM2) from the head unit.
 *
 * Sends BMW's FLM02 lighting jobs over the head unit's diagnostic link (lab.js): a light function such as
 * the coded welcome animation (2E D6DC), or one LED channel at a PWM (31 01 A54B). Every request and the
 * module's answer go to the Log page and to data/flm_lab_log.jsonl.
 *
 * Nothing is sent when the app opens, and nothing while the car moves (above 3 km/h): a running show then
 * stops and both modules get control back (31 02 A54B, default session). Read-only checks live in FLM Probe.
 *
 * Pages: Control -> Shows -> Log -> Faults.
 */
const fs = require('fs');
const path = require('path');
const mgu = require('./kit/mgu');
const G = require('./kit/gauges');
const { withAlpha } = require('./kit/canvas');
const { Diag } = require('./kit/diag');
const parked = require('./kit/parked');
const { Lab, SIDES, FUNCTIONS, CHANNELS } = require('./lab');
const { SHOWS } = require('./shows');

const W = 1600, H = 520;
const PAGES = ['Control', 'Shows', 'Log', 'Faults'];
const GO = '#2fd27a';
const FN_SECONDS = [2, 5, 10, 20, 30, 60, 255];
const CH_SECONDS = [1, 2, 5, 10, 30, 255];
const PWMS = [0, 5, 10, 20, 30, 50, 75, 100];

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const step = (list, v, d) => list[Math.max(0, Math.min(list.length - 1, list.indexOf(v) + d))];
const secText = (s) => (s === 255 ? 'until stopped' : s + ' s');

/** Stands in for the module pair when there is no diagnostic link (PC preview): answers yes after 300 ms. */
class DemoDiag {
    async physical(target, sid, data) {
        await sleep(300);
        if (sid === 0x19) return [0x59, 0x02, 0xFF];
        if (sid === 0x31 || sid === 0x2E || sid === 0x10) return [sid + 0x40].concat(data.slice(0, sid === 0x31 ? 3 : sid === 0x2E ? 2 : 1));
        return [sid + 0x40, 0x00];
    }
}

mgu.run({
    async start(ctx) {
        const { ui, settings, log } = ctx;
        const diag = await new Diag(ctx.signals, log).init();
        const demoDiag = new DemoDiag();
        const car = parked.watch(ctx, log);
        const useDemo = () => settings.get('demo') === 'on' || (settings.get('demo') === 'auto' && !diag.available);
        const logFile = path.join(ctx.dataDir, 'flm_lab_log.jsonl');

        // the Lab talks to whichever link is current: the car's, or the demo stand-in
        const link = { physical: (...a) => (useDemo() ? demoDiag : diag).physical(...a) };
        let render = async () => {};
        const lab = new Lab(link, log, {
            moving: () => car.moving(),
            onLog: (e) => { try { fs.appendFileSync(logFile, JSON.stringify(Object.assign({ demo: useDemo() }, e)) + '\n'); } catch (err) { /* full disk */ } },
            onChange: () => render().catch(() => {}),
        });

        let page = 0, fnIndex = 0, showIndex = 0;
        let fnSeconds = Number(settings.get('functionSeconds')) || 10;
        let side = 'B', ch = 12, pwm = 50, chSeconds = 2;
        let busy = false, note = '';

        const act = (label, fn) => async () => {
            if (busy) return render();
            if (car.moving()) { note = 'Car is moving: nothing is sent'; return render(); }
            busy = true; note = label + '...';
            render().catch(() => {});
            try {
                const r = await fn();
                const list = Array.isArray(r) ? r : r ? [r] : [];
                note = label + ': ' + (list.length ? list.map((x) => (x.addr ? x.addr + ' ' : '') + x.text).join(', ') : 'done');
            } catch (e) {
                note = label + ' failed: ' + (e && e.message || e);
                log.warn(note);
            } finally { busy = false; render().catch(() => {}); }
        };
        const playFn = (lv, which) => act('Function 0x' + lv.toString(16).toUpperCase(), () => lab.playFunction(lv, fnSeconds, which));
        const sendCh = act('Channel', () => lab.channel(side, ch, pwm, chSeconds));
        const stopAll = async () => { note = 'Stopping...'; render().catch(() => {}); await lab.stopAll('stop pressed'); note = 'Stopped: modules have control'; return render(); };
        const playShow = (i) => async () => {
            if (lab.show) return render();
            if (car.moving()) { note = 'Car is moving: nothing is sent'; return render(); }
            showIndex = i;
            note = 'Show: ' + SHOWS[i].name;
            lab.runShow(SHOWS[i]).then(() => { note = 'Show finished: ' + SHOWS[i].name; render().catch(() => {}); })
                .catch((e) => { note = 'Show failed: ' + e; log.warn(note); });
            return render();
        };

        // ---------- drawing ----------
        function stepper(cv, t, x, y, label, value, minus, plus, wide) {
            cv.text(label, x, y + 32, 20, t.dim);
            G.button(cv, t, x + 150, y, 56, 46, '-', minus, { key: label + '-' });
            cv.text(value, x + 150 + 56 + (wide || 260) / 2, y + 31, 22, t.text, { align: 'center', font: 'bold' });
            G.button(cv, t, x + 150 + 56 + (wide || 260), y, 56, 46, '+', plus, { key: label + '+' });
        }

        function drawControl(cv, t) {
            // left: light functions
            let x = 24, w = 764;
            G.panel(cv, t, x, 44, w, 400, 'Light function (2E D6DC)');
            const f = FUNCTIONS[fnIndex];
            stepper(cv, t, x + 24, 96, 'Function', '0x' + f.lv.toString(16).toUpperCase().padStart(2, '0') + '  ' + f.name,
                () => { fnIndex = (fnIndex + FUNCTIONS.length - 1) % FUNCTIONS.length; return render(); },
                () => { fnIndex = (fnIndex + 1) % FUNCTIONS.length; return render(); }, 400);
            stepper(cv, t, x + 24, 156, 'Hold', secText(fnSeconds),
                () => { fnSeconds = step(FN_SECONDS, fnSeconds, -1); return render(); },
                () => { fnSeconds = step(FN_SECONDS, fnSeconds, 1); return render(); });
            let bx = x + 24;
            [['Play both', 'B'], ['Left', 'L'], ['Right', 'R']].forEach(([label, which]) => {
                bx += G.button(cv, t, bx, 226, 0, 52, label, playFn(f.lv, which), { primary: which === 'B', busy, key: 'fn-' + which }) + 14;
            });
            cv.text('Quick', x + 24, 330, 20, t.dim);
            bx = x + 110;
            [[0x39, 'Welcome 1'], [0x40, 'Goodbye 1'], [0x33, 'DRL']].forEach(([lv, label]) => {
                bx += G.button(cv, t, bx, 300, 0, 48, label, playFn(lv, 'B'), { busy, key: 'q-' + lv }) + 12;
            });
            cv.text('Both modules, left first. Hold: how long the module keeps it.', x + 24, 410, 16, t.dim);

            // right: one LED channel
            x = 812; w = 764;
            G.panel(cv, t, x, 44, w, 400, 'LED channel (31 01 A54B)');
            cv.text('Side', x + 24, 128, 20, t.dim);
            let sx = x + 174;
            [['Both', 'B'], ['Left', 'L'], ['Right', 'R']].forEach(([label, v]) => {
                sx += G.button(cv, t, sx, 96, 0, 46, label, () => { side = v; return render(); }, { primary: side === v, key: 'side-' + v }) + 12;
            });
            stepper(cv, t, x + 24, 152, 'Channel', ch + '  ' + CHANNELS[ch],
                () => { ch = (ch + 15) % 16; return render(); }, () => { ch = (ch + 1) % 16; return render(); }, 400);
            stepper(cv, t, x + 24, 208, 'PWM', pwm + ' %',
                () => { pwm = step(PWMS, pwm, -1); return render(); }, () => { pwm = step(PWMS, pwm, 1); return render(); });
            stepper(cv, t, x + 24, 264, 'Hold', secText(chSeconds),
                () => { chSeconds = step(CH_SECONDS, chSeconds, -1); return render(); }, () => { chSeconds = step(CH_SECONDS, chSeconds, 1); return render(); });
            let cx = x + 24;
            cx += G.button(cv, t, cx, 330, 0, 52, 'Send', sendCh, { primary: true, busy, key: 'ch-send' }) + 14;
            G.button(cv, t, cx, 330, 0, 52, 'Stop channels', act('Stop channels', () => lab.stopAll('stop channels')), { key: 'ch-stop' });
            cv.text('Channel 0 = every channel of the lamp, high beam and laser included.', x + 24, 410, 16, t.dim);
            if (!cv.own) cv.text('On-screen controls need the GPU renderer: use the bar buttons (Welcome, Play show, Stop all).', 48, 470 - 40, 18, t.warn);
        }

        function drawShows(cv, t) {
            G.panel(cv, t, 24, 44, 1552, 400, 'Light shows (about 3 commands a second over the head unit)');
            SHOWS.forEach((s, i) => {
                const y = 92 + i * 47, running = lab.show && lab.show.name === s.name;
                if (i === showIndex) cv.roundRect(40, y - 3, 1520, 44, 10, withAlpha(t.accent, 0.12));
                cv.text(s.name, 64, y + 27, 21, running ? GO : t.text, { font: 'bold' });
                cv.text(s.note + (s.loops ? '  x' + s.loops : ''), 420, y + 27, 17, t.dim);
                G.button(cv, t, 1400, y, 140, 38, running ? 'Running' : 'Play', playShow(i), { primary: running, busy: !!lab.show && !running, key: 'show-' + i });
            });
            if (lab.show) cv.text('Running ' + lab.show.name + ': step ' + lab.show.step + ' / ' + lab.show.steps + ', loop ' + lab.show.loop + ' / ' + lab.show.loops, 64, 438, 16, GO);
        }

        function drawLog(cv, t) {
            G.panel(cv, t, 24, 44, 1552, 400, 'Requests and answers (newest first, also in data/flm_lab_log.jsonl)');
            const rows = lab.entries.slice(0, 11).map((e) => [
                e.at.slice(11, 19), e.addr, e.request, { text: e.text, color: e.ok ? GO : 'warn' }, e.ms + ' ms',
            ]);
            G.table(cv, t, 48, 96, 1500, [
                { label: 'Time', w: 130 }, { label: 'ECU', w: 80 }, { label: 'Request', w: 520 }, { label: 'Answer', w: 640 }, { label: 'Took', w: 120, align: 'right' },
            ], rows, { rowH: 29, size: 18, empty: 'Nothing sent yet' });
        }

        function drawFaults(cv, t) {
            SIDES.forEach((s, i) => {
                const x = 24 + i * 788, w = 764;
                G.panel(cv, t, x, 44, w, 400, s.label + ' fault memory (19 02 0C)');
                const f = lab.faults[s.addr];
                if (!f) { cv.text('Not read yet', x + 24, 140, 22, t.dim); return; }
                if (!f.ok) { cv.text('Not read: ' + f.text, x + 24, 140, 20, t.warn); return; }
                if (!f.dtcs.length) { cv.text('No faults', x + 24, 140, 22, GO); return; }
                f.dtcs.slice(0, 9).forEach((d, k) => cv.text(d.code + '   status 0x' + d.status.toString(16).toUpperCase().padStart(2, '0'), x + 24, 128 + k * 30, 20, t.text));
                if (f.dtcs.length > 9) cv.text('+' + (f.dtcs.length - 9) + ' more', x + 24, 128 + 9 * 30, 18, t.dim);
            });
            let bx = 48;
            bx += G.button(cv, t, bx, 380, 0, 48, 'Read faults', act('Read faults', async () => { await lab.readFaults(); return null; }), { busy, key: 'f-read' }) + 14;
            G.button(cv, t, bx, 380, 0, 48, 'Clear FLM faults', act('Clear faults', async () => { await lab.clearFaults(); return null; }), { busy, confirm: true, color: t.warn, key: 'f-clear' });
        }

        render = async () => {
            const t = ctx.theme(), cv = ctx.canvas(W, H).clear(t.bg);
            [drawControl, drawShows, drawLog, drawFaults][page](cv, t);
            const y = 470 + G.pageBottom(cv) - G.BOTTOM;
            const demo = useDemo(), moving = car.moving();
            G.pill(cv, t, 24, y - 22, 130, 30, demo ? 'DEMO' : diag.available ? 'CAR' : 'NO LINK', { color: demo ? 'warn' : diag.available ? GO : 'crit', size: 16 });
            const sp = car.speed();
            G.pill(cv, t, 166, y - 22, 190, 30, moving ? 'MOVING - LOCKED' : 'PARKED', { color: moving ? 'crit' : GO, size: 16 });
            const sess = SIDES.map((s) => s.short + (lab.extended[s.addr] ? ' ext' : ' def')).join('  ');
            cv.text((note || 'Ready. Nothing has been sent.') + (sp !== null && moving ? '  (' + sp.toFixed(0) + ' km/h)' : ''), 376, y, 19, busy || lab.show ? t.accent : t.text);
            cv.text('Session ' + sess, W - 24, y, 17, t.dim, { align: 'right' });
            G.frame(cv, t, PAGES, page, [lab.show && { text: 'SHOW' }, demo && { text: 'DEMO' }, moving && { text: 'LOCKED' }]);
            await ui.image('MAIN_GFX', cv);
        };

        // driving: stop whatever runs and give the modules their control back
        let wasMoving = false;
        setInterval(() => {
            const m = car.moving();
            if (m && !wasMoving && (lab.show || SIDES.some((s) => lab.extended[s.addr]))) lab.stopAll('car moving').catch((e) => log.warn('stop: ' + e));
            wasMoving = m;
        }, 500);

        const go = (p) => { page = (p + PAGES.length) % PAGES.length; return render(); };
        ui.onClick('BTN_WELCOME', playFn(0x39, 'B'));
        ui.onClick('BTN_SHOW', () => playShow(showIndex)());
        ui.onClick('BTN_STOP', stopAll);
        ui.onClick('BTN_PAGE', () => go(page + 1));
        ctx.onTab((i) => go(i));
        settings.onChange((key) => { if (key === 'functionSeconds') fnSeconds = Number(settings.get('functionSeconds')) || fnSeconds; render().catch(() => {}); });

        ctx.loop('MAIN', 5, render);
        render().catch((e) => log.warn('first render: ' + e));
    },
});
