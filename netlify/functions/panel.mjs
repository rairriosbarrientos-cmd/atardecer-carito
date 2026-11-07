// Panel (public/panel.html): ver si Carito activó los avisos y cuándo salió el último. Pide la clave.
import { getStore } from '@netlify/blobs';
import { MENSAJES, ahoraLocal, avisoDelDia, claveValida, equipoDe, hora, idDe, json, leerDispositivos, puestaDeSol, quitarDispositivo } from '../lib/carito.mjs';

export default async (req) => {
  if (!process.env.CLAVE_PANEL) return json({ error: 'Falta CLAVE_PANEL en las variables de entorno de Netlify' }, 500);
  if (!claveValida(req.headers.get('x-clave'))) return json({ error: 'Clave incorrecta' }, 401);
  const store = getStore({ name: 'carito', consistency: 'strong' });
  if (req.method === 'GET') {
    const lista = await leerDispositivos(store), { fecha } = ahoraLocal();
    return json({
      hoy: fecha, puestaHoy: hora(puestaDeSol(fecha)), total: MENSAJES.length,
      dispositivos: lista.map((d) => ({ id: idDe(d.sub.endpoint), equipo: equipoDe(d.ua), alta: d.alta, inicio: d.inicio, deHoy: avisoDelDia(d.inicio, fecha) })),
      ultimo: await store.get('ultimo', { type: 'json' }),
    });
  }
  if (req.method === 'POST') {
    let d;
    try { d = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    if (d.accion === 'quitar') return json(await quitarDispositivo(store, String(d.id || '')));
    return json({ error: 'Acción desconocida' }, 400);
  }
  return json({ error: 'Método no permitido' }, 405);
};

export const config = { path: '/api/panel' };
