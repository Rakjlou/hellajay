/**
 * Main Application JavaScript
 * Handles form submission and smooth scrolling
 */

document.addEventListener('DOMContentLoaded', () => {
  bindContactForm();
  bindSmoothScroll();
});

/**
 * Bind contact form submission
 */
function bindContactForm() {
  const form = document.getElementById('contact-form');

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const formData = new FormData(form);
      const data = Object.fromEntries(formData);

      const submitBtn = form.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;

      try {
        submitBtn.classList.add('loading');
        submitBtn.disabled = true;

        const response = await fetch('/api/contact', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(data)
        });

        const result = await response.json();

        if (result.success) {
          showMessage(window.messages.success, 'success');
          form.reset();
        } else {
          showMessage(result.error || window.messages.error, 'error');
        }
      } catch (error) {
        console.error('Form submission error:', error);
        showMessage(window.messages.error, 'error');
      } finally {
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    });
  }
}

/**
 * Show a message to the user
 */
function showMessage(text, type = 'info') {
  // Remove any existing message
  const existingMsg = document.querySelector('.form-message');
  if (existingMsg) {
    existingMsg.remove();
  }

  // Create message element
  const msg = document.createElement('div');
  msg.className = `message message-${type} form-message`;
  msg.textContent = text;

  // Insert before submit button
  const form = document.getElementById('contact-form');
  const submitGroup = form.querySelector('button[type="submit"]').parentElement;
  submitGroup.insertAdjacentElement('beforebegin', msg);

  // Auto-remove after 5 seconds
  setTimeout(() => {
    msg.remove();
  }, 5000);
}

/**
 * Smooth scroll for anchor links
 */
function bindSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', function (e) {
      const href = this.getAttribute('href');

      // Skip if just "#"
      if (href === '#') return;

      e.preventDefault();
      const target = document.querySelector(href);

      if (target) {
        target.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });

        // Close mobile menu if open
        const mobileMenu = document.getElementById('mobile-menu');
        if (mobileMenu && mobileMenu.matches(':popover-open')) {
          mobileMenu.hidePopover();
        }
      }
    });
  });
}
