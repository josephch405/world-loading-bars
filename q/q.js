// Guess-first: hide the answer until the reader commits to a number.
// Without JS the answer is simply shown.
(function () {
    const main = document.getElementById('mainContent');
    if (!main) return;
    const answer = parseFloat(main.dataset.answer);
    const qid = main.dataset.qid;
    const box = document.querySelector('.q-guess');
    const reveal = document.querySelector('.q-answer');
    const bar = box.querySelector('.guess-bar');
    const guessFill = box.querySelector('.guess-fill');
    const answerFill = box.querySelector('.progress-fill');
    const mark = box.querySelector('.guess-mark');
    const valueEl = box.querySelector('.daily-q-value');
    const btn = box.querySelector('.daily-submit');
    const result = box.querySelector('.q-result');

    function track(event, props) {
        try { if (window.posthog && window.posthog.capture) window.posthog.capture(event, props); } catch (e) { /* never break the page */ }
    }
    const fmt = n => Number.isInteger(n) ? String(n) : n.toFixed(1);

    box.hidden = false;

    let value = 50;
    let locked = false;
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
        fromPointer(e);
    });
    bar.addEventListener('pointermove', (e) => {
        if (!locked && bar.hasPointerCapture(e.pointerId)) fromPointer(e);
    });
    bar.addEventListener('keydown', (e) => {
        if (locked) return;
        const big = e.shiftKey ? 10 : 1;
        const step = { ArrowRight: big, ArrowUp: big, ArrowLeft: -big, ArrowDown: -big, PageUp: 10, PageDown: -10 }[e.key];
        if (step) { e.preventDefault(); setValue(value + step); }
        else if (e.key === 'Home') { e.preventDefault(); setValue(0); }
        else if (e.key === 'End') { e.preventDefault(); setValue(100); }
        else if (e.key === 'Enter') { e.preventDefault(); done(); }
    });
    btn.addEventListener('click', done);

    function done() {
        if (locked) return;
        locked = true;
        box.classList.add('is-done');
        bar.tabIndex = -1;
        bar.setAttribute('role', 'img');
        bar.setAttribute('aria-label', `Answer ${fmt(answer)}, your guess ${value}`);
        btn.remove();
        guessFill.style.display = 'none';
        answerFill.style.width = answer + '%';
        valueEl.textContent = fmt(answer);
        const error = Math.round(Math.abs(value - answer) * 10) / 10;
        const pts = Math.round(Math.max(0, 100 - 2 * error));
        result.textContent = error === 0
            ? `You said ${value}. Exactly right: ${pts} points.`
            : `You said ${value}, ${value > answer ? 'too high' : 'too low'} by ${fmt(error)}: ${pts} points.`;
        reveal.classList.add('is-shown');
        track('question_page_guess', { question_id: qid, guess: value, answer, error, points: pts });
    }
})();
