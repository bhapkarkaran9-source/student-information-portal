/**
 * Student Information Portal - Service Worker
 * Handles background Web Push notifications and interaction events on Mobile / Desktop.
 */

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

/**
 * Handle incoming push notifications
 */
self.addEventListener('push', (event) => {
  let data = {
    title: 'Student Information Portal',
    body: 'You have a new update.',
    icon: '/images/favicon.ico',
    badge: '/images/favicon.ico',
    data: { url: '/' }
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
      if (parsed.data) {
        data.data = { ...data.data, ...parsed.data };
      }
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/images/favicon.ico',
    badge: data.badge || '/images/favicon.ico',
    vibrate: [100, 50, 100],
    data: data.data || { url: '/' },
    tag: data.tag || `sip-notification-${Date.now()}`,
    renotify: true,
    requireInteraction: false,
    actions: [
      {
        action: 'open',
        title: 'View Details'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

/**
 * Handle user clicking on the notification
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url)
    ? event.notification.data.url
    : '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a portal window is already open, focus it and navigate
      for (const client of clientList) {
        if ('focus' in client) {
          if ('navigate' in client && targetUrl !== '/') {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      // If no window is open, open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
