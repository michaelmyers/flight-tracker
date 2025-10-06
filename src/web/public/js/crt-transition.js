// CRT Channel Switch Effect
class CRTTransition {
  constructor() {
    this.isTransitioning = false;
    this.setupTransitionElements();
    this.interceptNavigation();
  }

  setupTransitionElements() {
    // Create transition overlay elements
    const overlay = document.createElement('div');
    overlay.className = 'crt-transition-overlay';
    overlay.innerHTML = `
      <div class="crt-static"></div>
      <div class="crt-collapse"></div>
      <div class="crt-flash"></div>
    `;
    document.body.appendChild(overlay);
    this.overlay = overlay;
  }

  interceptNavigation() {
    // Intercept all navigation links
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a');
      if (link && link.href && !link.target && !this.isTransitioning) {
        // Check if it's an internal navigation link
        const currentHost = window.location.host;
        const linkUrl = new URL(link.href);

        if (linkUrl.host === currentHost) {
          e.preventDefault();
          this.transitionToPage(link.href);
        }
      }
    });

    // Handle browser back/forward buttons
    window.addEventListener('popstate', () => {
      if (!this.isTransitioning) {
        this.transitionToPage(window.location.href, true);
      }
    });
  }

  transitionToPage(url, isPopState = false) {
    if (this.isTransitioning) return;

    this.isTransitioning = true;
    this.overlay.classList.add('active');

    // Add random variations
    const variations = this.getRandomVariations();

    // Apply random CSS variables for this transition
    this.overlay.style.setProperty('--collapse-duration', `${variations.collapseDuration}ms`);
    this.overlay.style.setProperty('--static-intensity', variations.staticIntensity);
    this.overlay.style.setProperty('--collapse-curve', variations.collapseEasing);
    this.overlay.style.setProperty('--glow-color', variations.glowColor);
    this.overlay.style.setProperty('--distortion-amount', `${variations.distortion}px`);

    // Add random effect classes
    if (variations.hasFlicker) {
      this.overlay.classList.add('flicker');
    }
    if (variations.hasRoll) {
      this.overlay.classList.add('roll');
    }
    if (variations.hasWobble) {
      this.overlay.classList.add('wobble');
    }

    // Play the transition sequence with random timings
    setTimeout(() => {
      this.overlay.classList.add('collapsing');
    }, 50 + Math.random() * 100);

    setTimeout(() => {
      this.overlay.classList.add('static-noise');
    }, 250 + Math.random() * 100);

    setTimeout(() => {
      // Navigate to the new page
      if (!isPopState) {
        window.location.href = url;
      } else {
        window.location.reload();
      }
    }, 450 + Math.random() * 150);
  }

  getRandomVariations() {
    return {
      collapseDuration: 250 + Math.random() * 150, // 250-400ms
      staticIntensity: 0.7 + Math.random() * 0.3, // 0.7-1.0
      collapseEasing: this.getRandomEasing(),
      glowColor: this.getRandomGlowColor(),
      distortion: 1 + Math.random() * 3, // 1-4px
      hasFlicker: Math.random() > 0.7, // 30% chance
      hasRoll: Math.random() > 0.8, // 20% chance
      hasWobble: Math.random() > 0.85 // 15% chance
    };
  }

  getRandomEasing() {
    const easings = [
      'cubic-bezier(0.55, 0.055, 0.675, 0.19)',
      'cubic-bezier(0.895, 0.03, 0.685, 0.22)',
      'cubic-bezier(0.755, 0.05, 0.855, 0.06)',
      'cubic-bezier(0.47, 0, 0.745, 0.715)'
    ];
    return easings[Math.floor(Math.random() * easings.length)];
  }

  getRandomGlowColor() {
    const hue = 120 + (Math.random() * 20 - 10); // Green with slight variation
    const saturation = 80 + Math.random() * 20; // 80-100%
    const lightness = 50 + Math.random() * 10; // 50-60%
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  }

  // Initialize on page load
  static init() {
    // Add a small delay to ensure the page is ready
    setTimeout(() => {
      // Check if we just arrived from another page
      const fromTransition = sessionStorage.getItem('crt-transition');
      const transitionOverlay = document.querySelector('.crt-transition-overlay');

      if (fromTransition === 'true' && transitionOverlay) {
        // Clear the flag
        sessionStorage.removeItem('crt-transition');

        // Play the "turning on" animation
        transitionOverlay.classList.add('active', 'static-noise', 'turning-on');

        setTimeout(() => {
          transitionOverlay.classList.remove('static-noise');
          transitionOverlay.classList.add('expanding');
        }, 200);

        setTimeout(() => {
          transitionOverlay.classList.remove('active', 'turning-on', 'expanding');
        }, 600);
      }
    }, 10);
  }
}

// Set flag before navigation
window.addEventListener('beforeunload', () => {
  const overlay = document.querySelector('.crt-transition-overlay');
  if (overlay && overlay.classList.contains('active')) {
    sessionStorage.setItem('crt-transition', 'true');
  }
});

// Initialize when DOM is ready and expose global function
let crtTransitionInstance = null;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    crtTransitionInstance = new CRTTransition();
    CRTTransition.init();
  });
} else {
  crtTransitionInstance = new CRTTransition();
  CRTTransition.init();
}

// Expose global function for external control to trigger channel changes
window.startChannelChange = function(callback) {
  if (!crtTransitionInstance) {
    // Fallback if instance isn't ready
    if (callback) callback();
    return;
  }

  // Create or get overlay
  const overlay = crtTransitionInstance.overlay || document.querySelector('.crt-transition-overlay');
  if (!overlay) {
    if (callback) callback();
    return;
  }

  // Mark that we're transitioning
  crtTransitionInstance.isTransitioning = true;
  overlay.classList.add('active');

  // Apply random variations for channel change effect
  const variations = crtTransitionInstance.getRandomVariations();
  overlay.style.setProperty('--collapse-duration', `${variations.collapseDuration}ms`);
  overlay.style.setProperty('--static-intensity', variations.staticIntensity);
  overlay.style.setProperty('--collapse-curve', variations.collapseEasing);
  overlay.style.setProperty('--glow-color', variations.glowColor);
  overlay.style.setProperty('--distortion-amount', `${variations.distortion}px`);

  // Add effect classes
  if (variations.hasFlicker) overlay.classList.add('flicker');
  if (variations.hasRoll) overlay.classList.add('roll');
  if (variations.hasWobble) overlay.classList.add('wobble');

  // Play transition sequence
  setTimeout(() => {
    overlay.classList.add('collapsing');
  }, 50 + Math.random() * 100);

  setTimeout(() => {
    overlay.classList.add('static-noise');
  }, 250 + Math.random() * 100);

  setTimeout(() => {
    sessionStorage.setItem('crt-transition', 'true');
    if (callback) callback();
  }, 450 + Math.random() * 150);
};