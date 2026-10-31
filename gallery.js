(() => {
  'use strict';

  const photoUrls = [
    'https://res.cloudinary.com/axgam8br/image/upload/v1793047208/IMG_1159.jpg',
    'https://res.cloudinary.com/axgam8br/image/upload/v1793047208/IMG_1161.jpg',
    'https://res.cloudinary.com/axgam8br/image/upload/v1793047209/IMG_1157.jpg',
    'https://res.cloudinary.com/axgam8br/image/upload/v1793047210/IMG_1158.jpg',
    'https://res.cloudinary.com/axgam8br/image/upload/v1793047212/IMG_1149.jpg',
    'https://res.cloudinary.com/axgam8br/image/upload/v1793047224/IMG_1106.jpg',
    'https://res.cloudinary.com/axgam8br/image/upload/v1793047224/IMG_1104.jpg',
    'https://res.cloudinary.com/axgam8br/image/upload/v1793047215/IMG_1132.jpg'
  ];

  const grid = document.querySelector('[data-nss-gallery]');
  if (!grid) return;
  const imageObserver = 'IntersectionObserver' in window
    ? new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const image = entry.target.querySelector('img');
        if (image && !image.hasAttribute('src')) image.src = image.dataset.src;
        imageObserver.unobserve(entry.target);
      });
    }, { rootMargin: '240px 0px' })
    : null;

  const lightbox = document.createElement('div');
  lightbox.className = 'nss-lightbox';
  lightbox.hidden = true;
  lightbox.setAttribute('role', 'dialog');
  lightbox.setAttribute('aria-modal', 'true');
  lightbox.setAttribute('aria-label', 'NSS event photo viewer');
  lightbox.innerHTML = `
    <div class="nss-lightbox-panel">
      <button class="nss-lightbox-close" type="button" aria-label="Close photo viewer">×</button>
      <button class="nss-lightbox-nav nss-lightbox-prev" type="button" aria-label="Previous photo">‹</button>
      <figure class="nss-lightbox-figure">
        <div class="nss-lightbox-loading" aria-hidden="true"></div>
        <img class="nss-lightbox-image" alt="" draggable="false">
        <figcaption class="nss-lightbox-caption"><span class="nss-lightbox-alt">NSS TGPCOP event photograph</span><span class="nss-lightbox-count"></span></figcaption>
      </figure>
      <button class="nss-lightbox-nav nss-lightbox-next" type="button" aria-label="Next photo">›</button>
    </div>`;
  document.body.appendChild(lightbox);

  const fullImage = lightbox.querySelector('.nss-lightbox-image');
  const loading = lightbox.querySelector('.nss-lightbox-loading');
  const counter = lightbox.querySelector('.nss-lightbox-count');
  const closeButton = lightbox.querySelector('.nss-lightbox-close');
  const previousButton = lightbox.querySelector('.nss-lightbox-prev');
  const nextButton = lightbox.querySelector('.nss-lightbox-next');
  let activeIndex = 0;
  let opener = null;
  let savedBodyOverflow = '';
  let swipeStartX = null;

  photoUrls.forEach((url, index) => {
    const button = document.createElement('button');
    button.className = `nss-gallery-photo nss-gallery-photo-${index + 1}`;
    button.type = 'button';
    button.setAttribute('aria-label', `Open NSS TGPCOP event photograph ${index + 1}`);
    button.setAttribute('aria-haspopup', 'dialog');

    const placeholder = document.createElement('span');
    placeholder.className = 'nss-gallery-placeholder';
    placeholder.setAttribute('aria-hidden', 'true');

    const image = document.createElement('img');
    image.dataset.src = url;
    image.alt = `NSS TGPCOP event photograph ${index + 1}`;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.fetchPriority = 'low';
    image.draggable = false;
    image.addEventListener('load', () => button.classList.add('is-loaded'), { once: true });
    image.addEventListener('error', () => {
      button.classList.add('is-error');
      button.disabled = true;
      const error = document.createElement('span');
      error.className = 'nss-gallery-error';
      error.textContent = 'Photo temporarily unavailable';
      button.appendChild(error);
    }, { once: true });

    const hover = document.createElement('span');
    hover.className = 'nss-gallery-hover';
    hover.setAttribute('aria-hidden', 'true');
    hover.innerHTML = '<span>View photo</span><span class="nss-gallery-zoom">↗</span>';

    button.append(placeholder, image, hover);
    button.addEventListener('click', () => openAt(index, button));
    grid.appendChild(button);
    if (imageObserver) imageObserver.observe(button);
    else image.src = url;
  });

  function showAt(index) {
    activeIndex = (index + photoUrls.length) % photoUrls.length;
    fullImage.classList.remove('is-ready', 'is-error');
    loading.hidden = false;
    fullImage.alt = `NSS TGPCOP event photograph ${activeIndex + 1}`;
    fullImage.src = photoUrls[activeIndex];
    counter.textContent = `${String(activeIndex + 1).padStart(2, '0')} / ${String(photoUrls.length).padStart(2, '0')}`;
  }

  function openAt(index, source) {
    opener = source;
    const thumbnail = source.querySelector('img');
    if (thumbnail && !thumbnail.hasAttribute('src')) thumbnail.src = thumbnail.dataset.src;
    savedBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    lightbox.hidden = false;
    document.body.classList.add('nss-lightbox-open');
    showAt(index);
    closeButton.focus();
  }

  function close() {
    if (lightbox.hidden) return;
    lightbox.hidden = true;
    document.body.classList.remove('nss-lightbox-open');
    document.body.style.overflow = savedBodyOverflow;
    fullImage.removeAttribute('src');
    if (opener && opener.isConnected) opener.focus();
  }

  fullImage.addEventListener('load', () => {
    loading.hidden = true;
    fullImage.classList.add('is-ready');
  });
  fullImage.addEventListener('error', () => {
    loading.hidden = true;
    fullImage.classList.add('is-error');
    fullImage.alt = 'Photo temporarily unavailable';
  });
  closeButton.addEventListener('click', close);
  previousButton.addEventListener('click', () => showAt(activeIndex - 1));
  nextButton.addEventListener('click', () => showAt(activeIndex + 1));
  lightbox.addEventListener('click', event => {
    if (event.target === lightbox || !event.target.closest('.nss-lightbox-image, .nss-lightbox button')) close();
  });
  lightbox.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); showAt(activeIndex - 1); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); showAt(activeIndex + 1); }
  });
  lightbox.addEventListener('touchstart', event => { swipeStartX = event.changedTouches[0]?.clientX ?? null; }, { passive: true });
  lightbox.addEventListener('touchend', event => {
    if (swipeStartX === null) return;
    const delta = event.changedTouches[0].clientX - swipeStartX;
    swipeStartX = null;
    if (Math.abs(delta) > 48) showAt(activeIndex + (delta < 0 ? 1 : -1));
  }, { passive: true });
})();
