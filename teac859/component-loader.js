// teac859/component-loader.js
// Loads shared header/footer from the shared/ directory at the repo root.

async function loadComponent(elementId, filePath) {
    try {
        const response = await fetch(filePath);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const html = await response.text();
        const element = document.getElementById(elementId);
        if (element) element.innerHTML = html;
    } catch (error) {
        console.error(`Error loading ${filePath}:`, error);
    }
}

function setActiveNavLink() {
    const currentPath = window.location.pathname;
    const currentPage = currentPath.split('/').pop() || 'index.html';
    const pageName = currentPage.replace('.html', '');

    const navMap = {
        'pedagogy': 'nav-pedagogy',
        'experience': 'nav-experience',
        'publications': 'nav-publications',
        'activities': 'nav-activities',
        'classes': 'nav-classes'
    };

    const navId = navMap[pageName];
    if (navId) {
        setTimeout(() => {
            const navLink = document.getElementById(navId);
            if (navLink) navLink.classList.add('active');
        }, 100);
    }
}

document.addEventListener('DOMContentLoaded', async function () {
    await loadComponent('header-placeholder', '../shared/header.html');
    await loadComponent('footer-placeholder', '../shared/footer.html');
    setActiveNavLink();
});
