// Daily round: three questions per UTC day, the same for everyone.
// Answers come only from data/daily-questions.json. Uses track() from script.js when it loaded.

(function () {
    const DATA_URL = 'data/daily-questions.json?v=1';
    const SITE_URL = 'https://worldpercent.com/';
    const EPOCH = Date.UTC(2026, 9, 6); // day 1
    const PER_DAY = 3;
    const STATE_KEY = 'wlb.daily';
    const STATS_KEY = 'wlb.dailyStats';
    const HISTORY_KEY = 'wlb.dailyHistory';
    const DAY_MS = 86400000;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function send(event, props) {
        if (typeof window.track === 'function') window.track(event, props);
    }

    // ------------------------------------------------------------ schedule

    function hashString(str) {
        let h = 2166136261;
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }

    function mulberry32(seed) {
        return function () {
            seed = (seed + 0x6D2B79F5) | 0;
            let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // Each cycle uses every question once (cycleDays days of PER_DAY). The next
    // cycle is reshuffled, but a question shown on day p of the previous cycle can
    // only be placed on a day d with (cycleDays - p) + d >= minGap, so nothing
    // comes back within minGap days. A greedy pick always has at least
    // PER_DAY * (cycleDays - minGap + 1) candidates, so it never dead-ends.
    function cycleOrders(ids, upToCycle) {
        const sorted = ids.slice().sort();
        const cycleDays = Math.floor(sorted.length / PER_DAY);
        const minGap = Math.max(1, Math.floor(cycleDays * 0.75));

        let rng = mulberry32(hashString('daily:0'));
        let order = sorted.slice();
        for (let i = order.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [order[i], order[j]] = [order[j], order[i]];
        }

        for (let c = 1; c <= upToCycle; c++) {
            rng = mulberry32(hashString('daily:' + c));
            const prevDay = new Map();
            order.forEach((id, i) => {
                const d = Math.floor(i / PER_DAY);
                prevDay.set(id, d < cycleDays ? d : -Infinity); // leftovers weren't shown
            });
            const remaining = order.slice();
            const next = [];
            for (let slot = 0; slot < order.length; slot++) {
                const d = Math.floor(slot / PER_DAY);
                const eligible = d < cycleDays
                    ? remaining.filter(id => prevDay.get(id) <= cycleDays - minGap + d)
                    : remaining;
                const pick = eligible[Math.floor(rng() * eligible.length)];
                next.push(pick);
                remaining.splice(remaining.indexOf(pick), 1);
            }
            order = next;
        }
        return { order, cycleDays };
    }

    function idsForDay(ids, dayIndex) {
        const cycleDays = Math.floor(ids.length / PER_DAY);
        const cycle = Math.floor(dayIndex / cycleDays);
        const { order } = cycleOrders(ids, cycle);
        const start = (dayIndex % cycleDays) * PER_DAY;
        return order.slice(start, start + PER_DAY);
    }

    // ------------------------------------------------------------ storage

    function load(key) {
        try { return JSON.parse(localStorage.getItem(key)) || null; } catch (e) { return null; }
    }
    function save(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode etc. */ }
    }

    // ------------------------------------------------------------ scoring

    function points(error) {
        return Math.round(Math.max(0, 100 - 2 * error));
    }
    function roundErr(guess, answer) {
        return Math.round(Math.abs(guess - answer) * 10) / 10;
    }
    function fmt(n) {
        return Number.isInteger(n) ? String(n) : n.toFixed(1);
    }
    function blocks(pts) {
        const filled = Math.ceil(pts / 10);
        return '█'.repeat(filled) + '░'.repeat(10 - filled);
    }

    // ------------------------------------------------------------ UI

    document.addEventListener('DOMContentLoaded', () => {
        const root = document.getElementById('daily');
        if (!root) return;
        const list = document.getElementById('dailyList');
        const meta = document.getElementById('dailyMeta');
        const end = document.getElementById('dailyEnd');

        fetch(DATA_URL)
            .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
            .then(data => start(data.questions || []), () => { root.hidden = true; });

        function start(pool) {
            if (pool.length < PER_DAY) { root.hidden = true; return; }
            const byId = new Map(pool.map(q => [q.id, q]));
            const now = Date.now();
            const dayIndex = Math.max(0, Math.floor((now - EPOCH) / DAY_MS));
            const dayNumber = dayIndex + 1;

            let state = load(STATE_KEY);
            if (!state || state.day !== dayNumber || !Array.isArray(state.ids)
                || !state.ids.every(id => byId.has(id))) {
                state = { day: dayNumber, ids: idsForDay(pool.map(q => q.id), dayIndex), guesses: [] };
            }
            const questions = state.ids.map(id => byId.get(id));

            const dateLabel = new Date(EPOCH + dayIndex * DAY_MS)
                .toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
            meta.textContent = `No. ${dayNumber} · ${dateLabel}`;

            const items = questions.map((q, i) => buildItem(q, i));
            items.forEach(item => list.appendChild(item.el));

            // Restore answered questions without animation
            state.guesses.forEach((g, i) => { if (items[i]) items[i].reveal(g, false); });
            if (state.guesses.length >= questions.length) finish(false);
            else items[state.guesses.length].activate(false);

            root.hidden = false;
            send('daily_view', { day: dayNumber, answered: state.guesses.length });

            function buildItem(q, index) {
                const el = document.createElement('li');
                el.className = 'daily-q';
                el.dataset.state = 'pending';
                el.innerHTML = `
                    <p class="daily-q-num">${index + 1} / ${questions.length}</p>
                    <h3 class="daily-q-text"></h3>
                    <div class="daily-q-row">
                        <div class="progress-bar guess-bar" role="slider" tabindex="-1"
                             aria-valuemin="0" aria-valuemax="100" aria-valuenow="50" aria-valuetext="50">
                            <span class="guess-fill"></span>
                            <span class="progress-fill"></span>
                            <span class="guess-mark"></span>
                        </div>
                        <span class="percentage daily-q-value">50</span>
                        <button class="daily-submit" type="button">Submit</button>
                    </div>
                    <p class="daily-q-result" aria-live="polite"></p>`;
                const text = el.querySelector('.daily-q-text');
                text.id = `daily-q-${index}`;
                text.textContent = q.question;
                const bar = el.querySelector('.guess-bar');
                bar.setAttribute('aria-labelledby', text.id);
                const guessFill = el.querySelector('.guess-fill');
                const answerFill = el.querySelector('.progress-fill');
                const mark = el.querySelector('.guess-mark');
                const valueEl = el.querySelector('.daily-q-value');
                const submit = el.querySelector('.daily-submit');
                const result = el.querySelector('.daily-q-result');

                let value = 50;
                let locked = true;

                function setValue(v) {
                    value = Math.max(0, Math.min(100, Math.round(v)));
                    guessFill.style.width = value + '%';
                    mark.style.left = value + '%';
                    valueEl.textContent = value;
                    bar.setAttribute('aria-valuenow', value);
                    bar.setAttribute('aria-valuetext', String(value));
                }
                setValue(50);

                function fromPointer(e) {
                    const rect = bar.getBoundingClientRect();
                    setValue(((e.clientX - rect.left) / rect.width) * 100);
                }
                bar.addEventListener('pointerdown', (e) => {
                    if (locked) return;
                    e.preventDefault();
                    bar.focus();
                    bar.setPointerCapture(e.pointerId);
                    bar.classList.add('dragging');
                    fromPointer(e);
                });
                bar.addEventListener('pointermove', (e) => {
                    if (!locked && bar.hasPointerCapture(e.pointerId)) fromPointer(e);
                });
                const endDrag = () => bar.classList.remove('dragging');
                bar.addEventListener('pointerup', endDrag);
                bar.addEventListener('pointercancel', endDrag);

                bar.addEventListener('keydown', (e) => {
                    if (locked) return;
                    const big = e.shiftKey ? 10 : 1;
                    const step = {
                        ArrowRight: big, ArrowUp: big, ArrowLeft: -big, ArrowDown: -big,
                        PageUp: 10, PageDown: -10,
                    }[e.key];
                    if (step) { e.preventDefault(); setValue(value + step); }
                    else if (e.key === 'Home') { e.preventDefault(); setValue(0); }
                    else if (e.key === 'End') { e.preventDefault(); setValue(100); }
                    else if (e.key === 'Enter') { e.preventDefault(); doSubmit(); }
                });

                submit.addEventListener('click', doSubmit);

                function doSubmit() {
                    if (locked) return;
                    state.guesses[index] = value;
                    save(STATE_KEY, state);
                    const error = roundErr(value, q.answer);
                    send('daily_guess', {
                        day: dayNumber, index, question_id: q.id,
                        guess: value, answer: q.answer, error, points: points(error),
                    });
                    reveal(value, true);
                    if (index + 1 < items.length) items[index + 1].activate(true);
                    else finish(true);
                }

                function activate(focus) {
                    locked = false;
                    el.dataset.state = 'active';
                    bar.tabIndex = 0;
                    if (focus) bar.focus({ preventScroll: false });
                }

                function reveal(guess, animate) {
                    locked = true;
                    setValue(guess);
                    el.dataset.state = 'done';
                    bar.tabIndex = -1;
                    bar.setAttribute('role', 'img');
                    bar.removeAttribute('aria-valuenow');
                    bar.removeAttribute('aria-valuetext');
                    bar.setAttribute('aria-label', `Answer ${fmt(q.answer)}, your guess ${guess}`);
                    submit.remove();

                    const error = roundErr(guess, q.answer);
                    result.innerHTML = '';
                    const off = error === 0 ? 'exact' : `off by ${fmt(error)}`;
                    result.append(`Answer ${fmt(q.answer)}. You said ${guess}, ${off}. ${q.year}, `);
                    const a = document.createElement('a');
                    a.href = q.url;
                    a.target = '_blank';
                    a.rel = 'noopener';
                    a.textContent = q.source;
                    result.append(a, '.');

                    fillTo(answerFill, valueEl, q.answer, animate && !reduceMotion);
                }

                return { el, activate, reveal };
            }

            function fillTo(fill, label, target, animate) {
                const final = fmt(target);
                if (!animate) {
                    fill.style.width = target + '%';
                    label.textContent = final;
                    return;
                }
                const steps = 12;
                let i = 0;
                fill.style.width = '0%';
                (function step() {
                    i++;
                    const t = i / steps;
                    const w = i === steps ? target : target * (1 - Math.pow(1 - t, 2.2));
                    fill.style.width = w + '%';
                    label.textContent = i === steps ? final : fmt(Math.round(w * 10) / 10);
                    if (i < steps) setTimeout(step, 45 + Math.random() * 35);
                })();
            }

            function finish(justNow) {
                const pts = questions.map((q, i) => points(roundErr(state.guesses[i], q.answer)));
                const total = pts.reduce((a, b) => a + b, 0);
                const max = questions.length * 100;

                let stats = load(STATS_KEY) || { streak: 0, lastDay: 0, played: 0 };
                if (justNow && stats.lastDay !== dayNumber) {
                    stats.streak = stats.lastDay === dayNumber - 1 ? stats.streak + 1 : 1;
                    stats.lastDay = dayNumber;
                    stats.played = (stats.played || 0) + 1;
                    stats.maxStreak = Math.max(stats.maxStreak || 0, stats.streak);
                    save(STATS_KEY, stats);
                }
                const streak = stats.lastDay >= dayNumber - 1 ? stats.streak : 0;

                // Keep every finished round (also back-fills a round finished before history existed)
                let history = load(HISTORY_KEY);
                if (!Array.isArray(history)) history = [];
                if (!history.some(r => r && r.day === dayNumber)) {
                    history.push({
                        day: dayNumber,
                        q: questions.map((q, i) => [q.id, state.guesses[i], q.answer, q.topic || '']),
                    });
                    history = history.filter(r => r && Array.isArray(r.q)).sort((a, b) => a.day - b.day).slice(-1000);
                    save(HISTORY_KEY, history);
                }
                renderRecord(history, streak, Math.max(stats.maxStreak || 0, streak));

                const shareText = [
                    `World Loading Bars No. ${dayNumber}  ${total}/${max}`,
                    ...pts.map(blocks),
                    SITE_URL,
                ].join('\n');

                end.querySelector('.daily-total').textContent = total;
                end.querySelector('.daily-max').textContent = max;
                end.querySelector('.daily-share').textContent = shareText;
                const nextMs = EPOCH + (dayIndex + 1) * DAY_MS - Date.now();
                const h = Math.floor(nextMs / 3600000);
                const m = Math.floor((nextMs % 3600000) / 60000);
                end.querySelector('.daily-foot').textContent =
                    `Streak ${streak} · Next set in ${h} h ${m} min`;
                end.hidden = false;

                const copyBtn = end.querySelector('.daily-copy');
                copyBtn.onclick = () => {
                    copyText(shareText).then(ok => {
                        copyBtn.textContent = ok ? 'Copied' : 'Select and copy';
                        setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
                    });
                    send('daily_share_copy', { day: dayNumber, score: total });
                };

                if (justNow) {
                    send('daily_complete', { day: dayNumber, score: total, streak });
                }
            }
        }

        // ------------------------------------------------------------ record

        function renderRecord(history, streak, storedMax) {
            const rounds = history.filter(r => r && Array.isArray(r.q) && r.q.length);
            if (!rounds.length) return;
            const today = rounds[rounds.length - 1].day; // called right after today's round is saved
            const scoreOf = r => r.q.reduce((sum, [, g, a]) => sum + points(roundErr(g, a)), 0);
            const scores = rounds.map(scoreOf);
            const guesses = rounds.flatMap(r => r.q);

            let longest = 0, run = 0, prev = null;
            rounds.forEach(r => {
                run = prev !== null && r.day === prev + 1 ? run + 1 : 1;
                longest = Math.max(longest, run);
                prev = r.day;
            });
            const maxStreak = Math.max(longest, storedMax, streak);

            const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
            const avgScore = Math.round(avg(scores));
            const best = Math.max(...scores);
            const avgMiss = avg(guesses.map(([, g, a]) => Math.abs(g - a)));
            const high = guesses.filter(([, g, a]) => g > a).length;
            const low = guesses.filter(([, g, a]) => g < a).length;

            // Score bands of 50; the top band includes 300
            const bands = [0, 0, 0, 0, 0, 0];
            const band = sc => Math.min(5, Math.floor(sc / 50));
            scores.forEach(sc => bands[band(sc)]++);
            const todayBand = band(scores[scores.length - 1]);
            const maxBand = Math.max(...bands);

            const topics = new Map();
            guesses.forEach(([, g, a, t]) => {
                if (!t) return;
                if (!topics.has(t)) topics.set(t, []);
                topics.get(t).push(Math.abs(g - a));
            });
            const topicRows = Array.from(topics, ([t, errs]) => ({ t, n: errs.length, miss: avg(errs) }))
                .sort((a, b) => a.miss - b.miss);

            let box = end.querySelector('.daily-record');
            if (!box) {
                box = document.createElement('div');
                box.className = 'daily-record';
                end.appendChild(box);
            }
            box.innerHTML = '';

            const el = (tag, cls, text) => {
                const n = document.createElement(tag);
                if (cls) n.className = cls;
                if (text !== undefined) n.textContent = text;
                return n;
            };
            const barRow = (label, pct, value, accent) => {
                const row = el('div', 'record-row');
                row.appendChild(el('span', 'record-label', label));
                const bar = el('span', 'progress-bar record-bar' + (accent ? ' is-today' : ''));
                const fill = el('span', 'progress-fill');
                fill.style.width = pct + '%';
                bar.appendChild(fill);
                row.appendChild(bar);
                row.appendChild(el('span', 'record-value', value));
                return row;
            };

            box.appendChild(el('h3', 'record-title', 'Your record'));

            const figures = el('dl', 'record-figures');
            [['Played', rounds.length], ['Average', avgScore], ['Best', best],
             ['Streak', streak], ['Longest', maxStreak]].forEach(([k, v]) => {
                const cell = el('div');
                cell.appendChild(el('dd', null, String(v)));
                cell.appendChild(el('dt', null, k));
                figures.appendChild(cell);
            });
            box.appendChild(figures);

            box.appendChild(el('p', 'record-line',
                `Average miss ${fmt(Math.round(avgMiss * 10) / 10)} · too high ${high}, too low ${low} of ${guesses.length}`));

            const dist = el('div', 'record-block');
            dist.appendChild(el('h4', 'record-sub', 'Scores'));
            for (let b = 5; b >= 0; b--) {
                const label = b === 5 ? '250–300' : `${b * 50}–${b * 50 + 49}`;
                dist.appendChild(barRow(label, maxBand ? (bands[b] / maxBand) * 100 : 0, String(bands[b]), b === todayBand));
            }
            box.appendChild(dist);

            if (topicRows.length) {
                const tb = el('div', 'record-block');
                tb.appendChild(el('h4', 'record-sub', 'By topic, average miss'));
                topicRows.forEach(({ t, n, miss }) => {
                    const name = t.charAt(0).toUpperCase() + t.slice(1);
                    tb.appendChild(barRow(`${name} (${n})`, Math.max(0, 100 - 2 * miss), fmt(Math.round(miss * 10) / 10), false));
                });
                box.appendChild(tb);
            }

            const recent = el('div', 'record-block');
            recent.appendChild(el('h4', 'record-sub', 'Recent'));
            rounds.slice(-7).reverse().forEach(r => {
                const sc = scoreOf(r);
                recent.appendChild(barRow(`No. ${r.day}`, (sc / (r.q.length * 100)) * 100, String(sc), r.day === today));
            });
            box.appendChild(recent);
        }

        function copyText(text) {
            if (navigator.clipboard && window.isSecureContext) {
                return navigator.clipboard.writeText(text).then(() => true, () => false);
            }
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.setAttribute('readonly', '');
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            let ok = false;
            try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
            ta.remove();
            return Promise.resolve(ok);
        }
    });

    // Exposed for tests
    window.__daily = { idsForDay, cycleOrders, points };
})();
