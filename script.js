document.documentElement.classList.add('js');

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Analytics: PostHog is the only tracker loaded (see the snippet in <head>).
function track(event, props) {
    try {
        if (window.posthog && typeof window.posthog.capture === 'function') {
            window.posthog.capture(event, props);
        }
    } catch (e) { /* analytics must never break the page */ }
}

function formatPercent(value) {
    if (value < 1) return value.toFixed(2);
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

document.addEventListener('DOMContentLoaded', () => {
    const statCards = Array.from(document.querySelectorAll('.stat-card'));
    const filterBtns = document.querySelectorAll('.filter-btn');
    const searchInput = document.getElementById('searchInput');
    const categorySections = document.querySelectorAll('.category-section');
    const emptyState = document.getElementById('emptyState');
    const toast = document.getElementById('toastNotification');

    // 1. Tally line in the masthead
    const tally = document.getElementById('tally');
    if (tally) {
        const values = statCards.map(c => parseFloat(c.dataset.percent));
        const done = values.filter(v => v >= 100).length;
        const half = values.filter(v => v >= 50 && v < 100).length;
        const low = values.filter(v => v < 20).length;
        tally.innerHTML = [`<strong>${done}</strong> finished`, `<strong>${half}</strong> past halfway`, `<strong>${low}</strong> under 20%`]
            .map(part => `<span class="tally-part">${part}</span>`).join(' · ');
    }

    // 2. Bars fill in chunky steps, like a real progress bar, as soon as they scroll in.
    //    Text and numbers are in the HTML already, so nothing waits on this.
    function fillRow(card, delay = 0) {
        const fill = card.querySelector('.progress-fill');
        const label = card.querySelector('.percentage');
        if (!fill) return;
        const target = parseFloat(card.dataset.percent);
        const final = formatPercent(target) + '%';

        if (prefersReducedMotion) {
            fill.style.width = target + '%';
            return;
        }

        const steps = 12;
        let i = 0;
        fill.style.width = '0%';
        setTimeout(function step() {
            i++;
            const t = i / steps;
            // Ease out, with a little stall now and then: progress bars never move evenly
            const eased = 1 - Math.pow(1 - t, 2.2);
            const width = i === steps ? target : target * eased * (0.94 + Math.random() * 0.06);
            fill.style.width = width + '%';
            if (label) label.textContent = i === steps ? final : formatPercent(Math.round(width * 10) / 10) + '%';
            if (i < steps) setTimeout(step, 45 + Math.random() * 35);
        }, delay);
    }

    const observer = new IntersectionObserver((entries) => {
        let batch = 0;
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            observer.unobserve(entry.target);
            fillRow(entry.target, batch++ * 50);
        });
    }, { rootMargin: '0px 0px 80px 0px' });
    statCards.forEach(card => observer.observe(card));

    statCards.forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.closest('.share-btn')) return;
            if (!card.getAttribute('href')) return;
            track('card_click', { item_id: card.getAttribute('href'), item_name: card.querySelector('h3')?.textContent });
        });
    });

    // 3. Share modal
    let lastShareOpener = null;
    let currentShareTitle = '';
    const shareModal = document.getElementById('shareModal');
    const modalClose = document.getElementById('modalClose');
    const modalTitle = document.getElementById('modalTitle');
    const modalStatQuote = document.getElementById('modalStatQuote');
    const tweetBtn = document.getElementById('tweetBtn');
    const redditBtn = document.getElementById('redditBtn');
    const embedSnippet = document.getElementById('embedSnippet');

    document.querySelectorAll('.share-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            const { title, percent, url: relUrl } = btn.dataset;
            // Resolve against the current page so the /world-loading-bars/ sub-path is kept
            const baseUrl = new URL(relUrl, window.location.href).href.split(/[?#]/)[0];
            const withUtm = (source, medium) => `${baseUrl}?utm_source=${source}&utm_medium=${medium}`;
            const quote = (url) => `Humanity is at ${percent} on "${title}". ${url}`;

            currentShareTitle = title;
            modalTitle.textContent = title;
            modalStatQuote.textContent = quote(withUtm('share_button', 'referral'));
            tweetBtn.href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(quote(withUtm('twitter', 'social_share')))}`;
            redditBtn.href = `https://reddit.com/submit?title=${encodeURIComponent(`Humanity is at ${percent} on ${title}`)}&url=${encodeURIComponent(withUtm('reddit', 'social_share'))}`;
            embedSnippet.value = `<iframe src="${withUtm('embed_widget', 'embed')}" width="100%" height="280" frameborder="0"></iframe>`;

            lastShareOpener = document.activeElement;
            shareModal.classList.add('active');
            modalClose.focus();
            track('share_modal_open', { item_name: title });
        });
    });

    function closeShareModal() {
        if (!shareModal.classList.contains('active')) return;
        shareModal.classList.remove('active');
        if (lastShareOpener && document.contains(lastShareOpener)) lastShareOpener.focus();
    }
    modalClose?.addEventListener('click', closeShareModal);
    shareModal?.addEventListener('click', (e) => { if (e.target === shareModal) closeShareModal(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeShareModal(); });

    document.getElementById('copyQuoteBtn')?.addEventListener('click', () => {
        navigator.clipboard.writeText(modalStatQuote.textContent);
        showToast('Copied');
        track('share', { method: 'copy_link', item_id: currentShareTitle });
    });
    tweetBtn?.addEventListener('click', () => track('share', { method: 'twitter', item_id: currentShareTitle }));
    redditBtn?.addEventListener('click', () => track('share', { method: 'reddit', item_id: currentShareTitle }));
    document.getElementById('copyEmbedBtn')?.addEventListener('click', () => {
        navigator.clipboard.writeText(embedSnippet.value);
        showToast('Embed code copied');
        track('share', { method: 'embed_copy', item_id: currentShareTitle });
    });

    let toastTimer;
    function showToast(message) {
        if (!toast) return;
        toast.textContent = message;
        toast.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
    }

    // 4. Filters and search
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            applyFilters(btn.dataset.filter, searchInput ? searchInput.value : '');
            track('filter', { filter: btn.dataset.filter });
        });
    });

    if (searchInput) {
        let searchTimeout;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                const activeFilter = document.querySelector('.filter-btn.active')?.dataset.filter || 'all';
                applyFilters(activeFilter, e.target.value);
            }, 120);
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key !== '/' || !searchInput) return;
        const tag = (e.target.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;
        e.preventDefault();
        searchInput.focus();
    });

    function applyFilters(category, searchQuery) {
        const query = searchQuery.toLowerCase().trim();
        let totalVisible = 0;

        categorySections.forEach(section => {
            let visibleCount = 0;
            section.querySelectorAll('.stat-card').forEach(card => {
                const haystack = (card.dataset.search + ' ' + card.querySelector('h3').textContent).toLowerCase();
                const show = (category === 'all' || section.dataset.categoryGroup === category)
                    && (!query || haystack.includes(query));
                card.style.display = show ? '' : 'none';
                if (show) visibleCount++;
            });
            section.style.display = visibleCount ? '' : 'none';
            totalVisible += visibleCount;
        });

        if (emptyState) emptyState.hidden = totalVisible > 0;
    }
});
