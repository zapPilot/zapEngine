// DOM Content Loaded
document.addEventListener('DOMContentLoaded', function () {
  // Initialize all animations and interactions
  initScrollAnimations();
  initMobileMenu();
  initNavbarScroll();
  initCountingAnimations();
  initParallaxEffects();
  initHeroAnimations();
  initSmoothScrolling();
});

// Scroll Animations using Intersection Observer
function initScrollAnimations() {
  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px',
  };

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('animate-in');
      }
    });
  }, observerOptions);

  // Observe all animatable elements
  const animatableElements = document.querySelectorAll(
    '.feature-card, .use-case-card, .step-item, .section-header'
  );

  animatableElements.forEach(el => {
    el.classList.add('animate-on-scroll');
    observer.observe(el);
  });
}

// Mobile Menu Toggle
function initMobileMenu() {
  const mobileToggle = document.querySelector('.mobile-menu-toggle');
  const navLinks = document.querySelector('.nav-links');
  const navbar = document.querySelector('.navbar');

  if (mobileToggle && navLinks) {
    mobileToggle.addEventListener('click', () => {
      navLinks.classList.toggle('mobile-open');
      mobileToggle.classList.toggle('active');
      navbar.classList.toggle('mobile-menu-active');
    });

    // Close mobile menu when clicking on a link
    const navLinkElements = document.querySelectorAll('.nav-link');
    navLinkElements.forEach(link => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('mobile-open');
        mobileToggle.classList.remove('active');
        navbar.classList.remove('mobile-menu-active');
      });
    });
  }
}

// Navbar Scroll Effect
function initNavbarScroll() {
  const navbar = document.querySelector('.navbar');
  let lastScrollY = window.scrollY;

  window.addEventListener('scroll', () => {
    const currentScrollY = window.scrollY;

    if (currentScrollY > 100) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }

    // Hide/show navbar on scroll
    if (currentScrollY > lastScrollY && currentScrollY > 200) {
      navbar.classList.add('nav-hidden');
    } else {
      navbar.classList.remove('nav-hidden');
    }

    lastScrollY = currentScrollY;
  });
}

// Counting Animation for Stats
function initCountingAnimations() {
  const statNumbers = document.querySelectorAll('.stat-number');

  const countUp = (element, target) => {
    const increment = target / 100;
    let current = 0;

    const timer = setInterval(() => {
      current += increment;
      if (current >= target) {
        current = target;
        clearInterval(timer);
      }

      // Format numbers appropriately
      if (target >= 1000000) {
        element.textContent = (current / 1000000).toFixed(0) + 'M+';
      } else if (target >= 1000) {
        element.textContent = (current / 1000).toFixed(0) + 'K+';
      } else {
        element.textContent = Math.floor(current) + '+';
      }
    }, 20);
  };

  const statsObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const element = entry.target;
        const text = element.textContent;

        // Extract number from text
        let targetNumber;
        if (text.includes('M')) {
          targetNumber = parseFloat(text) * 1000000;
        } else if (text.includes('K')) {
          targetNumber = parseFloat(text) * 1000;
        } else {
          targetNumber = parseInt(text);
        }

        countUp(element, targetNumber);
        statsObserver.unobserve(element);
      }
    });
  });

  statNumbers.forEach(stat => {
    statsObserver.observe(stat);
  });
}

// Parallax Effects
function initParallaxEffects() {
  const gradientOrbs = document.querySelectorAll('.gradient-orb');
  const floatingCards = document.querySelectorAll('.floating-card');

  window.addEventListener('scroll', () => {
    const scrolled = window.pageYOffset;

    gradientOrbs.forEach((orb, index) => {
      const speed = 0.2 + index * 0.1;
      orb.style.transform = `translateY(${scrolled * speed}px) rotate(${scrolled * 0.1}deg)`;
    });

    floatingCards.forEach((card, index) => {
      const speed = 0.1 + index * 0.05;
      card.style.transform = `translateY(${scrolled * speed}px)`;
    });
  });
}

// Hero Animations
function initHeroAnimations() {
  // Animate dots cycling
  const dots = document.querySelectorAll('.dot');
  let currentDot = 0;

  const cycleDots = () => {
    dots.forEach(dot => dot.classList.remove('active'));
    dots[currentDot].classList.add('active');
    currentDot = (currentDot + 1) % dots.length;
  };

  // Start dot animation
  setInterval(cycleDots, 2000);

  // Phone tilt effect on mouse move
  const phoneMockup = document.querySelector('.phone-mockup');
  const heroVisual = document.querySelector('.hero-visual');

  if (phoneMockup && heroVisual) {
    heroVisual.addEventListener('mousemove', e => {
      const rect = heroVisual.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      const rotateX = ((y - centerY) / centerY) * 5;
      const rotateY = ((x - centerX) / centerX) * 5;

      phoneMockup.style.transform = `perspective(1000px) rotateX(${-rotateX}deg) rotateY(${rotateY}deg)`;
    });

    heroVisual.addEventListener('mouseleave', () => {
      phoneMockup.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg)';
    });
  }
}

// Smooth Scrolling for Navigation Links
function initSmoothScrolling() {
  const navLinks = document.querySelectorAll('a[href^="#"]');

  navLinks.forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();

      const targetId = link.getAttribute('href');
      const targetSection = document.querySelector(targetId);

      if (targetSection) {
        const offsetTop = targetSection.offsetTop - 80; // Account for fixed navbar

        window.scrollTo({
          top: offsetTop,
          behavior: 'smooth',
        });
      }
    });
  });
}

// Add CSS classes for animations
const style = document.createElement('style');
style.textContent = `
    .animate-on-scroll {
        opacity: 0;
        transform: translateY(30px);
        transition: all 0.8s ease;
    }
    
    .animate-on-scroll.animate-in {
        opacity: 1;
        transform: translateY(0);
    }
    
    .navbar.scrolled {
        background: rgba(10, 10, 15, 0.98);
        backdrop-filter: blur(20px);
    }
    
    .navbar.nav-hidden {
        transform: translateY(-100%);
    }
    
    .navbar {
        transition: all 0.3s ease;
    }
    
    .mobile-menu-toggle.active span:nth-child(1) {
        transform: rotate(45deg) translate(5px, 5px);
    }
    
    .mobile-menu-toggle.active span:nth-child(2) {
        opacity: 0;
    }
    
    .mobile-menu-toggle.active span:nth-child(3) {
        transform: rotate(-45deg) translate(7px, -6px);
    }
    
    @media (max-width: 768px) {
        .nav-links {
            position: fixed;
            top: 70px;
            left: 0;
            right: 0;
            background: rgba(10, 10, 15, 0.98);
            backdrop-filter: blur(20px);
            flex-direction: column;
            padding: 20px;
            transform: translateY(-100%);
            opacity: 0;
            transition: all 0.3s ease;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .nav-links.mobile-open {
            transform: translateY(0);
            opacity: 1;
        }
        
        .nav-links .nav-link {
            padding: 12px 0;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .nav-links .nav-link:last-child {
            border-bottom: none;
        }
        
        .nav-cta {
            margin-top: 16px;
        }
    }
    
    .phone-mockup {
        transition: transform 0.3s ease;
    }
    
    .feature-card:nth-child(1) .animate-on-scroll { animation-delay: 0.1s; }
    .feature-card:nth-child(2) .animate-on-scroll { animation-delay: 0.2s; }
    .feature-card:nth-child(3) .animate-on-scroll { animation-delay: 0.3s; }
    .feature-card:nth-child(4) .animate-on-scroll { animation-delay: 0.4s; }
    
    .use-case-card:nth-child(1) .animate-on-scroll { animation-delay: 0.1s; }
    .use-case-card:nth-child(2) .animate-on-scroll { animation-delay: 0.2s; }
    .use-case-card:nth-child(3) .animate-on-scroll { animation-delay: 0.3s; }
    
    .step-item:nth-child(1) .animate-on-scroll { animation-delay: 0.1s; }
    .step-item:nth-child(3) .animate-on-scroll { animation-delay: 0.2s; }
    .step-item:nth-child(5) .animate-on-scroll { animation-delay: 0.3s; }
`;

document.head.appendChild(style);

// Performance optimization: Throttle scroll events
function throttle(func, limit) {
  let inThrottle;
  return (...args) => {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

// Apply throttling to scroll events
const throttledParallax = throttle(initParallaxEffects, 16);
window.addEventListener('scroll', throttledParallax);

// Preload critical animations
window.addEventListener('load', () => {
  document.body.classList.add('loaded');

  // Trigger hero animations after page load
  setTimeout(() => {
    const heroElements = document.querySelectorAll(
      '.hero-badge, .hero-title .title-line, .hero-subtitle, .hero-cta, .hero-stats'
    );
    heroElements.forEach((el, index) => {
      setTimeout(() => {
        el.classList.add('animate-in');
      }, index * 100);
    });
  }, 100);
});

// Add loading states
const loadingStyle = document.createElement('style');
loadingStyle.textContent = `
    .loaded .hero-badge,
    .loaded .hero-title .title-line,
    .loaded .hero-subtitle,
    .loaded .hero-cta,
    .loaded .hero-stats {
        opacity: 0;
        transform: translateY(30px);
        transition: all 0.8s ease;
    }
    
    .loaded .hero-badge.animate-in,
    .loaded .hero-title .title-line.animate-in,
    .loaded .hero-subtitle.animate-in,
    .loaded .hero-cta.animate-in,
    .loaded .hero-stats.animate-in {
        opacity: 1;
        transform: translateY(0);
    }
`;

document.head.appendChild(loadingStyle);
