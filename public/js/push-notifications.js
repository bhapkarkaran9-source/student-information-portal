/**
 * Student Information Portal - Client Push Notification Service
 * Manages Service Worker registration, VAPID subscription, and permissions.
 */

(function () {
  'use strict';

  // Helper to convert base64 VAPID key to Uint8Array
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  // Get auth token from storage
  function getAuthToken() {
    return localStorage.getItem('token') || sessionStorage.getItem('token') || null;
  }

  const PushManagerService = {
    isSupported: false,
    registration: null,
    vapidKey: null,

    /**
     * Initialize service worker and check push support
     */
    async init() {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.log('[WebPush] Web push is not supported in this browser/device.');
        return false;
      }

      this.isSupported = true;

      try {
        this.registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        console.log('[WebPush] Service Worker registered with scope:', this.registration.scope);

        // If permission is already granted and user is logged in, sync subscription
        if (Notification.permission === 'granted' && getAuthToken()) {
          await this.subscribeUser();
        }
        return true;
      } catch (err) {
        console.warn('[WebPush] Service Worker registration failed:', err);
        return false;
      }
    },

    /**
     * Fetch VAPID public key from backend
     */
    async fetchVapidKey() {
      if (this.vapidKey) return this.vapidKey;

      const token = getAuthToken();
      if (!token) return null;

      try {
        const res = await fetch('/api/notifications/push/vapid-key', {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        if (!res.ok) return null;
        const json = await res.json();
        if (json.success && json.data && json.data.publicKey) {
          this.vapidKey = json.data.publicKey;
          return this.vapidKey;
        }
      } catch (err) {
        console.warn('[WebPush] Error fetching VAPID key:', err);
      }
      return null;
    },

    /**
     * Request notification permission and subscribe device
     */
    async subscribeUser() {
      if (!this.isSupported) return false;

      const token = getAuthToken();
      if (!token) return false;

      try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          console.log('[WebPush] Notification permission denied or dismissed.');
          return false;
        }

        const publicKey = await this.fetchVapidKey();
        if (!publicKey) {
          console.warn('[WebPush] VAPID public key not available.');
          return false;
        }

        const applicationServerKey = urlBase64ToUint8Array(publicKey);

        // Check for existing subscription or create new
        let subscription = await this.registration.pushManager.getSubscription();
        if (!subscription) {
          subscription = await this.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey
          });
        }

        // Send subscription to server
        const subJson = subscription.toJSON();
        const res = await fetch('/api/notifications/push/subscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ subscription: subJson })
        });

        if (res.ok) {
          console.log('[WebPush] Push subscription synced successfully with server.');
          return true;
        } else {
          console.warn('[WebPush] Server returned error saving push subscription:', res.status);
          return false;
        }
      } catch (err) {
        console.warn('[WebPush] Failed to subscribe user to web push:', err);
        return false;
      }
    },

    /**
     * Unsubscribe device from push notifications
     */
    async unsubscribeUser() {
      if (!this.isSupported || !this.registration) return false;

      const token = getAuthToken();
      try {
        const subscription = await this.registration.pushManager.getSubscription();
        if (subscription) {
          const endpoint = subscription.endpoint;
          await subscription.unsubscribe();

          if (token) {
            await fetch('/api/notifications/push/unsubscribe', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
              },
              body: JSON.stringify({ endpoint })
            });
          }
          console.log('[WebPush] Device unsubscribed successfully.');
          return true;
        }
      } catch (err) {
        console.warn('[WebPush] Failed to unsubscribe:', err);
      }
      return false;
    }
  };

  // Expose to window
  window.PushManagerService = PushManagerService;
  window.requestPushNotificationPermission = () => PushManagerService.subscribeUser();
  window.unsubscribePushNotifications = () => PushManagerService.unsubscribeUser();

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => PushManagerService.init());
  } else {
    PushManagerService.init();
  }
})();
