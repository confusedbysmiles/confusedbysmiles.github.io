// edps936/component-loader.js
// Mirrors the root component-loader but fetches header/footer from the parent directory.

async function loadComponent(elementId, filePath) {
    try {
        const response = await fetch(filePath);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        let html = await response.text();

        // Fix relative asset paths that the shared header uses (image lives at root)
        html = html.replace(/src="sam-servellon/g, 'src="../sam-servellon');

        const element = document.getElementById(elementId);
        if (element) {
            element.innerHTML = html;
        }
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
            if (navLink) {
                navLink.classList.add('active');
            }
        }, 100);
    }
}

document.addEventListener('DOMContentLoaded', async function () {
    await loadComponent('header-placeholder', '../header.html');
    await loadComponent('footer-placeholder', '../footer.html');
    setActiveNavLink();
});
