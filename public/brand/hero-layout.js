(() => {
  'use strict';
  const original = new WeakMap();
  let scheduled = false;
  function restore(element, property) {
    const saved = original.get(element)?.[property];
    if (!saved) return;
    element.style.removeProperty(property);
    if (saved.value) element.style.setProperty(property, saved.value, saved.priority);
  }
  function set(element, property, value) {
    if (!original.has(element)) original.set(element, {});
    const saved = original.get(element);
    saved[property] ||= {value: element.style.getPropertyValue(property), priority: element.style.getPropertyPriority(property)};
    element.style.setProperty(property, value, 'important');
  }
  function measure() {
    scheduled = false;
    if (scrollY > 4) return;
    const heading = document.querySelector('main h1, [role="main"] h1, h1');
    const hero = heading?.closest('.rr-taste-hero, section, .hero, [class*="banner"]');
    const copy = heading?.closest('.rr-taste-hero-copy') || heading?.parentElement;
    if (!heading || !hero || !copy) return;
    restore(copy, 'padding-top');
    restore(hero, 'min-height');
    const title = heading.getBoundingClientRect();
    let bottom = 0;
    for (const header of document.querySelectorAll('header, [role="banner"]')) {
      if (header.contains(heading)) continue;
      const rect = header.getBoundingClientRect();
      const style = getComputedStyle(header);
      if (rect.width <= 0 || rect.height <= 0 || rect.bottom <= 0 || rect.top > innerHeight / 2 || style.visibility === 'hidden') continue;
      if (rect.top <= title.bottom && rect.right > title.left && rect.left < title.right) bottom = Math.max(bottom, rect.bottom);
    }
    if (!bottom) return;
    document.documentElement.style.setProperty('--rr-nav-clearance', Math.ceil(bottom + 24) + 'px');
    if (title.top < bottom + 24) {
      const padding = parseFloat(getComputedStyle(copy).paddingTop) || 0;
      set(copy, 'padding-top', Math.ceil(padding + bottom + 24 - title.top) + 'px');
      const updated = heading.getBoundingClientRect(), bounds = hero.getBoundingClientRect();
      if (updated.bottom > bounds.bottom - 16) set(hero, 'min-height', Math.ceil(bounds.height + updated.bottom - bounds.bottom + 24) + 'px');
      hero.dataset.headerClearance = String(Math.ceil(bottom));
    }
  }
  const schedule = () => {if (!scheduled) {scheduled = true; requestAnimationFrame(measure);}};
  function init() {
    measure();
    addEventListener('resize', schedule);
    addEventListener('load', schedule, {once: true});
    addEventListener('scroll', () => {if (scrollY <= 4) schedule();}, {passive: true});
    document.fonts?.ready.then(schedule);
    const headers = [...document.querySelectorAll('header, [role="banner"]')];
    const transition = event => {if (headers.some(header => header.contains(event.target) || event.target.contains(header))) schedule();};
    document.addEventListener('transitionend', transition, true);
    document.addEventListener('animationend', transition, true);
    const observer = new ResizeObserver(schedule);
    document.querySelectorAll('header, [role="banner"]').forEach(header => observer.observe(header));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once: true}); else init();
})();
