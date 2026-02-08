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

// ===== i18n LANGUAGE SWITCH SYSTEM =====
(function() {
    const translations = {
        he: {
            // Navigation
            'nav.home': 'בית',
            'nav.services': 'שירותים',
            'nav.process': 'איך זה עובד',
            'nav.whyus': 'למה אנחנו',
            'nav.clients': 'לקוחות',
            'nav.contact': 'צור קשר',
            'nav.cta': 'קבלו הצעת מחיר',

            // Hero
            'hero.badge': 'ביטוח נסיעות עסקי לחו״ל',
            'hero.arrow': '\u2190',
            'hero.title1': 'ככה חברות',
            'hero.title2': 'מבטחות נסיעות',
            'hero.title3': 'לחו״ל',
            'hero.btn1': 'קבלו הצעת מחיר',
            'hero.btn2': 'גלו את השירותים',
            'hero.m1': 'חברות מבוטחות',
            'hero.m2': 'שביעות רצון',
            'hero.m3': 'זמינות מלאה',

            // Hero card
            'card.status': 'פוליסה פעילה',
            'card.title': 'הפוליסה העסקית שלכם',
            'card.desc': 'כיסוי מותאם לחברה',
            'card.b1': 'כיסוי רפואי מלא בכל העולם',
            'card.b2': 'ביטוח כבודה ומטען',
            'card.b3': 'ביטול / קיצור נסיעה',
            'card.b4': 'מוקד רפואי 24/7 בשירות AirDoctor',
            'card.b5': 'חיפוש איתור וחילוץ',
            'card.b6': 'חבות כלפי צד ג׳',
            'card.cta': 'לקבלת הצעת מחיר',

            // Float notifications
            'notif.1t': 'תביעה אושרה',
            'notif.1d': 'תוך 3 שעות',
            'notif.2t': 'כיסוי רפואי',
            'notif.2d': '100% מלא',
            'notif.3t': 'מוגנים בכל העולם',
            'notif.3d': '180+ מדינות',

            // Scroll
            'scroll.text': 'גללו למטה',

            // Marquee
            'marquee.label': 'מעל <strong>500+</strong> חברות מובילות כבר סומכות עלינו',

            // Services
            'services.tag': 'השירותים שלנו',
            'services.title': 'פתרונות ביטוח <span class="gradient-text">מותאמים אישית</span>',
            'services.subtitle': 'מגוון פתרונות ביטוח נסיעות לחו״ל, מותאמים לצרכים הייחודיים של כל חברה',
            's1.title': 'ביטוח נסיעות עסקי',
            's1.desc': 'כיסוי ביטוחי מקיף לעובדים בנסיעות עבודה לחו״ל, כולל ביטול טיסות, איחורים וכיסוי רפואי מלא',
            's2.title': 'פוליסה קבוצתית',
            's2.desc': 'פוליסת ביטוח קבוצתית לחברות עם מחירים מועדפים, ניהול מרכזי ודוחות מפורטים',
            's3.title': 'ביטוח נסיעות פרטי',
            's3.desc': 'הטבות מיוחדות לעובדי חברות בנסיעות פרטיות - חופשות משפחתיות ונסיעות פנאי',
            's4.title': 'מוקד חירום 24/7',
            's4.desc': 'מוקד סיוע זמין 24 שעות ביממה עם רופאים ישראליים אונליין לייעוץ רפואי מיידי',
            'services.cta': 'לפרטים נוספים',

            // Process
            'process.tag': 'תהליך פשוט',
            'process.title': 'איך זה <span class="gradient-text">עובד?</span>',
            'process.subtitle': 'בשלושה צעדים פשוטים - החברה שלכם מבוטחת',
            'step1.title': 'פנו אלינו',
            'step1.desc': 'מלאו טופס קצר או חייגו אלינו ונחזור אליכם תוך שעות',
            'step2.title': 'הצעה מותאמת',
            'step2.desc': 'נבנה עבורכם הצעת מחיר מותאמת אישית לצרכי החברה',
            'step3.title': 'מבוטחים!',
            'step3.desc': 'הפוליסה פעילה מיידית - העובדים מכוסים בכל נסיעה לחו״ל',

            // Why Us
            'why.tag': 'למה לבחור בנו',
            'why.title': 'היתרונות <span class="gradient-text">שלנו</span>',
            'why.subtitle': 'ניסיון רב שנים בביטוח נסיעות עסקי מאפשר לנו שירות יוצא דופן',
            'why.exp': 'שנות ניסיון',
            'why.expsub': 'בביטוח נסיעות עסקי',
            'why.companies': 'חברות',
            'why.satisfaction': 'שביעות רצון',
            'adv1.title': 'ניסיון וותק',
            'adv1.desc': 'שנים של ניסיון עם מאות חברות מרוצות בכל סדרי הגודל',
            'adv2.title': 'שירות מהיר',
            'adv2.desc': 'טיפול מיידי בתביעות והחזרים מהירים - תשלום תוך שעות',
            'adv3.title': 'מחירים תחרותיים',
            'adv3.desc': 'הצעות מחיר מותאמות עם יחס עלות-תועלת מצוין',
            'adv4.title': 'ליווי אישי',
            'adv4.desc': 'מנהל לקוח ייעודי לכל חברה עם ליווי צמוד ודוחות',

            // Stats
            'stat1': 'חברות מבוטחות',
            'stat2': 'נוסעים בשנה',
            'stat3': 'שעות שירות ביממה',
            'stat4': 'אחוז שביעות רצון',

            // Testimonials
            'test.tag': 'מה אומרים עלינו',
            'test.title': 'לקוחות <span class="gradient-text">ממליצים</span>',
            'test.subtitle': 'חברות שכבר עובדות איתנו משתפות את החוויה שלהן',

            // CTA
            'cta.title': 'מוכנים לבטח את הנסיעות העסקיות שלכם?',
            'cta.desc': 'קבלו הצעת מחיר מותאמת אישית תוך 24 שעות - בלי התחייבות',
            'cta.btn1': 'קבלו הצעת מחיר',
            'cta.btn2': 'חייגו אלינו',

            // Contact
            'contact.tag': 'צרו קשר',
            'contact.title': 'נשמח <span class="gradient-text">לשמוע מכם</span>',
            'contact.subtitle': 'מלאו את הטופס ונחזור אליכם עם הצעת מחיר מותאמת אישית',
            'contact.h3': 'דברו איתנו',
            'contact.p': 'צוות המומחים שלנו זמין לכל שאלה. נשמח לייעץ ולמצוא את הפתרון המושלם עבור החברה שלכם.',

            // Form
            'form.name': 'שם מלא *',
            'form.phone': 'טלפון *',
            'form.email': 'אימייל *',
            'form.company': 'שם החברה',
            'form.message': 'הודעה',
            'form.submit': 'שלחו הודעה',
            'form.name.ph': 'הכניסו את שמכם',
            'form.phone.ph': '05X-XXXXXXX',
            'form.email.ph': 'your@email.com',
            'form.company.ph': 'שם החברה (אופציונלי)',
            'form.message.ph': 'ספרו לנו במה נוכל לעזור...',
            'form.success.title': 'ההודעה נשלחה בהצלחה!',
            'form.success.desc': 'נחזור אליכם בהקדם האפשרי',

            // Contact info
            'ci.phone': 'טלפון',
            'ci.email': 'אימייל',
            'ci.whatsapp': 'וואטסאפ',
            'ci.address': 'כתובת',
            'ci.addressVal': 'ישראל',

            // Footer
            'footer.desc': 'פתרונות ביטוח נסיעות עסקי חכם לחברות. כיסוי מקיף, שירות מהיר ומחירים תחרותיים.',
            'footer.links': 'קישורים מהירים',
            'footer.contact': 'צרו קשר',
            'footer.copy': '\u00A9 2026 Travelbit. כל הזכויות שמורות.'
        },
        en: {
            // Navigation
            'nav.home': 'Home',
            'nav.services': 'Services',
            'nav.process': 'How It Works',
            'nav.whyus': 'Why Us',
            'nav.clients': 'Clients',
            'nav.contact': 'Contact',
            'nav.cta': 'Get a Quote',

            // Hero
            'hero.badge': 'Business Travel Insurance',
            'hero.arrow': '\u2192',
            'hero.title1': 'This is how companies',
            'hero.title2': 'insure business travel',
            'hero.title3': 'abroad',
            'hero.btn1': 'Get a Quote',
            'hero.btn2': 'Discover Services',
            'hero.m1': 'Insured Companies',
            'hero.m2': 'Satisfaction',
            'hero.m3': 'Full Availability',

            // Hero card
            'card.status': 'Active Policy',
            'card.title': 'Your Business Policy',
            'card.desc': 'Custom coverage for your company',
            'card.b1': 'Full medical coverage worldwide',
            'card.b2': 'Luggage & cargo insurance',
            'card.b3': 'Trip cancellation / curtailment',
            'card.b4': 'Medical hotline 24/7 by AirDoctor',
            'card.b5': 'Search, locate & rescue',
            'card.b6': 'Third party liability',
            'card.cta': 'Get a Quote',

            // Float notifications
            'notif.1t': 'Claim Approved',
            'notif.1d': 'Within 3 hours',
            'notif.2t': 'Medical Coverage',
            'notif.2d': '100% Full',
            'notif.3t': 'Protected Worldwide',
            'notif.3d': '180+ Countries',

            // Scroll
            'scroll.text': 'Scroll Down',

            // Marquee
            'marquee.label': 'Over <strong>500+</strong> leading companies already trust us',

            // Services
            'services.tag': 'Our Services',
            'services.title': 'Insurance Solutions <span class="gradient-text">Tailored for You</span>',
            'services.subtitle': 'A variety of travel insurance solutions tailored to the unique needs of each company',
            's1.title': 'Business Travel Insurance',
            's1.desc': 'Comprehensive coverage for employees on business trips abroad, including flight cancellations, delays and full medical coverage',
            's2.title': 'Group Policy',
            's2.desc': 'Group insurance policy for companies with preferred pricing, centralized management and detailed reports',
            's3.title': 'Private Travel Insurance',
            's3.desc': 'Special benefits for company employees on personal trips \u2014 family vacations and leisure travel',
            's4.title': '24/7 Emergency Hotline',
            's4.desc': 'Support center available 24 hours a day with Israeli doctors online for immediate medical consultation',
            'services.cta': 'Learn More',

            // Process
            'process.tag': 'Simple Process',
            'process.title': 'How Does It <span class="gradient-text">Work?</span>',
            'process.subtitle': 'In three simple steps \u2014 your company is insured',
            'step1.title': 'Contact Us',
            'step1.desc': 'Fill out a short form or call us and we\'ll get back to you within hours',
            'step2.title': 'Custom Proposal',
            'step2.desc': 'We\'ll build a personalized quote tailored to your company\'s needs',
            'step3.title': 'You\'re Insured!',
            'step3.desc': 'The policy is active immediately \u2014 employees are covered on every trip abroad',

            // Why Us
            'why.tag': 'Why Choose Us',
            'why.title': 'Our <span class="gradient-text">Advantages</span>',
            'why.subtitle': 'Years of experience in business travel insurance enable us to provide exceptional service',
            'why.exp': 'Years of Experience',
            'why.expsub': 'In business travel insurance',
            'why.companies': 'Companies',
            'why.satisfaction': 'Satisfaction',
            'adv1.title': 'Experience & Seniority',
            'adv1.desc': 'Years of experience with hundreds of satisfied companies of all sizes',
            'adv2.title': 'Fast Service',
            'adv2.desc': 'Immediate claim handling and fast refunds \u2014 payment within hours',
            'adv3.title': 'Competitive Prices',
            'adv3.desc': 'Custom quotes with excellent cost-benefit ratio',
            'adv4.title': 'Personal Support',
            'adv4.desc': 'A dedicated account manager for each company with close guidance and reports',

            // Stats
            'stat1': 'Insured Companies',
            'stat2': 'Travelers per Year',
            'stat3': 'Service Hours per Day',
            'stat4': 'Satisfaction Rate',

            // Testimonials
            'test.tag': 'What They Say',
            'test.title': 'Clients <span class="gradient-text">Recommend</span>',
            'test.subtitle': 'Companies already working with us share their experience',

            // CTA
            'cta.title': 'Ready to insure your business trips?',
            'cta.desc': 'Get a personalized quote within 24 hours \u2014 no commitment',
            'cta.btn1': 'Get a Quote',
            'cta.btn2': 'Call Us',

            // Contact
            'contact.tag': 'Contact Us',
            'contact.title': 'We\'d Love to <span class="gradient-text">Hear From You</span>',
            'contact.subtitle': 'Fill out the form and we\'ll get back to you with a personalized quote',
            'contact.h3': 'Talk to Us',
            'contact.p': 'Our expert team is available for any question. We\'d love to advise and find the perfect solution for your company.',

            // Form
            'form.name': 'Full Name *',
            'form.phone': 'Phone *',
            'form.email': 'Email *',
            'form.company': 'Company Name',
            'form.message': 'Message',
            'form.submit': 'Send Message',
            'form.name.ph': 'Enter your name',
            'form.phone.ph': '05X-XXXXXXX',
            'form.email.ph': 'your@email.com',
            'form.company.ph': 'Company name (optional)',
            'form.message.ph': 'Tell us how we can help...',
            'form.success.title': 'Message Sent Successfully!',
            'form.success.desc': 'We\'ll get back to you as soon as possible',

            // Contact info
            'ci.phone': 'Phone',
            'ci.email': 'Email',
            'ci.whatsapp': 'WhatsApp',
            'ci.address': 'Address',
            'ci.addressVal': 'Israel',

            // Footer
            'footer.desc': 'Smart business travel insurance solutions for companies. Comprehensive coverage, fast service, and competitive prices.',
            'footer.links': 'Quick Links',
            'footer.contact': 'Contact Us',
            'footer.copy': '\u00A9 2026 Travelbit. All rights reserved.'
        }
    };

    // Typing text per language
    const typingTexts = {
        he: 'הפלטפורמה החכמה לניהול ביטוח נסיעות עסקי. כיסוי מקיף, מחירים תחרותיים, שירות 24/7 ותשלום תביעות מהיר.',
        en: 'The smart platform for managing business travel insurance. Comprehensive coverage, competitive prices, 24/7 service and fast claims payment.'
    };

    let currentLang = 'he';

    function switchLang(lang) {
        if (!translations[lang]) return;
        currentLang = lang;

        // Update document direction and language
        document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
        document.documentElement.lang = lang;

        // Update body text alignment and direction
        document.body.style.textAlign = lang === 'he' ? 'right' : 'left';
        document.body.style.direction = lang === 'he' ? 'rtl' : 'ltr';

        // Update form inputs direction
        var formInputs = document.querySelectorAll('.form-group input, .form-group textarea');
        formInputs.forEach(function(input) {
            input.style.direction = lang === 'he' ? 'rtl' : 'ltr';
        });

        // Update all translatable elements
        var elements = document.querySelectorAll('[data-i18n]');
        elements.forEach(function(el) {
            var key = el.getAttribute('data-i18n');
            if (translations[lang][key] !== undefined) {
                el.innerHTML = translations[lang][key];
            }
        });

        // Update placeholders
        var phElements = document.querySelectorAll('[data-i18n-ph]');
        phElements.forEach(function(el) {
            var key = el.getAttribute('data-i18n-ph');
            if (translations[lang][key] !== undefined) {
                el.setAttribute('placeholder', translations[lang][key]);
            }
        });

        // Update active class on lang buttons
        var langBtns = document.querySelectorAll('.lang-btn');
        langBtns.forEach(function(btn) {
            btn.classList.toggle('active', btn.getAttribute('data-lang') === lang);
        });

        // Re-run typing effect with correct language
        var typingEl = document.getElementById('typingText');
        if (typingEl) {
            typingEl.textContent = '';
            var text = typingTexts[lang];
            var charIndex = 0;

            function typeChar() {
                if (charIndex < text.length) {
                    typingEl.textContent += text.charAt(charIndex);
                    charIndex++;
                    var delay = text.charAt(charIndex - 1) === '.' ? 300 :
                                text.charAt(charIndex - 1) === ',' ? 150 :
                                25 + Math.random() * 20;
                    setTimeout(typeChar, delay);
                }
            }
            typeChar();
        }

        // Store preference
        try {
            localStorage.setItem('travelbit-lang', lang);
        } catch(e) {}
    }

    // Bind click events to lang buttons
    document.addEventListener('DOMContentLoaded', function() {
        var langBtns = document.querySelectorAll('.lang-btn');
        langBtns.forEach(function(btn) {
            btn.addEventListener('click', function() {
                var lang = btn.getAttribute('data-lang');
                switchLang(lang);
            });
        });

        // Check saved preference
        try {
            var saved = localStorage.getItem('travelbit-lang');
            if (saved && saved !== 'he' && translations[saved]) {
                switchLang(saved);
            }
        } catch(e) {}
    });

    // Expose globally if needed
    window.switchLang = switchLang;
})();
