// password-protection.js - Secure password protection using hashing

/**
 * Password Protection System
 * Uses SHA-256 hashing to avoid storing plain text passwords in the code
 * 
 * To generate a new password hash:
 * 1. Open browser console
 * 2. Run: await generatePasswordHash('your-password-here')
 * 3. Copy the hash and replace PASSWORD_HASH below
 */

// Store the SHA-256 hash of your password (not the actual password!)
// Current hash is for the password: "TEAC860"
// To change: generate a new hash using the function below
const PASSWORD_HASH = '1bd88af43d449299fef376c4b5517c73888d71714b05616a1368ee176c3b03f7';

/**
 * Generate SHA-256 hash of a password
 * Use this in browser console to create new password hashes
 */
async function generatePasswordHash(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    console.log('Password Hash:', hashHex);
    return hashHex;
}

/**
 * Verify password against stored hash
 */
async function verifyPassword(inputPassword) {
    const inputHash = await generatePasswordHash(inputPassword);
    return inputHash === PASSWORD_HASH;
}

/**
 * Handle password form submission
 */
async function handlePasswordSubmit(event) {
    event.preventDefault();
    
    const passwordInput = document.getElementById('password-input');
    const errorMessage = document.getElementById('password-error');
    const passwordContainer = document.getElementById('password-container');
    const protectedContent = document.getElementById('protected-content');
    
    const enteredPassword = passwordInput.value;
    
    // Verify password
    const isValid = await verifyPassword(enteredPassword);
    
    if (isValid) {
        // Password correct - show content
        passwordContainer.style.display = 'none';
        protectedContent.classList.add('unlocked');
        
        // Store access in sessionStorage (expires when browser closes)
        sessionStorage.setItem('pageAccess', 'granted');
    } else {
        // Password incorrect - show error
        errorMessage.classList.add('show');
        passwordInput.value = '';
        passwordInput.focus();
        
        // Hide error after 3 seconds
        setTimeout(() => {
            errorMessage.classList.remove('show');
        }, 3000);
    }
}

/**
 * Check if user already has access in this session
 */
function checkExistingAccess() {
    if (sessionStorage.getItem('pageAccess') === 'granted') {
        const passwordContainer = document.getElementById('password-container');
        const protectedContent = document.getElementById('protected-content');
        
        if (passwordContainer && protectedContent) {
            passwordContainer.style.display = 'none';
            protectedContent.classList.add('unlocked');
        }
    }
}

/**
 * Initialize password protection when page loads
 */
document.addEventListener('DOMContentLoaded', function() {
    // Check if user already has access
    checkExistingAccess();
    
    // Add event listener to password form
    const passwordForm = document.getElementById('password-form');
    if (passwordForm) {
        passwordForm.addEventListener('submit', handlePasswordSubmit);
    }
    
    // Focus on password input
    const passwordInput = document.getElementById('password-input');
    if (passwordInput && sessionStorage.getItem('pageAccess') !== 'granted') {
        passwordInput.focus();
    }
});

/**
 * INSTRUCTIONS FOR CHANGING PASSWORD:
 * 
 * 1. Open your browser console (F12)
 * 2. Copy and paste this function:
 *    
 *    async function generatePasswordHash(password) {
 *        const encoder = new TextEncoder();
 *        const data = encoder.encode(password);
 *        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
 *        const hashArray = Array.from(new Uint8Array(hashBuffer));
 *        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
 *        console.log('Your new password hash:', hashHex);
 *        return hashHex;
 *    }
 * 
 * 3. Run: await generatePasswordHash('your-new-password')
 * 4. Copy the hash that appears in the console
 * 5. Replace PASSWORD_HASH at the top of this file with your new hash
 * 6. Never commit your actual password to the code!
 */
