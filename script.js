document.addEventListener('DOMContentLoaded', () => {
    const statCards = Array.from(document.querySelectorAll('.stat-card'));
    const filterBtns = document.querySelectorAll('.filter-btn');
    const searchInput = document.getElementById('searchInput');
    const categorySections = document.querySelectorAll('.category-section');
    const quizModeBtn = document.getElementById('quizModeBtn');
    if (quizModeBtn) quizModeBtn.setAttribute('aria-pressed', 'false');
    
    // Modal Elements
    let lastShareOpener = null;
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
    let quizModeActive = false;

    // 1. Feature Hero Highlight
    function setRandomHeroCard() {
        if (!statCards.length || !heroCard) return;

        const candidateCards = statCards.filter(c => c.dataset.category !== 'realtime');
        const randomIndex = Math.floor(Math.random() * candidateCards.length);
        const card = candidateCards[randomIndex];

        const title = card.querySelector('h3').textContent;
        const description = card.querySelector('.description').textContent;
        const percent = card.dataset.percent;
        const displayVal = card.dataset.display || percent;
        const unit = card.dataset.unit !== undefined ? card.dataset.unit : '%';
        const prefix = card.dataset.prefix || '';
        const color = card.dataset.color || 'blue';
        const tag = card.querySelector('.tag-badge')?.textContent || 'METRIC';
        const linkHref = card.getAttribute('href') || '#';

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
                    <div class="hero-percentage">${prefix}${displayVal}${unit}</div>
                    <div class="hero-progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}" aria-label="${title}">
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

    // 2. Real-Time Temporal Ticking Engine
    function startRealtimeTicking() {
        const yearProgressFill = document.getElementById('yearProgressFill');
        const yearProgressText = document.getElementById('yearProgressText');

        if (!yearProgressText) return;

        function tick() {
            const now = new Date();
            const year = now.getUTCFullYear();
            const startOfYear = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)).getTime();
            const endOfYear = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0, 0)).getTime();
            const currentMs = now.getTime();

            const fraction = (currentMs - startOfYear) / (endOfYear - startOfYear);
            const percent = fraction * 100;

            yearProgressText.textContent = percent.toFixed(4) + '%';
            if (yearProgressFill) {
                yearProgressFill.style.width = percent.toFixed(2) + '%';
            }
            const yearProgressBar = document.getElementById('yearProgressBar');
            if (yearProgressBar) {
                yearProgressBar.setAttribute('aria-valuenow', percent.toFixed(2));
            }
        }

        tick();
        setInterval(tick, 200);
    }
    startRealtimeTicking();

    // 3. Quiz Mode ("Guess vs Reality") Engine
    function setupQuizMode() {
        statCards.forEach(card => {
            if (card.dataset.category === 'realtime') return;

            const quizBox = document.createElement('div');
            quizBox.className = 'quiz-box';
            const cardTitle = card.querySelector('h3')?.textContent || 'this metric';
            quizBox.innerHTML = `
                <div class="quiz-slider-row">
                    <input type="range" min="0" max="100" value="50" class="quiz-slider" aria-label="Your guess for ${cardTitle}">
                    <span class="quiz-val-display">50%</span>
                </div>
                <div class="quiz-btn-row">
                    <button class="check-guess-btn">Check Guess</button>
                    <span class="guess-feedback" aria-live="polite"></span>
                </div>
            `;

            const slider = quizBox.querySelector('.quiz-slider');
            const valDisplay = quizBox.querySelector('.quiz-val-display');
            const checkBtn = quizBox.querySelector('.check-guess-btn');
            const feedback = quizBox.querySelector('.guess-feedback');

            slider.addEventListener('input', (e) => {
                e.stopPropagation();
                valDisplay.textContent = slider.value + '%';
            });

            slider.addEventListener('click', (e) => e.stopPropagation());

            checkBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                const guess = parseFloat(slider.value);
                const actual = parseFloat(card.dataset.percent);
                const diff = Math.abs(guess - actual).toFixed(1);

                card.classList.add('revealed');
                card.querySelector('.percentage')?.removeAttribute('aria-hidden');
                animateStatCard(card);

                if (diff <= 5) {
                    feedback.textContent = `🎯 Spot on! (±${diff}%)`;
                    feedback.className = 'guess-feedback accurate';
                } else if (guess < actual) {
                    feedback.textContent = `📉 Underestimated by ${diff}%`;
                    feedback.className = 'guess-feedback off';
                } else {
                    feedback.textContent = `📈 Overestimated by ${diff}%`;
                    feedback.className = 'guess-feedback off';
                }

                if (typeof gtag === 'function') {
                    gtag('event', 'quiz_guess', { item_name: card.querySelector('h3').textContent, diff: diff });
                }
            });

            card.querySelector('.progress-container').after(quizBox);
        });

        if (quizModeBtn) {
            quizModeBtn.addEventListener('click', () => {
                quizModeActive = !quizModeActive;
                document.body.classList.toggle('quiz-mode-on', quizModeActive);
                quizModeBtn.classList.toggle('active', quizModeActive);
                quizModeBtn.setAttribute('aria-pressed', quizModeActive);
                quizModeBtn.textContent = quizModeActive ? '🎯 Exit Quiz Mode' : '🎮 Quiz Mode';
                // The quiz CSS blurs unrevealed percentages; hide them from screen readers as well
                statCards.forEach(card => {
                    if (card.dataset.category === 'realtime') return;
                    const pct = card.querySelector('.percentage');
                    if (pct) {
                        if (quizModeActive && !card.classList.contains('revealed')) {
                            pct.setAttribute('aria-hidden', 'true');
                        } else {
                            pct.removeAttribute('aria-hidden');
                        }
                    }
                });
                
                if (quizModeActive) {
                    showToast('Quiz Mode On: Guess the % before checking!');
                }
            });
        }
    }
    setupQuizMode();

    // 4. Intersection Observer for Scroll-triggered Animations
    const observerOptions = {
        threshold: 0.15,
        rootMargin: '0px 0px -40px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                if (!quizModeActive) {
                    animateStatCard(entry.target);
                }
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    statCards.forEach(card => {
        observer.observe(card);
        
        card.addEventListener('click', (e) => {
            if (e.target.classList.contains('share-btn') || e.target.closest('.quiz-box')) return;

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

    // 5. Share Modal Triggers
    document.querySelectorAll('.share-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            const title = btn.dataset.title;
            const percent = btn.dataset.percent;
            const relUrl = btn.dataset.url;
            const baseUrl = window.location.origin + '/' + relUrl;
            
            const shareUrlTwitter = `${baseUrl}?utm_source=twitter&utm_medium=social_share`;
            const shareUrlReddit = `${baseUrl}?utm_source=reddit&utm_medium=social_share`;
            const shareUrlCopy = `${baseUrl}?utm_source=share_button&utm_medium=referral`;

            currentShareData = { title, percent, url: shareUrlCopy };

            modalTitle.textContent = `Share: ${title}`;
            const quoteTextText = `Humanity is currently at ${percent} on "${title}". Check out World Loading Bars: ${shareUrlCopy}`;
            modalStatQuote.textContent = quoteTextText;

            // Generate Tweet & Reddit URLs with UTM campaign tracking
            const tweetQuote = `Humanity is currently at ${percent} on "${title}". Check out World Loading Bars: ${shareUrlTwitter}`;
            tweetBtn.href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetQuote)}`;
            redditBtn.href = `https://reddit.com/submit?title=${encodeURIComponent(`Humanity is at ${percent} on ${title}`)}&url=${encodeURIComponent(shareUrlReddit)}`;

            // Embed Snippet Code
            embedSnippet.value = `<iframe src="${baseUrl}?utm_source=embed_widget&utm_medium=embed" width="100%" height="280" frameborder="0"></iframe>`;

            shareModal.classList.add('active');
            lastShareOpener = document.activeElement;
            modalClose.focus();

            if (typeof gtag === 'function') {
                gtag('event', 'share_modal_open', { item_name: title });
            }
        });
    });

    function closeShareModal() {
        if (!shareModal.classList.contains('active')) return;
        shareModal.classList.remove('active');
        if (lastShareOpener && document.contains(lastShareOpener)) lastShareOpener.focus();
    }
    if (modalClose) {
        modalClose.addEventListener('click', closeShareModal);
    }
    if (shareModal) {
        shareModal.addEventListener('click', (e) => {
            if (e.target === shareModal) closeShareModal();
        });
    }
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeShareModal();
    });

    // Copy Quote Button
    if (copyQuoteBtn) {
        copyQuoteBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(modalStatQuote.textContent);
            showToast("Copied stat link & quote!");
            if (typeof gtag === 'function') {
                gtag('event', 'share', { method: 'copy_link', item_id: currentShareData.title });
            }
        });
    }

    if (tweetBtn) {
        tweetBtn.addEventListener('click', () => {
            if (typeof gtag === 'function') {
                gtag('event', 'share', { method: 'twitter', item_id: currentShareData.title });
            }
        });
    }

    if (redditBtn) {
        redditBtn.addEventListener('click', () => {
            if (typeof gtag === 'function') {
                gtag('event', 'share', { method: 'reddit', item_id: currentShareData.title });
            }
        });
    }

    // Copy Embed Snippet
    if (copyEmbedBtn) {
        copyEmbedBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(embedSnippet.value);
            showToast("Copied embed snippet HTML!");
            if (typeof gtag === 'function') {
                gtag('event', 'share', { method: 'embed_copy', item_id: currentShareData.title });
            }
        });
    }

    function showToast(message) {
        if (!toast) return;
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2500);
    }

    // 6. Filter Pills Handler
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const filterValue = btn.dataset.filter;
            applyFilters(filterValue, searchInput ? searchInput.value : '');
        });
    });

    // 7. Search Input Handler
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
                    if (!card.classList.contains('animated') && !quizModeActive) {
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
    if (card.classList.contains('animated') && !document.body.classList.contains('quiz-mode-on')) return;
    card.classList.add('animated');

    const progressFill = card.querySelector('.progress-fill');
    const percentageText = card.querySelector('.percentage');
    
    const targetPercent = parseFloat(card.dataset.percent);
    const displayEnd = card.dataset.display !== undefined ? parseFloat(card.dataset.display) : targetPercent;
    const unit = card.dataset.unit !== undefined ? card.dataset.unit : '%';
    const prefix = card.dataset.prefix || '';

    if (progressFill) {
        setTimeout(() => {
            progressFill.style.width = targetPercent + '%';
        }, 120);
    }

    if (percentageText) {
        animateNumber(percentageText, 0, displayEnd, 1800, unit, prefix);
    }
}

function animateNumber(element, start, end, duration, unit = '%', prefix = '') {
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

        element.textContent = prefix + displayValue + unit;

        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            const finalVal = (end % 1 === 0 ? end.toFixed(0) : end < 1 ? end.toFixed(2) : end.toFixed(1));
            element.textContent = prefix + finalVal + unit;
        }
    }

    requestAnimationFrame(update);
}
