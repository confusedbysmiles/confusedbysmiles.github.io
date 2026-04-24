// dissertation-tracker/component-loader.js
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

document.addEventListener('DOMContentLoaded', async function () {
    await loadComponent('header-placeholder', '../shared/header.html');
    await loadComponent('footer-placeholder', '../shared/footer.html');
});
