// Prueba las funciones de punta a punta sin internet:
// Blobs con el servidor local de @netlify/blobs y un "servicio de push" HTTPS falso que descifra lo que le llega.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import { execFileSync } from 'node:child_process';
import { BlobsServer } from '@netlify/blobs/server';
import ece from 'http_ece';
import webpush from 'web-push';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carito-'));
const recibidos = [];
let blobs, push, puertoPush, suscribir, panel, lib, tel, store;

function telefono(ruta) {
  const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
  const auth = crypto.randomBytes(16);
  return { ecdh, auth, sub: { endpoint: `https://localhost:${puertoPush}${ruta}`, keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: auth.toString('base64url') } } };
}
const descifrar = (t, cuerpo) => JSON.parse(ece.decrypt(cuerpo, { version: 'aes128gcm', privateKey: t.ecdh, authSecret: t.auth.toString('base64url') }).toString());
const llegadas = (t) => recibidos.filter((r) => r.url === new URL(t.sub.endpoint).pathname).map((r) => descifrar(t, r.cuerpo));
const pedir = (fn, url, { metodo = 'GET', cuerpo, headers = {} } = {}) =>
  fn(new Request(`http://local${url}`, { method: metodo, headers: { 'Content-Type': 'application/json', ...headers }, body: cuerpo ? JSON.stringify(cuerpo) : undefined }));
// "Ahora" en Jalisco (UTC-6) para una fecha y hora local
const enJalisco = (fecha, hh, mm) => new Date(`${fecha}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00-06:00`);

before(async () => {
  blobs = new BlobsServer({ directory: path.join(dir, 'blobs'), token: 'prueba' });
  const { port } = await blobs.start(), base = `http://localhost:${port}`;
  process.env.NETLIFY_BLOBS_CONTEXT = Buffer.from(JSON.stringify({ edgeURL: base, uncachedEdgeURL: base, siteID: 'sitio-prueba', token: 'prueba' })).toString('base64');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-keyout', path.join(dir, 'k.pem'), '-out', path.join(dir, 'c.pem'), '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' });
  push = https.createServer({ key: fs.readFileSync(path.join(dir, 'k.pem')), cert: fs.readFileSync(path.join(dir, 'c.pem')) }, (req, res) => {
    const partes = [];
    req.on('data', (c) => partes.push(c)).on('end', () => {
      if (req.url.startsWith('/muerto')) { res.writeHead(410); return res.end(); }
      recibidos.push({ url: req.url, cuerpo: Buffer.concat(partes) }); res.writeHead(201); res.end();
    });
  });
  await new Promise((ok) => push.listen(0, ok));
  puertoPush = push.address().port;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // solo en la prueba: el servicio falso usa certificado propio
  const llaves = webpush.generateVAPIDKeys();
  process.env.VAPID_PUBLIC_KEY = llaves.publicKey; process.env.VAPID_PRIVATE_KEY = llaves.privateKey; process.env.CLAVE_PANEL = 'clave-de-prueba';
  suscribir = (await import('../netlify/functions/suscribir.mjs')).default;
  panel = (await import('../netlify/functions/panel.mjs')).default;
  lib = await import('../netlify/lib/carito.mjs');
  const { getStore } = await import('@netlify/blobs');
  store = getStore({ name: 'carito', consistency: 'strong' });
});
after(async () => { await blobs.stop(); push.close(); fs.rmSync(dir, { recursive: true, force: true }); });

test('hora real del atardecer en Hostotipaquillo', () => {
  assert.equal(lib.hora(lib.puestaDeSol('2026-11-07')), '6:18 pm');
  assert.equal(lib.hora(lib.puestaDeSol('2027-06-21')), '7:40 pm');
  assert.deepEqual(lib.ahoraLocal(new Date('2026-11-08T00:15:00Z')), { fecha: '2026-11-07', min: 18 * 60 + 15 }); // 6:15 pm del 7 en Jalisco
  assert.equal(lib.MENSAJES.length, 40);
  assert.equal(lib.avisoDelDia('2026-11-07', '2026-11-07').body, lib.MENSAJES[0]);
  assert.equal(lib.avisoDelDia('2026-11-07', '2026-12-16').n, 40);
  assert.equal(lib.avisoDelDia('2026-11-07', '2026-12-17'), null); // se acaba la serie
});

test('ella activa el aviso y le llega la bienvenida', async () => {
  tel = telefono('/cel-carito');
  const r = await pedir(suscribir, '/api/suscribir', { metodo: 'POST', cuerpo: { sub: tel.sub, inicio: '2026-11-07' }, headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' } });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, nueva: true, inicio: '2026-11-07' });
  const [b] = llegadas(tel);
  assert.equal(b.tag, 'bienvenida');
  assert.match(b.body, /Te aviso (hoy a las \d+:\d\d pm|mañana al atardecer)/);
  const r2 = await pedir(suscribir, '/api/suscribir', { metodo: 'POST', cuerpo: { sub: tel.sub, inicio: '2026-11-20' } });
  assert.deepEqual(await r2.json(), { ok: true, nueva: false, inicio: '2026-11-07' }); // no se reinicia la cuenta
  assert.equal(llegadas(tel).length, 1);
});

test('rechaza basura', async () => {
  assert.equal((await pedir(suscribir, '/api/suscribir')).status, 405);
  assert.equal((await pedir(suscribir, '/api/suscribir', { metodo: 'POST', cuerpo: { sub: { endpoint: 'http://inseguro', keys: {} } } })).status, 400);
});

test('el aviso sale justo antes de que se meta el sol, una vez al día', async () => {
  const antes = llegadas(tel).length;
  assert.equal((await lib.revisarAtardecer(store, enJalisco('2026-11-09', 13, 0))).espera, true); // a mediodía no
  assert.equal((await lib.revisarAtardecer(store, enJalisco('2026-11-09', 18, 5))).espera, true); // 6:05, aún falta
  const r = await lib.revisarAtardecer(store, enJalisco('2026-11-09', 18, 13)); // 6:13 (el sol se mete 6:17)
  assert.equal(r.enviados, 1);
  const aviso = llegadas(tel).at(-1);
  assert.equal(aviso.title, '🌅 6:17 pm · Hostotipaquillo');
  assert.equal(aviso.body, lib.MENSAJES[2]); // día 3 desde que lo activó
  assert.equal((await lib.revisarAtardecer(store, enJalisco('2026-11-09', 18, 18))).yaSalio, true);
  assert.equal(llegadas(tel).length, antes + 1);
  const otroDia = await lib.revisarAtardecer(store, enJalisco('2026-11-10', 18, 14));
  assert.equal(otroDia.enviados, 1);
  assert.equal(llegadas(tel).at(-1).body, lib.MENSAJES[3]);
});

test('al terminar la serie ya no le llega nada', async () => {
  const antes = llegadas(tel).length;
  const r = await lib.revisarAtardecer(store, enJalisco('2027-01-15', 18, 30)); // día 70
  assert.equal(r.enviados, 0);
  assert.equal(llegadas(tel).length, antes);
});

test('si lo activa cuando ya salió el aviso de hoy, su serie empieza mañana', async () => {
  assert.equal(await lib.primerDia(store, enJalisco('2026-11-20', 13, 0)), '2026-11-20'); // a mediodía: hoy
  assert.equal(await lib.primerDia(store, enJalisco('2026-11-20', 21, 0)), '2026-11-21'); // ya de noche: mañana
  assert.equal(await lib.primerDia(store, enJalisco('2027-01-15', 18, 35)), '2027-01-16'); // el de hoy ya salió
  assert.equal(lib.avisoDelDia('2027-01-16', '2027-01-15'), null); // antes de empezar no le toca nada
  assert.equal(lib.avisoDelDia('2027-01-16', '2027-01-16').body, lib.MENSAJES[0]);
});

test('panel: clave, estado y quitar teléfono', async () => {
  assert.equal((await pedir(panel, '/api/panel')).status, 401);
  const k = { 'x-clave': 'clave-de-prueba' };
  const prueba = telefono('/cel-alfredo');
  await pedir(suscribir, '/api/suscribir', { metodo: 'POST', cuerpo: { sub: prueba.sub, inicio: '2026-11-07' } });
  let est = await (await pedir(panel, '/api/panel', { headers: k })).json();
  assert.equal(est.dispositivos.length, 2);
  assert.equal(est.dispositivos[0].equipo, 'iPhone');
  assert.match(est.puestaHoy, /^\d+:\d\d pm$/);
  assert.equal(est.ultimo.fecha, '2027-01-15');
  const id = est.dispositivos[1].id;
  assert.deepEqual(await (await pedir(panel, '/api/panel', { metodo: 'POST', headers: k, cuerpo: { accion: 'quitar', id } })).json(), { quitados: 1 });
  est = await (await pedir(panel, '/api/panel', { headers: k })).json();
  assert.equal(est.dispositivos.length, 1);
});

test('si el teléfono renueva la suscripción, sigue la misma serie sin bienvenida', async () => {
  const k = { 'x-clave': 'clave-de-prueba' };
  const antes = (await (await pedir(panel, '/api/panel', { headers: k })).json()).dispositivos;
  const nuevo = telefono('/cel-carito-renovado');
  const r = await pedir(suscribir, '/api/suscribir', { metodo: 'POST', cuerpo: { sub: nuevo.sub, viejo: tel.sub.endpoint } });
  assert.deepEqual(await r.json(), { ok: true, nueva: false, inicio: '2026-11-07' });
  assert.equal(llegadas(nuevo).length, 0);
  const despues = (await (await pedir(panel, '/api/panel', { headers: k })).json()).dispositivos;
  assert.equal(despues.length, antes.length);
  assert.equal(despues[0].alta, antes[0].alta);
  tel = nuevo;
});

test('si ella quita el permiso, se borra ese teléfono', async () => {
  const muerto = telefono('/muerto-1');
  await pedir(suscribir, '/api/suscribir', { metodo: 'POST', cuerpo: { sub: muerto.sub, inicio: '2026-11-07' } }); // la bienvenida ya lo detecta
  const est = await (await pedir(panel, '/api/panel', { headers: { 'x-clave': 'clave-de-prueba' } })).json();
  assert.equal(est.dispositivos.length, 1);
});
