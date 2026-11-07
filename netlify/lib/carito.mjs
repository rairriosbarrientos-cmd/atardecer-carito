// Lo que comparten las funciones: a qué hora se mete el sol en Hostotipaquillo, qué mensaje le toca y cómo se le manda.
import { createHash, timingSafeEqual } from 'node:crypto';
import webpush from 'web-push';

// Llave pública de las notificaciones (la privada vive solo en Netlify: VAPID_PRIVATE_KEY).
// La misma va en public/index.html y public/sw.js.
export const VAPID_PUBLICA = 'BBWQ00l7q1_snqwA8nu8fpyhmBidSnACoi-M-CarxSoh5C0dpy2bHXk5g95Rlh5vmYjiyN8vYJd8dkc6bSiWh7Q';
export const LUGAR = { nombre: 'Hostotipaquillo', lat: 21.0597, lon: -104.0497, utc: -6 }; // Jalisco: UTC-6 todo el año
const ZONA = 'America/Mexico_City';
const MAX_DISPOSITIVOS = 10;
const ANTES = 6; // minutos antes de que se meta el sol
const DESPUES = 40; // si algo se atrasa, todavía sale hasta 40 min después

// Un mensaje por atardecer. Al terminar la lista ya no le llega nada (sin presión).
export const MENSAJES = [
  'Ya se está metiendo el sol en Hostotipaquillo. Este es tuyo 🌅',
  'Si estás cerca de una ventana, asómate tantito. Va bonito hoy.',
  'Cada atardecer me acuerdo de ti. Hoy también.',
  'El cielo hoy salió con colores de los que te gustan.',
  'Dicen que los atardeceres no se repiten. Tú tampoco.',
  'Hoy el sol se mete despacito, como sin ganas de irse. Te entiendo, sol.',
  'Ojalá tu día haya estado bonito. Y si no, que este atardecer lo arregle tantito.',
  'Mira el cielo un ratito. Nomás eso.',
  'Un atardecer más en el que me acuerdo de ti 🌅',
  'A esta hora siempre me dan ganas de platicarte.',
  'Hoy el cielo está naranja, como la orilla de una pizza bien doradita 🍕',
  'No sé si lo estás viendo, pero yo sí. Y me acordé de ti.',
  'Que el sol se lleve lo pesado de tu día.',
  'Sigo pensando que los atardeceres se ven mejor contigo.',
  'Si hoy fue un día difícil, ya casi se acaba. Mañana el sol sale otra vez.',
  'Te mando este atardecer. No hay que devolverlo 😅',
  'El sol siempre regresa. Por si lo necesitabas oír hoy.',
  'Hoy me acordé de tu risa. Qué bonita es.',
  'Los agaves también se ponen dorados a esta hora. Así de bonito.',
  'Asómate: el cielo se está poniendo rosa.',
  'Que tengas una noche tranquila, Carito.',
  'Hay cosas que no se olvidan. Los atardeceres contigo, por ejemplo.',
  'Hoy no tengo nada inteligente que decir. Solo que el cielo está bonito y me acordé de ti.',
  'Si un día quieres ver uno juntos, la pizza la pongo yo 🍕🌅',
  'Sin presión, solo cariño. Feliz atardecer.',
  'A esta hora el mundo se calma tantito. Ojalá tú también.',
  'Hoy el sol se va temprano. Igual me dio tiempo de pensar en ti.',
  'Que nunca te falten cielos así.',
  'Te deseo un buen cierre de día. Te lo mereces.',
  'Treinta atardeceres, ninguno igual. Todos me hicieron pensar en ti.',
  'Hoy el cielo está como para tomarle foto. Ojalá le tomes una.',
  'Los días se hacen cortitos, pero los atardeceres se ponen más bonitos.',
  'Gracias por dejarme mandarte estos atardeceres.',
  'Si hoy sonreíste, ya ganó el día.',
  'La noche llega, pero el sol vuelve. Siempre.',
  'Hoy me puse a pensar en lo bonito que es platicar contigo.',
  'Ya casi se mete. Cierra los ojos tres segundos y respira.',
  'Que tus sueños de hoy sean bonitos, Carito.',
  'Penúltimo atardecer de esta serie. Fue bonito mandártelos.',
  'Último atardecer de la serie 🌅 Gracias por dejarme acompañarte a esta hora. Aquí sigo, cuando quieras.',
];

export const json = (datos, status = 200) => new Response(JSON.stringify(datos), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});
export const esFecha = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

// ---------- Tiempo en Hostotipaquillo ----------
const partes = (d) => Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  .formatToParts(d).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
export function ahoraLocal(d = new Date()) { const p = partes(d); return { fecha: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute) }; }
const utc = (f) => { const [y, m, d] = f.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const diasEntre = (a, b) => Math.round((utc(b) - utc(a)) / 864e5);

// Minuto del día (hora local) en que se mete el sol (fórmula de la NOAA, la misma de la página)
export function puestaDeSol(fecha) {
  const [y] = fecha.split('-').map(Number), n = diasEntre(`${y - 1}-12-31`, fecha);
  const g = 2 * Math.PI / 365 * (n - 1), D2R = Math.PI / 180;
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const dec = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const lat = LUGAR.lat * D2R, ha = Math.acos(Math.cos(90.833 * D2R) / (Math.cos(lat) * Math.cos(dec)) - Math.tan(lat) * Math.tan(dec)) / D2R;
  const min = 720 - 4 * (LUGAR.lon - ha) - eq + LUGAR.utc * 60;
  return ((Math.round(min) % 1440) + 1440) % 1440;
}
export const hora = (min) => { const h = Math.floor(min / 60), m = min % 60; return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`; };

// El aviso que le toca a un teléfono (cuenta desde el día que lo activó)
export function avisoDelDia(inicio, fecha) {
  const n = diasEntre(inicio, fecha) + 1;
  if (n < 1 || n > MENSAJES.length) return null;
  return { n, title: `🌅 ${hora(puestaDeSol(fecha))} · ${LUGAR.nombre}`, body: MENSAJES[n - 1], tag: 'atardecer', url: './' };
}

// Día en que empieza su serie: hoy, salvo que el aviso de hoy ya haya salido (así el primero que le llega es el 1)
export async function primerDia(store, ahora = new Date()) {
  const { fecha, min } = ahoraLocal(ahora);
  const ultimo = await store.get('ultimo', { type: 'json' });
  if (min <= puestaDeSol(fecha) + DESPUES && ultimo?.fecha !== fecha) return fecha;
  return ahoraLocal(new Date(ahora.getTime() + 864e5)).fecha;
}

// ---------- Teléfonos (Netlify Blobs) ----------
export const leerDispositivos = async (store) => (await store.get('suscripciones', { type: 'json' })) || [];
export const idDe = (endpoint) => createHash('sha256').update(endpoint).digest('hex').slice(0, 12);
const b64url = (s, min, max) => typeof s === 'string' && s.length >= min && s.length <= max && /^[A-Za-z0-9_-]+=*$/.test(s);
function validarSub(sub) {
  let url;
  try { url = new URL(sub?.endpoint); } catch { throw new Error('Suscripción inválida'); }
  if (url.protocol !== 'https:' || sub.endpoint.length > 1000) throw new Error('Suscripción inválida');
  if (!b64url(sub.keys?.p256dh, 80, 100) || !b64url(sub.keys?.auth, 16, 30)) throw new Error('Suscripción inválida');
  return { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } };
}
export async function guardarDispositivo(store, { sub, inicio, viejo } = {}, ua = '') {
  const limpia = validarSub(sub), lista = await leerDispositivos(store);
  // si el teléfono renovó su suscripción (viejo), sigue la misma cuenta de días y no es "nueva"
  const antes = lista.find((d) => d.sub.endpoint === limpia.endpoint) || (typeof viejo === 'string' && viejo ? lista.find((d) => d.sub.endpoint === viejo) : undefined);
  const resto = lista.filter((d) => d.sub.endpoint !== limpia.endpoint && d.sub.endpoint !== viejo);
  if (!antes && resto.length >= MAX_DISPOSITIVOS) throw new Error('Ya no caben más teléfonos');
  const ini = antes?.inicio || (esFecha(inicio) ? inicio : await primerDia(store));
  const item = { sub: limpia, inicio: ini, alta: antes?.alta || new Date().toISOString(), ua: String(ua || antes?.ua || '').slice(0, 200) };
  await store.setJSON('suscripciones', [...resto, item]);
  return { nueva: !antes, item };
}
export async function quitarDispositivo(store, id) {
  const lista = await leerDispositivos(store), resto = lista.filter((d) => idDe(d.sub.endpoint) !== id);
  if (resto.length !== lista.length) await store.setJSON('suscripciones', resto);
  return { quitados: lista.length - resto.length };
}

// ---------- Mandar ----------
function prepararVapid() {
  const privada = process.env.VAPID_PRIVATE_KEY;
  if (!privada) throw new Error('Falta VAPID_PRIVATE_KEY en las variables de entorno de Netlify');
  webpush.setVapidDetails(process.env.URL || 'https://app.netlify.com', process.env.VAPID_PUBLIC_KEY || VAPID_PUBLICA, privada);
}
// aviso: objeto o función (dispositivo) => aviso | null
export async function mandar(store, aviso, { a } = {}) {
  prepararVapid();
  const destinos = a || await leerDispositivos(store), muertos = new Set(), errores = [];
  let enviados = 0;
  await Promise.all(destinos.map(async (d) => {
    const datos = typeof aviso === 'function' ? aviso(d) : aviso;
    if (!datos) return;
    try { await webpush.sendNotification(d.sub, JSON.stringify(datos), { TTL: 2 * 3600, urgency: 'high' }); enviados++; }
    catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) muertos.add(d.sub.endpoint); // ya no existe (quitó el permiso o la app)
      else errores.push(String(e.statusCode || e.message).slice(0, 120));
    }
  }));
  if (muertos.size) await store.setJSON('suscripciones', (await leerDispositivos(store)).filter((d) => !muertos.has(d.sub.endpoint)));
  return { enviados, borrados: muertos.size, errores, total: destinos.length };
}

// Se revisa cada 5 minutos en la tarde: si ya va a meterse el sol y hoy no ha salido el aviso, sale.
export async function revisarAtardecer(store, ahora = new Date()) {
  const { fecha, min } = ahoraLocal(ahora), puesta = puestaDeSol(fecha);
  if (min < puesta - ANTES || min > puesta + DESPUES) return { espera: true, fecha, puesta: hora(puesta) };
  const ultimo = await store.get('ultimo', { type: 'json' });
  if (ultimo?.fecha === fecha) return { yaSalio: true, ...ultimo };
  const r = await mandar(store, (d) => avisoDelDia(d.inicio, fecha));
  const registro = { fecha, hora: hora(min), puesta: hora(puesta), ...r };
  await store.setJSON('ultimo', registro);
  return registro;
}

// ---------- Panel ----------
export function claveValida(dada) {
  const real = process.env.CLAVE_PANEL;
  if (!real || typeof dada !== 'string' || !dada) return false;
  const h = (s) => createHash('sha256').update(s).digest();
  return timingSafeEqual(h(dada), h(real));
}
export function equipoDe(ua = '') {
  if (/iphone/i.test(ua)) return 'iPhone';
  if (/ipad/i.test(ua)) return 'iPad';
  if (/android/i.test(ua)) return 'Android';
  if (/macintosh/i.test(ua)) return 'Mac';
  if (/windows/i.test(ua)) return 'Windows';
  return 'Otro';
}
