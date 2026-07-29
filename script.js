document.addEventListener('DOMContentLoaded', () => {
    const statCards = Array.from(document.querySelectorAll('.stat-card'));
    const filterBtns = document.querySelectorAll('.filter-btn');
    const searchInput = document.getElementById('searchInput');
    const categorySections = document.querySelectorAll('.category-section');
    
    // Modal Elements
    const shareModal = document.getElementById('shareModal');
    const modalClose = document.getElementById('modalClose');
    const modalTitle = document.getElementById('modalTitle');
    const modalStatQuote = document.getElementById('modalStatQuote');
    const copyQuoteBtn = document.getElementById('copyQuoteBtn');
    const tweetBtn = document.getElementById('tweetBtn');
    const redditBtn = document.getElementById('redditBtn');
    const embedSnippet = document.getElementById('embedSnippet');
    const copyEmbedBtn = document.getElementById('copyEmbedBtn');
    const toast = document.getElementById('toastNotification');

    // Hero Highlight Elements
    const heroCard = document.getElementById('heroCard');

    let currentShareData = { title: '', percent: '', url: '' };

    // 1. Feature Hero Highlight
    function setRandomHeroCard() {
        if (!statCards.length || !heroCard) return;

        const randomIndex = Math.floor(Math.random() * statCards.length);
        const card = statCards[randomIndex];

        const title = card.querySelector('h3').textContent;
        const description = card.querySelector('.description').textContent;
        const percent = card.dataset.percent;
        const color = card.dataset.color || 'blue';
        const tag = card.querySelector('.tag-badge')?.textContent || 'METRIC';
        const linkHref = card.getAttribute('href');

        heroCard.setAttribute('href', linkHref);
        heroCard.dataset.color = color;
        
        heroCard.innerHTML = `
            <div class="hero-badge-row">
                <span class="tag-badge ${color}">⚡ FEATURED HIGHLIGHT</span>
                <span class="tag-badge outline">${tag}</span>
            </div>
            <div class="hero-content">
                <div class="hero-text">
                    <h2>${title}</h2>
                    <p>${description}</p>
                </div>
                <div class="hero-progress-group">
                    <div class="hero-percentage">${percent}%</div>
                    <div class="hero-progress-bar">
                        <div class="hero-progress-fill" style="width: ${percent}%"></div>
                    </div>
                </div>
            </div>
            <div class="hero-footer">
                <span>Click to view detailed metrics & timeline →</span>
            </div>
        `;
    }

    // Initialize Hero Spotlight
    setRandomHeroCard();

    // 2. Intersection Observer for Scroll-triggered Animations
    const observerOptions = {
        threshold: 0.15,
        rootMargin: '0px 0px -40px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                animateStatCard(entry.target);
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    statCards.forEach(card => {
        observer.observe(card);
        
        card.addEventListener('click', (e) => {
            if (e.target.classList.contains('share-btn')) return;

            const title = card.querySelector('h3')?.textContent || 'Card';
            if (typeof gtag === 'function') {
                gtag('event', 'select_content', {
                    content_type: 'loading_bar_card',
                    item_id: card.getAttribute('href'),
                    item_name: title
                });
            }
        });
    });

    // 3. Share Modal Triggers
    document.querySelectorAll('.share-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            const title = btn.dataset.title;
            const percent = btn.dataset.percent;
            const relUrl = btn.dataset.url;
            const fullUrl = window.location.origin + '/' + relUrl;

            currentShareData = { title, percent, url: fullUrl };

            modalTitle.textContent = `Share: ${title}`;
            const quoteText = `Humanity is currently at ${percent} on "${title}". Check out World Loading Bars: ${fullUrl}`;
            modalStatQuote.textContent = quoteText;

            // Generate Tweet & Reddit URLs
            tweetBtn.href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(quoteText)}`;
            redditBtn.href = `https://reddit.com/submit?title=${encodeURIComponent(`Humanity is at ${percent} on ${title}`)}&url=${encodeURIComponent(fullUrl)}`;

            // Embed Snippet Code
            embedSnippet.value = `<iframe src="${fullUrl}" width="100%" height="280" frameborder="0"></iframe>`;

            shareModal.classList.add('active');

            if (typeof gtag === 'function') {
                gtag('event', 'share_modal_open', { item_name: title });
            }
        });
    });

    if (modalClose) {
        modalClose.addEventListener('click', () => shareModal.classList.remove('active'));
    }
    if (shareModal) {
        shareModal.addEventListener('click', (e) => {
            if (e.target === shareModal) shareModal.classList.remove('active');
        });
    }

    // Copy Quote Button
    if (copyQuoteBtn) {
        copyQuoteBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(modalStatQuote.textContent);
            showToast("Copied stat link & quote!");
        });
    }

    // Copy Embed Snippet
    if (copyEmbedBtn) {
        copyEmbedBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(embedSnippet.value);
            showToast("Copied embed snippet HTML!");
        });
    }

    function showToast(message) {
        if (!toast) return;
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2500);
    }

    // 4. Filter Pills Handler
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const filterValue = btn.dataset.filter;
            applyFilters(filterValue, searchInput ? searchInput.value : '');
        });
    });

    // 5. Search Input Handler
    if (searchInput) {
        let searchTimeout;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                const activeFilter = document.querySelector('.filter-btn.active')?.dataset.filter || 'all';
                applyFilters(activeFilter, e.target.value);
            }, 150);
        });
    }

    function applyFilters(category, searchQuery) {
        const query = searchQuery.toLowerCase().trim();

        categorySections.forEach(section => {
            const sectionGroup = section.dataset.categoryGroup;
            const cards = section.querySelectorAll('.stat-card');
            let visibleCount = 0;

            cards.forEach(card => {
                const cardCategory = card.dataset.category;
                const cardSearchText = (card.dataset.search + ' ' + card.querySelector('h3').textContent).toLowerCase();

                const categoryMatch = (category === 'all' || cardCategory === category || sectionGroup === category);
                const searchMatch = !query || cardSearchText.includes(query);

                if (categoryMatch && searchMatch) {
                    card.style.display = 'flex';
                    visibleCount++;
                    if (!card.classList.contains('animated')) {
                        animateStatCard(card);
                    }
                } else {
                    card.style.display = 'none';
                }
            });

            if (visibleCount === 0) {
                section.style.display = 'none';
            } else {
                section.style.display = 'block';
            }
        });
    }
});

function animateStatCard(card) {
    if (card.classList.contains('animated')) return;
    card.classList.add('animated');

    const progressFill = card.querySelector('.progress-fill');
    const percentageText = card.querySelector('.percentage');
    const targetPercent = parseFloat(card.dataset.percent);

    if (progressFill) {
        setTimeout(() => {
            progressFill.style.width = targetPercent + '%';
        }, 120);
    }

    if (percentageText) {
        animateNumber(percentageText, 0, targetPercent, 1800);
    }
}

function animateNumber(element, start, end, duration) {
    const startTime = performance.now();
    const range = end - start;

    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        const easeOutCubic = 1 - Math.pow(1 - progress, 3);
        const current = start + (range * easeOutCubic);

        let displayValue;
        if (end < 1) {
            displayValue = current.toFixed(2);
        } else if (end < 10) {
            displayValue = current.toFixed(1);
        } else {
            displayValue = current.toFixed(0);
        }

        element.textContent = displayValue + '%';

        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            element.textContent = (end % 1 === 0 ? end.toFixed(0) : end < 1 ? end.toFixed(2) : end.toFixed(1)) + '%';
        }
    }

    requestAnimationFrame(update);
}
