/* ============================================
   Travelbit - WOW Edition JavaScript
   Particles, Tilt, Typing, Counters, Animations
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {

    // ===== CURSOR GLOW =====
    const cursorGlow = document.getElementById('cursorGlow');
    if (cursorGlow && window.innerWidth > 768) {
        let mouseX = 0, mouseY = 0;
        let glowX = 0, glowY = 0;

        document.addEventListener('mousemove', (e) => {
            mouseX = e.clientX;
            mouseY = e.clientY;
        });

        function animateCursor() {
            glowX += (mouseX - glowX) * 0.15;
            glowY += (mouseY - glowY) * 0.15;
            cursorGlow.style.transform = `translate(${glowX - 200}px, ${glowY - 200}px)`;
            cursorGlow.style.opacity = '1';
            requestAnimationFrame(animateCursor);
        }
        animateCursor();
    }

    // ===== HEADER SCROLL =====
    const header = document.getElementById('header');
    let lastScroll = 0;

    window.addEventListener('scroll', () => {
        const scrollY = window.scrollY;
        header.classList.toggle('scrolled', scrollY > 60);

        // Hide/show header on scroll direction
        if (scrollY > 400) {
            if (scrollY > lastScroll + 5) {
                header.classList.add('header-hidden');
            } else if (scrollY < lastScroll - 5) {
                header.classList.remove('header-hidden');
            }
        } else {
            header.classList.remove('header-hidden');
        }
        lastScroll = scrollY;
    }, { passive: true });

    // ===== MOBILE MENU =====
    const hamburger = document.getElementById('hamburger');
    const navMenu = document.getElementById('navMenu');
    const menuOverlay = document.getElementById('menuOverlay');

    const closeMenu = () => {
        hamburger.classList.remove('active');
        navMenu.classList.remove('open');
        menuOverlay.classList.remove('active');
        document.body.style.overflow = '';
    };

    hamburger.addEventListener('click', () => {
        const isOpen = navMenu.classList.contains('open');
        hamburger.classList.toggle('active');
        navMenu.classList.toggle('open');
        menuOverlay.classList.toggle('active');
        document.body.style.overflow = isOpen ? '' : 'hidden';
    });

    menuOverlay.addEventListener('click', closeMenu);
    navMenu.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));

    // ===== ACTIVE NAV HIGHLIGHT =====
    const sections = document.querySelectorAll('section[id]');
    const navLinks = navMenu.querySelectorAll('a');

    function updateActiveNav() {
        const scrollY = window.scrollY + 200;
        sections.forEach(section => {
            const top = section.offsetTop;
            const height = section.offsetHeight;
            const id = section.getAttribute('id');
            if (scrollY >= top && scrollY < top + height) {
                navLinks.forEach(link => {
                    link.classList.toggle('active', link.getAttribute('href') === `#${id}`);
                });
            }
        });
    }
    window.addEventListener('scroll', updateActiveNav, { passive: true });

    // ===== HERO ENTRANCE ANIMATIONS =====
    const animateInElements = document.querySelectorAll('.animate-in');
    animateInElements.forEach(el => {
        const delay = parseInt(el.dataset.delay) || 0;
        setTimeout(() => {
            el.classList.add('visible');
        }, 300 + delay);
    });

    // ===== TYPING EFFECT =====
    const typingEl = document.getElementById('typingText');
    if (typingEl) {
        const text = 'הפלטפורמה החכמה לניהול ביטוח נסיעות עסקי. כיסוי מקיף, מחירים תחרותיים, שירות 24/7 ותשלום תביעות מהיר.';
        let charIndex = 0;
        let typingStarted = false;

        function typeChar() {
            if (charIndex < text.length) {
                typingEl.textContent += text.charAt(charIndex);
                charIndex++;
                const delay = text.charAt(charIndex - 1) === '.' ? 300 :
                              text.charAt(charIndex - 1) === ',' ? 150 :
                              25 + Math.random() * 20;
                setTimeout(typeChar, delay);
            }
        }

        // Start typing after hero animates in
        setTimeout(() => {
            if (!typingStarted) {
                typingStarted = true;
                typeChar();
            }
        }, 800);
    }

    // ===== PARTICLE SYSTEM =====
    const canvas = document.getElementById('heroParticles');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        let particles = [];
        let animFrame;

        function resizeCanvas() {
            const hero = canvas.closest('.hero');
            if (hero) {
                canvas.width = hero.offsetWidth;
                canvas.height = hero.offsetHeight;
            }
        }

        class Particle {
            constructor() {
                this.reset();
            }
            reset() {
                this.x = Math.random() * canvas.width;
                this.y = Math.random() * canvas.height;
                this.size = Math.random() * 2.5 + 0.5;
                this.speedX = (Math.random() - 0.5) * 0.4;
                this.speedY = (Math.random() - 0.5) * 0.4;
                this.opacity = Math.random() * 0.4 + 0.1;
                this.hue = Math.random() > 0.5 ? '255, 107, 44' : '0, 182, 122';
            }
            update() {
                this.x += this.speedX;
                this.y += this.speedY;
                if (this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height) {
                    this.reset();
                }
            }
            draw() {
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(${this.hue}, ${this.opacity})`;
                ctx.fill();
            }
        }

        function initParticles() {
            resizeCanvas();
            particles = [];
            const count = Math.min(80, Math.floor(canvas.width * canvas.height / 15000));
            for (let i = 0; i < count; i++) {
                particles.push(new Particle());
            }
        }

        function drawLines() {
            for (let i = 0; i < particles.length; i++) {
                for (let j = i + 1; j < particles.length; j++) {
                    const dx = particles[i].x - particles[j].x;
                    const dy = particles[i].y - particles[j].y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < 120) {
                        ctx.beginPath();
                        ctx.moveTo(particles[i].x, particles[i].y);
                        ctx.lineTo(particles[j].x, particles[j].y);
                        const opacity = (1 - dist / 120) * 0.12;
                        ctx.strokeStyle = `rgba(255, 107, 44, ${opacity})`;
                        ctx.lineWidth = 0.5;
                        ctx.stroke();
                    }
                }
            }
        }

        function animateParticles() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            particles.forEach(p => {
                p.update();
                p.draw();
            });
            drawLines();
            animFrame = requestAnimationFrame(animateParticles);
        }

        initParticles();
        animateParticles();

        window.addEventListener('resize', () => {
            cancelAnimationFrame(animFrame);
            initParticles();
            animateParticles();
        });

        // Pause particles when not visible
        const heroSection = document.getElementById('home');
        const particleObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) {
                    cancelAnimationFrame(animFrame);
                } else {
                    animateParticles();
                }
            });
        }, { threshold: 0.1 });
        if (heroSection) particleObserver.observe(heroSection);
    }

    // ===== 3D TILT EFFECT =====
    if (window.innerWidth > 768) {
        const tiltCards = document.querySelectorAll('.tilt-card');
        tiltCards.forEach(card => {
            card.addEventListener('mousemove', (e) => {
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                const centerX = rect.width / 2;
                const centerY = rect.height / 2;
                const rotateX = (y - centerY) / centerY * -6;
                const rotateY = (x - centerX) / centerX * 6;

                card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
            });

            card.addEventListener('mouseleave', () => {
                card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
                card.style.transition = 'transform 0.5s ease';
                setTimeout(() => card.style.transition = '', 500);
            });

            card.addEventListener('mouseenter', () => {
                card.style.transition = 'none';
            });
        });
    }

    // ===== SCROLL REVEAL =====
    const revealElements = document.querySelectorAll('.reveal-up');
    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const delay = parseInt(entry.target.dataset.delay) || 0;
                setTimeout(() => {
                    entry.target.classList.add('visible');
                }, delay);
                revealObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -60px 0px' });

    revealElements.forEach(el => revealObserver.observe(el));

    // ===== COUNTER ANIMATION =====
    function animateCounter(el) {
        const target = parseInt(el.dataset.count);
        const suffix = el.dataset.suffix || '';
        const duration = target > 1000 ? 2500 : 2000;
        const start = performance.now();

        function update(now) {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            // Ease out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = Math.floor(eased * target);

            if (target >= 1000) {
                el.textContent = current.toLocaleString() + suffix;
            } else {
                el.textContent = current + suffix;
            }

            if (progress < 1) requestAnimationFrame(update);
        }
        requestAnimationFrame(update);
    }

    // Hero metrics counters
    const heroMetrics = document.querySelectorAll('.metric-value[data-count]');
    let heroCounterDone = false;
    setTimeout(() => {
        if (!heroCounterDone) {
            heroCounterDone = true;
            heroMetrics.forEach(el => animateCounter(el));
        }
    }, 1200);

    // Stats section counters
    const statsSection = document.getElementById('stats');
    let statsAnimated = false;
    if (statsSection) {
        new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && !statsAnimated) {
                    statsAnimated = true;
                    statsSection.querySelectorAll('.stat-number-big[data-count]').forEach(el => {
                        animateCounter(el);
                    });
                }
            });
        }, { threshold: 0.3 }).observe(statsSection);
    }

    // Experience card counter
    const expNumber = document.querySelector('.exp-number[data-count]');
    let expAnimated = false;
    if (expNumber) {
        new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && !expAnimated) {
                    expAnimated = true;
                    animateCounter(expNumber);
                }
            });
        }, { threshold: 0.3 }).observe(expNumber);
    }

    // ===== TIMELINE LINE ANIMATION =====
    const timelineLine = document.querySelector('.timeline-line');
    if (timelineLine) {
        new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    timelineLine.classList.add('animated');
                }
            });
        }, { threshold: 0.2 }).observe(timelineLine);
    }

    // ===== PARALLAX FLOATING NOTIFICATIONS =====
    if (window.innerWidth > 768) {
        const floatNotifs = document.querySelectorAll('.float-notif');
        let scrollTicking = false;

        window.addEventListener('scroll', () => {
            if (!scrollTicking) {
                requestAnimationFrame(() => {
                    const scrollY = window.scrollY;
                    floatNotifs.forEach((notif, i) => {
                        const speed = 0.03 + (i * 0.015);
                        const yOffset = scrollY * speed;
                        notif.style.transform = `translateY(${-yOffset}px)`;
                    });
                    scrollTicking = false;
                });
                scrollTicking = true;
            }
        }, { passive: true });
    }

    // ===== FORM VALIDATION =====
    const form = document.getElementById('contactForm');
    const formSuccess = document.getElementById('formSuccess');

    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            let valid = true;

            form.querySelectorAll('.form-group').forEach(g => g.classList.remove('error'));

            const name = document.getElementById('fullName');
            if (!name.value.trim() || name.value.trim().length < 2) {
                name.closest('.form-group').classList.add('error');
                valid = false;
            }

            const phone = document.getElementById('phone');
            if (!phone.value.trim() || !/^0[0-9]{1,2}-?[0-9]{7}$/.test(phone.value.replace(/\s/g, ''))) {
                phone.closest('.form-group').classList.add('error');
                valid = false;
            }

            const email = document.getElementById('email');
            if (!email.value.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
                email.closest('.form-group').classList.add('error');
                valid = false;
            }

            if (valid) {
                // Success animation
                form.style.opacity = '0';
                form.style.transform = 'scale(0.95)';
                setTimeout(() => {
                    form.style.display = 'none';
                    formSuccess.classList.add('show');
                    formSuccess.style.opacity = '1';
                    formSuccess.style.transform = 'scale(1)';
                }, 300);

                setTimeout(() => {
                    formSuccess.style.opacity = '0';
                    formSuccess.style.transform = 'scale(0.95)';
                    setTimeout(() => {
                        form.reset();
                        form.style.display = '';
                        form.style.opacity = '1';
                        form.style.transform = 'scale(1)';
                        formSuccess.classList.remove('show');
                    }, 300);
                }, 5000);
            } else {
                // Shake animation on error
                form.style.animation = 'shake 0.5s ease';
                setTimeout(() => form.style.animation = '', 500);
            }
        });

        // Live validation clear
        form.querySelectorAll('input, textarea').forEach(input => {
            input.addEventListener('input', () => {
                input.closest('.form-group').classList.remove('error');
            });

            // Focus glow effect
            input.addEventListener('focus', () => {
                input.parentElement.classList.add('focused');
            });
            input.addEventListener('blur', () => {
                input.parentElement.classList.remove('focused');
            });
        });
    }

    // ===== SMOOTH SCROLL =====
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', (e) => {
            const id = anchor.getAttribute('href');
            if (id === '#') return;
            const target = document.querySelector(id);
            if (target) {
                e.preventDefault();
                const offset = header.offsetHeight + 20;
                const targetPos = target.getBoundingClientRect().top + window.scrollY - offset;

                window.scrollTo({
                    top: targetPos,
                    behavior: 'smooth'
                });
            }
        });
    });

    // ===== MAGNETIC BUTTONS =====
    if (window.innerWidth > 768) {
        document.querySelectorAll('.btn-glow, .btn-primary').forEach(btn => {
            btn.addEventListener('mousemove', (e) => {
                const rect = btn.getBoundingClientRect();
                const x = e.clientX - rect.left - rect.width / 2;
                const y = e.clientY - rect.top - rect.height / 2;
                btn.style.transform = `translate(${x * 0.15}px, ${y * 0.15}px)`;
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.transform = '';
                btn.style.transition = 'transform 0.3s ease';
                setTimeout(() => btn.style.transition = '', 300);
            });
        });
    }

    // ===== NOTIFICATION ENTRANCE ANIMATION =====
    const heroVisual = document.querySelector('.hero-visual');
    if (heroVisual) {
        const notifs = heroVisual.querySelectorAll('.float-notif');
        notifs.forEach((notif, i) => {
            setTimeout(() => {
                notif.classList.add('visible');
            }, 1500 + (i * 400));
        });
    }

    // ===== SCROLL PROGRESS INDICATOR (subtle) =====
    const scrollIndicator = document.querySelector('.scroll-indicator');
    if (scrollIndicator) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 200) {
                scrollIndicator.style.opacity = '0';
                scrollIndicator.style.pointerEvents = 'none';
            } else {
                scrollIndicator.style.opacity = '1';
                scrollIndicator.style.pointerEvents = '';
            }
        }, { passive: true });
    }

    // ===== INTERSECTION BASED CLASS TOGGLE FOR STATS GLOW =====
    const statBoxes = document.querySelectorAll('.stat-box');
    const statsSectionEl = document.querySelector('.stats-section') || document.getElementById('stats');
    if (statBoxes.length && statsSectionEl) {
        new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('in-view');
                }
            });
        }, { threshold: 0.3 }).observe(statsSectionEl);
    }

    // ===== TESTIMONIALS CAROUSEL =====
    const carousel = document.getElementById('testimonialsCarousel');
    const track = document.getElementById('carouselTrack');
    const prevBtn = document.getElementById('carouselPrev');
    const nextBtn = document.getElementById('carouselNext');
    const dotsContainer = document.getElementById('carouselDots');

    if (carousel && track && prevBtn && nextBtn && dotsContainer) {
        const cards = track.querySelectorAll('.testimonial-card');
        const totalCards = cards.length;
        let currentPage = 0;
        let cardsPerView = 3;
        let autoPlayInterval;
        let isHovered = false;

        function getCardsPerView() {
            if (window.innerWidth <= 768) return 1;
            if (window.innerWidth <= 1024) return 2;
            return 3;
        }

        function getTotalPages() {
            return Math.ceil(totalCards / cardsPerView);
        }

        function buildDots() {
            dotsContainer.innerHTML = '';
            const totalPages = getTotalPages();
            for (let i = 0; i < totalPages; i++) {
                const dot = document.createElement('button');
                dot.classList.add('carousel-dot');
                if (i === currentPage) dot.classList.add('active');
                dot.setAttribute('aria-label', `עמוד ${i + 1}`);
                dot.addEventListener('click', () => goToPage(i));
                dotsContainer.appendChild(dot);
            }
        }

        function updateCarousel() {
            const gap = parseInt(getComputedStyle(track).gap) || 24;
            const cardWidth = cards[0].offsetWidth + gap;
            const offset = currentPage * cardsPerView * cardWidth;
            // In RTL, we move in positive direction
            track.style.transform = `translateX(${offset}px)`;

            // Update dots
            dotsContainer.querySelectorAll('.carousel-dot').forEach((dot, i) => {
                dot.classList.toggle('active', i === currentPage);
            });
        }

        function goToPage(page) {
            const totalPages = getTotalPages();
            currentPage = ((page % totalPages) + totalPages) % totalPages;
            updateCarousel();
        }

        function nextPage() {
            goToPage(currentPage + 1);
        }

        function prevPage() {
            goToPage(currentPage - 1);
        }

        function startAutoPlay() {
            stopAutoPlay();
            autoPlayInterval = setInterval(() => {
                if (!isHovered) {
                    nextPage();
                }
            }, 4000);
        }

        function stopAutoPlay() {
            if (autoPlayInterval) clearInterval(autoPlayInterval);
        }

        // Event listeners
        nextBtn.addEventListener('click', () => {
            nextPage();
            startAutoPlay(); // Reset timer
        });

        prevBtn.addEventListener('click', () => {
            prevPage();
            startAutoPlay(); // Reset timer
        });

        carousel.addEventListener('mouseenter', () => { isHovered = true; });
        carousel.addEventListener('mouseleave', () => { isHovered = false; });

        // Touch swipe support
        let touchStartX = 0;
        let touchEndX = 0;

        track.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
            stopAutoPlay();
        }, { passive: true });

        track.addEventListener('touchend', (e) => {
            touchEndX = e.changedTouches[0].screenX;
            const diff = touchStartX - touchEndX;
            // RTL: swipe left = next, swipe right = prev
            if (Math.abs(diff) > 50) {
                if (diff < 0) nextPage();
                else prevPage();
            }
            startAutoPlay();
        }, { passive: true });

        // Init
        function initCarousel() {
            cardsPerView = getCardsPerView();
            currentPage = 0;
            buildDots();
            updateCarousel();
        }

        initCarousel();
        startAutoPlay();

        window.addEventListener('resize', () => {
            const newPerView = getCardsPerView();
            if (newPerView !== cardsPerView) {
                cardsPerView = newPerView;
                currentPage = 0;
                buildDots();
                updateCarousel();
            }
        });

        // Pause autoplay when section is not visible
        new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    startAutoPlay();
                } else {
                    stopAutoPlay();
                }
            });
        }, { threshold: 0.2 }).observe(carousel);
    }

    // ===== PAGE LOAD ANIMATION =====
    document.body.classList.add('loaded');

});

// Shake keyframe (added via JS for form error)
const shakeStyle = document.createElement('style');
shakeStyle.textContent = `
    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        20% { transform: translateX(-8px); }
        40% { transform: translateX(8px); }
        60% { transform: translateX(-4px); }
        80% { transform: translateX(4px); }
    }
`;
document.head.appendChild(shakeStyle);
