// PWA Service Worker Registration
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    console.log('Service Worker not supported');
    return;
  }

  // Register service worker
  navigator.serviceWorker
    .register('/sw.js')
    .then((registration) => {
      console.log('SW registered successfully:', registration.scope);
      
      // Check for updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New content is available, notify user
              showUpdateNotification();
            }
          });
        }
      });
    })
    .catch((error) => {
      console.log('SW registration failed:', error);
    });

  // Listen for SW messages
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data && event.data.type) {
      switch (event.data.type) {
        case 'CACHE_UPDATED':
          console.log('Cache updated:', event.data.payload);
          break;
        case 'OFFLINE_READY':
          showOfflineReadyNotification();
          break;
      }
    }
  });
}

// PWA Install Prompt
let deferredPrompt: any = null;

export function initPWAInstallPrompt() {
  // Skip install prompt in development mode
  if (import.meta.env.DEV || window.location.hostname === 'localhost') {
    console.log('🚀 Development mode: PWA install prompt disabled');
    return;
  }
  
  // Listen for install prompt
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    showInstallPrompt();
  });

  // Listen for successful install
  window.addEventListener('appinstalled', () => {
    console.log('PWA installed successfully');
    hideInstallPrompt();
    deferredPrompt = null;
  });
}

export function triggerPWAInstall() {
  if (!deferredPrompt) {
    console.log('Install prompt not available');
    return;
  }

  deferredPrompt.prompt();
  deferredPrompt.userChoice.then((choiceResult: any) => {
    if (choiceResult.outcome === 'accepted') {
      console.log('User accepted PWA install');
    } else {
      console.log('User dismissed PWA install');
    }
    deferredPrompt = null;
    hideInstallPrompt();
  });
}

// Network Status Management
export function initNetworkStatus() {
  // Initial status
  updateNetworkStatus(navigator.onLine);

  // Listen for network changes
  window.addEventListener('online', () => {
    console.log('Network: Online');
    updateNetworkStatus(true);
    showNetworkStatusNotification('Du är online igen!', 'success');
  });

  window.addEventListener('offline', () => {
    console.log('Network: Offline');
    updateNetworkStatus(false);
    showNetworkStatusNotification('Du är offline. Vissa funktioner är begränsade.', 'warning');
  });
}

function updateNetworkStatus(isOnline: boolean) {
  document.body.classList.toggle('offline', !isOnline);
  
  // Dispatch custom event for components to listen to
  window.dispatchEvent(
    new CustomEvent('networkstatus', { 
      detail: { isOnline } 
    })
  );
}

// Notification Functions
function showUpdateNotification() {
  const notification = document.createElement('div');
  notification.className = 'pwa-notification update-available';
  notification.innerHTML = `
    <div class="notification-content">
      <span>Ny version tillgänglig!</span>
      <button onclick="window.location.reload()">Uppdatera</button>
    </div>
  `;
  
  document.body.appendChild(notification);
  
  // Auto-hide after 5 seconds
  setTimeout(() => {
    notification.remove();
  }, 5000);
}

function showOfflineReadyNotification() {
  const notification = document.createElement('div');
  notification.className = 'pwa-notification offline-ready';
  notification.innerHTML = `
    <div class="notification-content">
      <span>✓ Redo för offline-användning</span>
    </div>
  `;
  
  document.body.appendChild(notification);
  
  // Auto-hide after 3 seconds
  setTimeout(() => {
    notification.remove();
  }, 3000);
}

function showInstallPrompt() {
  const prompt = document.createElement('div');
  prompt.id = 'pwa-install-prompt';
  prompt.className = 'pwa-install-prompt';
  prompt.innerHTML = `
    <div class="install-prompt-content">
      <div class="install-icon">📱</div>
      <div class="install-text">
        <h3>Installera GnarPuzzle</h3>
        <p>Få snabbare åtkomst och bättre prestanda</p>
      </div>
      <div class="install-actions">
        <button id="pwa-install-btn" class="install-btn primary">Installera</button>
        <button id="pwa-dismiss-btn" class="install-btn secondary">Avfärda</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(prompt);
  
  // Add event listeners
  document.getElementById('pwa-install-btn')?.addEventListener('click', triggerPWAInstall);
  document.getElementById('pwa-dismiss-btn')?.addEventListener('click', hideInstallPrompt);
  
  // Show with animation
  setTimeout(() => prompt.classList.add('show'), 100);
}

function hideInstallPrompt() {
  const prompt = document.getElementById('pwa-install-prompt');
  if (prompt) {
    prompt.classList.remove('show');
    setTimeout(() => prompt.remove(), 300);
  }
}

function showNetworkStatusNotification(message: string, type: 'success' | 'warning' | 'error') {
  // Remove existing network notifications
  document.querySelectorAll('.network-notification').forEach(el => el.remove());
  
  const notification = document.createElement('div');
  notification.className = `pwa-notification network-notification ${type}`;
  notification.innerHTML = `
    <div class="notification-content">
      <span>${message}</span>
    </div>
  `;
  
  document.body.appendChild(notification);
  
  // Auto-hide after 3 seconds
  setTimeout(() => {
    notification.remove();
  }, 3000);
}

// Background Sync for offline actions
export function requestBackgroundSync(tag: string) {
  if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
    navigator.serviceWorker.ready.then((registration) => {
      // Type assertion for Background Sync API which might not be in all TypeScript definitions
      return (registration as any).sync.register(tag);
    }).catch((error) => {
      console.log('Background sync registration failed:', error);
    });
  }
}

// Performance monitoring
export function initPerformanceMonitoring() {
  if ('performance' in window) {
    // Measure initial load time
    window.addEventListener('load', () => {
      // Use more reliable timing measurement
      const loadTime = performance.now();
      console.log(`App loaded in ${Math.round(loadTime)}ms`);
      
      // Report to analytics if available
      if (loadTime > 3000) {
        console.warn('Slow app loading detected:', Math.round(loadTime));
      }
    });
    
    // Monitor navigation timing
    if ('navigation' in performance) {
      const nav = performance.navigation;
      if (nav.type === nav.TYPE_RELOAD) {
        console.log('App reloaded');
      }
    }
  }
}

// Initialize all PWA features
export function initPWA() {
  registerServiceWorker();
  initPWAInstallPrompt();
  initNetworkStatus();
  initPerformanceMonitoring();
  
  console.log('PWA initialized');
}