// Atardecer de Carito: recibe el aviso de cada atardecer (lo manda Netlify).
const VAPID_PUBLICA = 'BBWQ00l7q1_snqwA8nu8fpyhmBidSnACoi-M-CarxSoh5C0dpy2bHXk5g95Rlh5vmYjiyN8vYJd8dkc6bSiWh7Q';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || '🌅 Ya se está metiendo el sol', {
    body: d.body || 'Asómate tantito.', icon: 'icon-192.png', badge: 'icon-192.png', tag: d.tag || 'atardecer', data: { url: d.url || './' },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ws) => (ws[0] ? ws[0].focus() : self.clients.openWindow(url))));
});
// Si el teléfono renueva la suscripción, se vuelve a dar de alta sola.
self.addEventListener('pushsubscriptionchange', (e) => e.waitUntil((async () => {
  const b = atob((VAPID_PUBLICA + '='.repeat((4 - VAPID_PUBLICA.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  const sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(b, (c) => c.charCodeAt(0)) });
  await fetch('/api/suscribir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sub: sub.toJSON(), viejo: e.oldSubscription ? e.oldSubscription.endpoint : null }) });
})().catch(() => {})));
