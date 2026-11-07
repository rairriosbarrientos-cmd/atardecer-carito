// Cada 5 minutos entre 5 y 9 de la tarde (hora de Jalisco): si ya se va a meter el sol, le llega su aviso.
import { getStore } from '@netlify/blobs';
import { revisarAtardecer } from '../lib/carito.mjs';

export default async () => {
  const r = await revisarAtardecer(getStore({ name: 'carito', consistency: 'strong' }));
  if (!r.espera) console.log('atardecer:', JSON.stringify(r));
};

export const config = { schedule: '*/5 23,0,1,2 * * *' }; // 23:00–02:59 UTC = 5:00–8:59 pm en Jalisco
