/* Incolo Systems — small, dependency-free UI script. No third-party calls. */
(function () {
  'use strict';

  var header = document.querySelector('.site-header');
  var nav = document.getElementById('nav');
  var toggle = document.getElementById('navToggle');

  /* Header shadow on scroll */
  function onScroll() {
    if (!header) return;
    header.classList.toggle('is-scrolled', window.scrollY > 8);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* Mobile menu */
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    /* Close after tapping a link */
    nav.querySelectorAll('.nav-links a').forEach(function (a) {
      a.addEventListener('click', function () {
        nav.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
    /* Close on Escape */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) {
        nav.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.focus();
      }
    });
  }

  /* Reveal on scroll */
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var reveals = document.querySelectorAll('.reveal');
  if (reduce || !('IntersectionObserver' in window)) {
    reveals.forEach(function (el) { el.classList.add('is-in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    reveals.forEach(function (el) { io.observe(el); });
  }

  /* Current year */
  var y = document.getElementById('year');
  if (y) y.textContent = String(new Date().getFullYear());

  /* Contact form — progressive enhancement.
     With JS: submit via fetch, show inline status, no page reload.
     Without JS: the form posts normally to contact.php (still works). */
  var form = document.getElementById('contactForm');
  var status = document.getElementById('formStatus');
  var submitBtn = document.getElementById('contactSubmit');
  if (form && window.fetch) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;

      form.classList.add('is-sending');
      if (submitBtn) submitBtn.disabled = true;
      if (status) { status.textContent = ''; status.className = 'form-status'; }

      fetch(form.action, {
        method: 'POST',
        body: new URLSearchParams(new FormData(form)),
        headers: { 'X-Requested-With': 'fetch', 'Accept': 'application/json' }
      })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (res) {
          if (res.ok && res.d && res.d.ok) {
            form.reset();
            if (status) {
              status.textContent = res.d.message || 'Thank you — your enquiry has been sent.';
              status.className = 'form-status is-ok';
            }
          } else {
            if (status) {
              status.textContent = (res.d && res.d.message) || 'Something went wrong. Please email us directly.';
              status.className = 'form-status is-err';
            }
          }
        })
        .catch(function () {
          if (status) {
            status.textContent = 'Could not send right now — please email business@incolosystems.com.';
            status.className = 'form-status is-err';
          }
        })
        .finally(function () {
          form.classList.remove('is-sending');
          if (submitBtn) submitBtn.disabled = false;
        });
    });
  }
})();
