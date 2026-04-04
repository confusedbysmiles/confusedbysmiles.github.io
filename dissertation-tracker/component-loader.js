// dissertation-tracker/component-loader.js
// Loads shared header and footer from the parent directory.

async function loadComponent(elementId, filePath) {
    try {
        const response = await fetch(filePath);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        let html = await response.text();

        // Fix relative asset paths so the shared header image resolves correctly
        html = html.replace(/src="sam-servellon/g, 'src="../sam-servellon');

        const element = document.getElementById(elementId);
        if (element) element.innerHTML = html;
    } catch (error) {
        console.error(`Error loading ${filePath}:`, error);
    }
}

document.addEventListener('DOMContentLoaded', async function () {
    await loadComponent('header-placeholder', '../header.html');
    await loadComponent('footer-placeholder', '../footer.html');
});
