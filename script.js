// Animate loading bars when page loads
document.addEventListener('DOMContentLoaded', () => {
    const statCards = document.querySelectorAll('.stat-card');

    // Set up Intersection Observer for scroll-based animations
    const observerOptions = {
        threshold: 0.2,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                animateStatCard(entry.target);
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // Observe each stat card
    statCards.forEach(card => {
        observer.observe(card);
    });

    // Initial animation for cards already in view
    setTimeout(() => {
        statCards.forEach(card => {
            const rect = card.getBoundingClientRect();
            if (rect.top < window.innerHeight && rect.bottom > 0) {
                animateStatCard(card);
            }
        });
    }, 100);
});

function animateStatCard(card) {
    const progressFill = card.querySelector('.progress-fill');
    const percentageText = card.querySelector('.percentage');
    const targetPercent = parseFloat(card.dataset.percent);

    // Animate the progress bar
    setTimeout(() => {
        progressFill.style.width = targetPercent + '%';
    }, 100);

    // Animate the percentage number
    animateNumber(percentageText, 0, targetPercent, 2000);
}

function animateNumber(element, start, end, duration) {
    const startTime = performance.now();
    const range = end - start;

    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Easing function for smooth animation
        const easeOutCubic = 1 - Math.pow(1 - progress, 3);
        const current = start + (range * easeOutCubic);

        // Format number with appropriate decimal places
        let displayValue;
        if (end >= 10) {
            displayValue = current.toFixed(0);
        } else {
            displayValue = current.toFixed(1);
        }

        element.textContent = displayValue + '%';

        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            // Ensure we end on the exact target value
            element.textContent = (end % 1 === 0 ? end.toFixed(0) : end.toFixed(1)) + '%';
        }
    }

    requestAnimationFrame(update);
}

// Optional: Add hover effects for additional interactivity
document.querySelectorAll('.stat-card').forEach(card => {
    card.addEventListener('mouseenter', () => {
        const progressFill = card.querySelector('.progress-fill');
        progressFill.style.filter = 'brightness(1.2)';
    });

    card.addEventListener('mouseleave', () => {
        const progressFill = card.querySelector('.progress-fill');
        progressFill.style.filter = 'brightness(1)';
    });
});

// Add a subtle parallax effect on scroll
let ticking = false;

window.addEventListener('scroll', () => {
    if (!ticking) {
        window.requestAnimationFrame(() => {
            const scrolled = window.pageYOffset;
            const header = document.querySelector('header');
            if (header) {
                header.style.transform = `translateY(${scrolled * 0.3}px)`;
                header.style.opacity = 1 - (scrolled / 500);
            }
            ticking = false;
        });
        ticking = true;
    }
});
