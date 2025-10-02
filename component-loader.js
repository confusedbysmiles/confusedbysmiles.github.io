// component-loader.js - Loads header and footer components dynamically

// Function to load HTML components
async function loadComponent(elementId, filePath) {
    try {
        const response = await fetch(filePath);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const html = await response.text();
        const element = document.getElementById(elementId);
        if (element) {
            element.innerHTML = html;
        }
    } catch (error) {
        console.error(`Error loading ${filePath}:`, error);
    }
}

// Function to set active navigation link based on current page
function setActiveNavLink() {
    // Get current page path
    const currentPath = window.location.pathname;
    const currentPage = currentPath.split('/').pop() || 'index.html';
    
    // Remove .html extension for comparison
    const pageName = currentPage.replace('.html', '');
    
    // Map of page names to nav IDs
    const navMap = {
        '': 'nav-home',
        'index': 'nav-home',
        'pedagogy': 'nav-pedagogy',
        'experience': 'nav-experience',
        'publications': 'nav-publications',
        'activities': 'nav-activities',
        'classes': 'nav-classes'
    };
    
    // Set active class
    const navId = navMap[pageName];
    if (navId) {
        setTimeout(() => {
            const navLink = document.getElementById(navId);
            if (navLink) {
                navLink.classList.add('active');
            }
        }, 100); // Small delay to ensure nav is loaded
    }
}

// Load components when DOM is ready
document.addEventListener('DOMContentLoaded', async function() {
    await loadComponent('header-placeholder', 'header.html');
    await loadComponent('footer-placeholder', 'footer.html');
    setActiveNavLink();
});

// Alternative: If you prefer jQuery (if you're using it)
/*
$(document).ready(function() {
    $('#header-placeholder').load('header.html', function() {
        setActiveNavLink();
    });
    $('#footer-placeholder').load('footer.html');
});
*/
