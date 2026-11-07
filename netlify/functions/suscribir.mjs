// Guarda el teléfono de Carito cuando ella acepta el aviso de cada atardecer (botón 🌅 de la página).
import { getStore } from '@netlify/blobs';
import { ahoraLocal, guardarDispositivo, hora, json, mandar, puestaDeSol } from '../lib/carito.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Usa POST' }, 405);
  let datos;
  try { datos = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
  const store = getStore({ name: 'carito', consistency: 'strong' });
  let r;
  try { r = await guardarDispositivo(store, datos, req.headers.get('user-agent')); } catch (e) { return json({ error: e.message }, 400); }
  if (r.nueva) { // la primera vez le llega uno de bienvenida: así sabe que sí quedó
    const { fecha } = ahoraLocal();
    const cuando = r.item.inicio <= fecha ? `hoy a las ${hora(puestaDeSol(fecha))}` : 'mañana al atardecer';
    try { await mandar(store, { title: '🌅 Listo, Carito', body: `Te aviso ${cuando}, justo cuando se esté metiendo el sol.`, tag: 'bienvenida', url: './' }, { a: [r.item] }); }
    catch (e) { console.error('bienvenida:', e.message); }
  }
  return json({ ok: true, nueva: r.nueva, inicio: r.item.inicio });
};

export const config = { path: '/api/suscribir' };
