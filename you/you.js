// "Which of the 100 are you?" Ten yes/no questions against world shares
// from ../data/daily-questions.json. Answers stay in the browser; the share
// link carries them as ?r=<ten 0/1 digits> so a friend can compare.
(function () {
    'use strict';

    const SITE = 'https://worldpercent.com/you/';

    // id: question in data/daily-questions.json. invert: the data counts "no".
    // Not in the daily set: share of the world above the $30/day line
    // (World Bank PIP, 2024: 80.7% live below it).
    const EXTRA = {
        'pip-above-30': { answer: 19.3, year: 2024, url: 'https://pip.worldbank.org/' },
    };
    const QUESTIONS = [
        { id: 'it-net-user-zs', q: 'Do you use the internet?', hint: 'Yes, reading this counts.',
          yes: 'use the internet', no: 'don’t use the internet' },
        { id: 'eg-elc-accs-zs', q: 'Do you have electricity at home?',
          yes: 'have electricity at home', no: 'have no electricity at home' },
        { id: 'sh-h2o-smdw-zs', q: 'Is there safe drinking water at your home whenever you need it?', hint: 'Clean, on the premises, available when needed.',
          yes: 'have safe water at home', no: 'lack safe water at home' },
        { id: 'fx-own-totl-zs', q: 'Do you have a bank or mobile-money account?', hint: 'Counted among adults.',
          yes: 'have a bank or mobile-money account', no: 'have no bank or mobile-money account' },
        { id: 'sp-urb-totl-in-zs', q: 'Do you live in a city or town?',
          yes: 'live in a city or town', no: 'live in the countryside' },
        { id: 'si-pov-umic', q: 'Do you live on more than $8.30 a day?', hint: 'Income or spending per person, adjusted for local prices.', invert: true,
          yes: 'live on more than $8.30 a day', no: 'live on less than $8.30 a day' },
        { id: 'pip-above-30', q: 'Do you live on more than $30 a day?', hint: 'Roughly a rich-country poverty line, adjusted for local prices.',
          yes: 'live on more than $30 a day', no: 'live on less than $30 a day' },
        { id: 'sm-pop-totl-zs', q: 'Do you live outside the country you were born in?',
          yes: 'live outside the country they were born in', no: 'live in the country they were born in' },
        { id: 'sh-prv-smok', q: 'Do you smoke or use tobacco?', hint: 'Counted among adults.',
          yes: 'use tobacco', no: 'don’t use tobacco' },
        { id: 'sp-pop-65up-to-zs', q: 'Are you 65 or older?',
          yes: 'are 65 or older', no: 'are under 65' },
    ];

    const $ = id => document.getElementById(id);
    const send = (name, props) => {
        try { if (window.posthog && posthog.capture) posthog.capture(name, props || {}); } catch (e) { /* ignore */ }
    };
    const fmt = n => (n >= 10 || n === 0 ? String(Math.round(n)) : n.toFixed(1).replace(/\.0$/, ''));

    let data = {};        // id -> question record
    let answers = [];     // 1 / 0 per question
    let idx = 0;

    const friend = (() => {
        const r = new URLSearchParams(location.search).get('r');
        return r && /^[01]+$/.test(r) && r.length === QUESTIONS.length ? r.split('').map(Number) : null;
    })();

    function yesShare(i) {
        const rec = data[QUESTIONS[i].id];
        return QUESTIONS[i].invert ? 100 - rec.answer : rec.answer;
    }
    // How many of 100 answer the way you did.
    function likeYou(i, a) {
        const y = yesShare(i);
        return Math.round((a ? y : 100 - y) * 10) / 10;
    }
    function trait(i, a) { return a ? QUESTIONS[i].yes : QUESTIONS[i].no; }

    // ---------------------------------------------------------------- quiz

    function renderDots(n) {
        const dots = $('dots');
        dots.innerHTML = '';
        dots.classList.toggle('is-majority', n >= 50);
        const whole = Math.floor(n);
        for (let k = 0; k < 100; k++) {
            const s = document.createElement('span');
            if (k < whole) s.className = 'on';
            else if (k === whole && n - whole >= 0.05) {
                s.className = 'part';
                s.style.setProperty('--p', Math.round((n - whole) * 100) + '%');
            }
            dots.appendChild(s);
        }
    }

    function showQuestion() {
        const q = QUESTIONS[idx];
        $('step').textContent = `${idx + 1} / ${QUESTIONS.length}`;
        $('qText').textContent = q.q;
        $('qHint').textContent = q.hint || '';
        $('reveal').hidden = true;
        document.querySelectorAll('.you-ans').forEach(b => {
            b.disabled = false;
            b.classList.remove('is-picked');
        });
        document.querySelector('.you-ans').focus();
    }

    function answer(a, btn) {
        if (answers.length > idx) return;
        answers.push(a);
        document.querySelectorAll('.you-ans').forEach(b => { b.disabled = true; });
        btn.classList.add('is-picked');
        const n = likeYou(idx, a);
        renderDots(n);
        const lead = n < 50 ? 'Only ' : '';
        $('revealText').innerHTML = `${lead}<strong class="${n < 50 ? '' : 'is-majority'}">${fmt(n)}</strong> of 100 people ${trait(idx, a)}, like you.`;
        $('nextBtn').textContent = idx === QUESTIONS.length - 1 ? 'See your result' : 'Next';
        $('reveal').hidden = false;
        $('nextBtn').focus();
    }

    function next() {
        idx++;
        if (idx < QUESTIONS.length) showQuestion();
        else showResult();
    }

    // ---------------------------------------------------------------- result

    function summary() {
        const rows = answers.map((a, i) => ({ i, a, n: likeYou(i, a) }));
        const minority = rows.filter(r => r.n < 50);
        const rarest = rows.reduce((m, r) => (r.n < m.n ? r : m), rows[0]);
        const common = rows.reduce((m, r) => (r.n > m.n ? r : m), rows[0]);
        return { rows, minority: minority.length, rarest, common };
    }

    function headlineText(s) {
        if (s.minority === 0) return 'You live like most of the world on all ten.';
        if (s.minority === 1) return 'You’re in the minority on 1 of 10.';
        return `You’re in the minority on ${s.minority} of 10.`;
    }

    function shareText(s) {
        const code = answers.join('');
        const bar = s.rows.map(r => (r.n < 50 ? '🟧' : '⬛')).join('');
        return [
            'Which of the 100 are you?',
            headlineText(s),
            s.rarest.n < 50
                ? `Rarest: only ${fmt(s.rarest.n)} of 100 people ${trait(s.rarest.i, s.rarest.a)}.`
                : `Rarest: ${fmt(s.rarest.n)} of 100 people ${trait(s.rarest.i, s.rarest.a)}.`,
            bar,
            `Compare: ${SITE}?r=${code}`,
        ].join('\n');
    }

    function showResult() {
        $('quiz').hidden = true;
        $('result').hidden = false;
        const s = summary();
        $('headline').textContent = headlineText(s);
        $('subline').innerHTML = s.rarest.n < 50
            ? `Your rarest answer: only <strong>${fmt(s.rarest.n)}</strong> of 100 people ${trait(s.rarest.i, s.rarest.a)}.`
            : `Even your rarest answer is shared by <strong>${fmt(s.rarest.n)}</strong> of 100 people: they ${trait(s.rarest.i, s.rarest.a)}.`;

        if (friend) {
            const same = answers.filter((a, i) => a === friend[i]).length;
            $('compare').textContent = `You and your friend answered the same on ${same} of 10.`;
            $('compare').hidden = false;
        }

        const list = $('rows');
        list.innerHTML = '';
        s.rows.forEach(r => {
            const rec = data[QUESTIONS[r.i].id];
            const li = document.createElement('li');
            li.className = 'you-row ' + (r.n < 50 ? 'is-minority' : 'is-majority');
            const label = trait(r.i, r.a);
            li.innerHTML =
                `<div><a href="${rec.slug ? `../q/${rec.slug}.html` : rec.url}">${label.charAt(0).toUpperCase() + label.slice(1)}</a>` +
                `<span class="you-row-ans">You said ${r.a ? 'yes' : 'no'}${friend ? ` · friend said ${friend[r.i] ? 'yes' : 'no'}` : ''}</span></div>` +
                `<div class="progress-bar" role="img" aria-label="${fmt(r.n)} of 100"><span class="progress-fill" style="width:${r.n}%"></span></div>` +
                `<span class="you-row-num">${fmt(r.n)}</span>`;
            list.appendChild(li);
        });

        $('shareText').textContent = shareText(s);
        $('result').scrollIntoView({ block: 'start' });
        send('you_complete', { minority: s.minority, answers: answers.join(''), friend: !!friend });
        try { localStorage.setItem('wlb_you_answers', answers.join('')); } catch (e) { /* ignore */ }
    }

    // ---------------------------------------------------------------- card image

    function drawCard() {
        const s = summary();
        const W = 1200, H = 630;
        const c = document.createElement('canvas');
        c.width = W; c.height = H;
        const g = c.getContext('2d');
        const css = getComputedStyle(document.documentElement);
        const v = name => css.getPropertyValue(name).trim();
        const paper = v('--paper') || '#f6f4ee', ink = v('--ink') || '#1c1b19',
            muted = v('--muted') || '#6f6b62', track = v('--track') || '#e3ded2', accent = v('--accent') || '#c4410c';

        g.fillStyle = paper; g.fillRect(0, 0, W, H);
        g.fillStyle = muted; g.font = '500 20px "IBM Plex Mono", monospace';
        g.fillText('WORLDPERCENT.COM/YOU', 60, 66);
        g.fillStyle = ink; g.font = '500 50px Newsreader, Georgia, serif';
        g.fillText('Which of the 100 are you?', 60, 128);
        g.fillStyle = accent; g.font = '500 30px Newsreader, Georgia, serif';
        g.fillText(headlineText(s), 60, 176);
        g.fillStyle = ink; g.fillRect(60, 200, W - 120, 3);

        const top = 228, rowH = 35, barX = 700, barW = 380;
        s.rows.forEach((r, k) => {
            const y = top + k * rowH;
            const minority = r.n < 50;
            g.fillStyle = ink; g.font = '400 21px "IBM Plex Sans", sans-serif';
            let label = trait(r.i, r.a);
            label = label.charAt(0).toUpperCase() + label.slice(1);
            while (g.measureText(label).width > barX - 80 && label.length > 4) label = label.slice(0, -2) + '…';
            g.fillText(label, 60, y + 18);
            // segmented bar
            const seg = 8, gap = 3, blocks = Math.floor(barW / (seg + gap));
            const filled = Math.round(blocks * r.n / 100);
            for (let b = 0; b < blocks; b++) {
                g.fillStyle = b < filled ? (minority ? accent : ink) : track;
                g.fillRect(barX + b * (seg + gap), y + 2, seg, 18);
            }
            g.fillStyle = minority ? accent : ink;
            g.font = '500 20px "IBM Plex Mono", monospace';
            g.textAlign = 'right';
            g.fillText(fmt(r.n), W - 60, y + 18);
            g.textAlign = 'left';
        });
        g.fillStyle = muted; g.font = '400 16px "IBM Plex Mono", monospace';
        g.fillText('Each bar: how many of 100 people answer the way I did. Data: World Bank.', 60, H - 22);
        return c;
    }

    function cardBlob() {
        return (document.fonts ? document.fonts.ready : Promise.resolve())
            .then(() => new Promise(res => drawCard().toBlob(res, 'image/png')));
    }

    function saveImage() {
        send('you_save_image');
        cardBlob().then(blob => {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'which-of-the-100.png';
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        });
    }

    function share() {
        const text = $('shareText').textContent;
        send('you_share', { native: !!navigator.share });
        if (!navigator.share) { copy(); return; }
        cardBlob().then(blob => {
            const file = new File([blob], 'which-of-the-100.png', { type: 'image/png' });
            const payload = navigator.canShare && navigator.canShare({ files: [file] })
                ? { text, files: [file] } : { text };
            return navigator.share(payload);
        }).catch(() => {});
    }

    function copy() {
        const text = $('shareText').textContent;
        const done = ok => {
            $('copyBtn').textContent = ok ? 'Copied' : 'Select the text below';
            setTimeout(() => { $('copyBtn').textContent = 'Copy text'; }, 1800);
        };
        send('you_copy');
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(() => done(true), () => done(false));
        } else done(false);
    }

    // ---------------------------------------------------------------- wiring

    function start() {
        answers = []; idx = 0;
        $('intro').hidden = true;
        $('result').hidden = true;
        $('quiz').hidden = false;
        showQuestion();
        send('you_start', { friend: !!friend });
    }

    if (friend) {
        $('friendNote').textContent = 'A friend sent you their answers. Take it to see where you match.';
        $('friendNote').hidden = false;
        send('you_friend_arrival');
    }

    $('startBtn').disabled = true;
    fetch('../data/daily-questions.json')
        .then(r => r.json())
        .then(json => {
            Object.assign(data, EXTRA);
            json.questions.forEach(q => { data[q.id] = q; });
            if (!QUESTIONS.every(q => data[q.id])) throw new Error('missing question data');
            $('startBtn').disabled = false;
        })
        .catch(() => {
            $('startBtn').textContent = 'Couldn’t load the data. Reload to try again.';
        });

    $('startBtn').addEventListener('click', start);
    document.querySelectorAll('.you-ans').forEach(b =>
        b.addEventListener('click', () => answer(Number(b.dataset.a), b)));
    $('nextBtn').addEventListener('click', next);
    $('shareBtn').addEventListener('click', share);
    $('imgBtn').addEventListener('click', saveImage);
    $('copyBtn').addEventListener('click', copy);
    $('againBtn').addEventListener('click', () => { window.scrollTo(0, 0); start(); });
    document.addEventListener('keydown', e => {
        if ($('quiz').hidden || e.metaKey || e.ctrlKey || e.altKey) return;
        const k = e.key.toLowerCase();
        if (!$('reveal').hidden) return;
        if (k === 'y') answer(1, document.querySelector('.you-ans[data-a="1"]'));
        if (k === 'n') answer(0, document.querySelector('.you-ans[data-a="0"]'));
    });
})();
