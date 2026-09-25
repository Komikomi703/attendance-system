(() => {
    const link = document.querySelector('.chibany-entrance');
    let opening = false;
    link.addEventListener('click', event => {
        if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        if (opening) return;
        opening = true;
        link.classList.add('is-jumping');
        const target = new URL(link.href);
        target.searchParams.set('from', location.hash.slice(1) || 'home');
        setTimeout(() => location.assign(target.href), matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 320);
    });
    window.addEventListener('pageshow', () => { opening = false; link.classList.remove('is-jumping'); });
})();
