// ════════════════════════════════════════════════════════
//  CardPioneer — Edge Function: valida-ordine
//  Calcola il totale REALE lato server, ignorando i prezzi
//  che arrivano dal client (anti-manomissione carrello)
// ════════════════════════════════════════════════════════
//
// Deploy:
//   supabase functions deploy valida-ordine
//
// Chiamata dal frontend:
//   const res = await fetch(
//     'https://nzjwpdbljfwrspmepoqo.supabase.co/functions/v1/valida-ordine',
//     {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({
//         items: [{ sku: 'BS001', qty: 2 }, { sku: 'BS002', qty: 1 }],
//         codice_sconto: 'WELCOME10'  // opzionale
//       })
//     }
//   );
//   const { subtotale, totale, spedizione, errori } = await res.json();

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!; // chiave admin, mai esposta al client

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  // Gestione CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { items, codice_sconto, tipo_spedizione } = await req.json();

    if (!Array.isArray(items) || items.length === 0) {
      return jsonResponse({ errori: ['Carrello vuoto.'] }, 400);
    }

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);

    // ── 1. Recupera i prezzi REALI dal database, non quelli inviati dal client ──
    const skus = items.map((i: any) => String(i.sku));
    const { data: prodotti, error: prodErr } = await sb
      .from('prodotti')
      .select('sku, nome, prezzo, disponibile, peso, categoria')
      .in('sku', skus);

    if (prodErr) return jsonResponse({ errori: ['Errore database: ' + prodErr.message] }, 500);

    const prodMap: Record<string, any> = {};
    (prodotti || []).forEach((p: any) => { prodMap[p.sku] = p; });

    // ── 2. Valida ogni riga del carrello contro i dati reali ──
    const errori: string[] = [];
    const righeValidate: any[] = [];
    let subtotale = 0;
    let pesoTotale = 20; // imballo fisso — sincronizzato con impostazioni

    for (const item of items) {
      const sku = String(item.sku);
      const qty = Math.max(1, parseInt(item.qty) || 1);
      const prod = prodMap[sku];

      if (!prod) {
        errori.push(`Prodotto non trovato: ${sku}`);
        continue;
      }
      if (prod.disponibile < qty) {
        errori.push(`"${prod.nome}" — disponibili solo ${prod.disponibile} pezzi (richiesti ${qty}).`);
        continue;
      }

      const prezzoReale = parseFloat(prod.prezzo);
      const pesoReale    = parseFloat(prod.peso) || pesoDiCategoria(prod.categoria);

      subtotale  += prezzoReale * qty;
      pesoTotale += pesoReale * qty;

      righeValidate.push({
        sku, nome: prod.nome, prezzo: prezzoReale, qty, peso: pesoReale,
      });
    }

    if (errori.length) return jsonResponse({ errori }, 400);

    // ── 3. Applica sconto (se presente e valido) ──
    let sconto = 0;
    if (codice_sconto) {
      const { data: discount } = await sb
        .from('sconti')
        .select('*')
        .eq('codice', codice_sconto.toUpperCase())
        .eq('attivo', true)
        .single();

      if (discount) {
        const oggi = new Date();
        const dataInizio = discount.data_inizio ? new Date(discount.data_inizio) : null;
        const dataFine   = discount.data_fine   ? new Date(discount.data_fine)   : null;
        const usoOk = !discount.uso_max || discount.uso_count < discount.uso_max;
        const dataOk = (!dataInizio || oggi >= dataInizio) && (!dataFine || oggi <= dataFine);

        if (usoOk && dataOk) {
          sconto = discount.tipo === 'percentuale'
            ? subtotale * (parseFloat(discount.valore) / 100)
            : Math.min(parseFloat(discount.valore), subtotale);
        }
      }
    }

    const subtotaleScontato = subtotale - sconto;

    // ── 4. Calcola spedizione lato server ──
    const { data: impostazioni } = await sb.from('impostazioni').select('chiave, valore');
    const cfg: Record<string, string> = {};
    (impostazioni || []).forEach((r: any) => { cfg[r.chiave] = r.valore; });

    const raccPesoSoglia1 = 1000, raccPesoSoglia2 = 3000;
    const racc1000 = parseFloat(cfg['racc_1000']) || 7.95;
    const racc3000 = parseFloat(cfg['racc_3000']) || 10.30;
    const raccMax  = parseFloat(cfg['racc_max'])  || 20.00;

    let spedizione = pesoTotale <= raccPesoSoglia1 ? racc1000
                    : pesoTotale <= raccPesoSoglia2 ? racc3000
                    : raccMax;

    const promoAttiva = cfg['promo_sped_attiva'] === 'true';
    const promoSoglia = parseFloat(cfg['promo_sped_soglia']) || 30;
    if (promoAttiva && subtotaleScontato >= promoSoglia) {
      spedizione = 0;
    }

    if (tipo_spedizione === 'assicurata') {
      spedizione = costoAssicurata(pesoTotale, subtotaleScontato);
    }

    // ── 5. IVA e commissione PayPal (informative, già incluse nel prezzo) ──
    const ivaPerc = parseFloat(cfg['iva_percentuale']) || 22;
    const imponibile = Math.round(subtotaleScontato / (1 + ivaPerc/100) * 100) / 100;
    const iva = Math.round((subtotaleScontato - imponibile) * 100) / 100;

    const paypalPerc  = parseFloat(cfg['paypal_perc'])  || 3.5;
    const paypalFisso = parseFloat(cfg['paypal_fisso']) || 0.35;
    const baseComm    = subtotaleScontato + spedizione;
    const commissione = Math.round((baseComm * paypalPerc/100 + paypalFisso) * 100) / 100;

    const totale = Math.round((subtotaleScontato + spedizione + commissione) * 100) / 100;

    return jsonResponse({
      righe: righeValidate,
      subtotale: round2(subtotale),
      sconto: round2(sconto),
      subtotale_scontato: round2(subtotaleScontato),
      imponibile: round2(imponibile),
      iva: round2(iva),
      spedizione: round2(spedizione),
      commissione: round2(commissione),
      totale: round2(totale),
      peso_totale_g: pesoTotale,
      errori: [],
    }, 200);

  } catch (e) {
    return jsonResponse({ errori: ['Errore interno: ' + (e as Error).message] }, 500);
  }
});

function round2(n: number) { return Math.round(n * 100) / 100; }

function pesoDiCategoria(cat: string): number {
  const map: Record<string, number> = { carte: 9, buste: 15, etb: 500, altro: 100 };
  return map[cat] || 9;
}

function costoAssicurata(pesoG: number, valoreEur: number): number {
  const TABELLA: [number, number[]][] = [
    [20,   [6.65,  9.25,  11.95, 14.65, 17.35, 20.05]],
    [50,   [8.30,  10.90, 13.60, 16.30, 19.00, 21.70]],
    [100,  [9.30,  11.90, 14.60, 17.30, 20.00, 22.70]],
    [250,  [11.65, 14.25, 16.95, 19.65, 22.35, 25.05]],
    [500,  [14.15, 16.75, 19.45, 22.15, 24.85, 27.55]],
    [1000, [18.55, 21.15, 23.85, 26.55, 29.25, 31.95]],
    [2000, [25.55, 28.15, 30.85, 33.55, 36.25, 38.95]],
    [3000, [31.55, 34.15, 36.85, 39.55, 42.25, 44.95]],
  ];
  if (pesoG > 3000) return 20.00;
  const riga = TABELLA.find(([max]) => pesoG <= max) || TABELLA[TABELLA.length - 1];
  const [, valori] = riga;
  const sogliaVal = [50, 250, 500, 1000, 2000, 3000];
  const idx = sogliaVal.findIndex(v => valoreEur <= v);
  return valori[idx === -1 ? valori.length - 1 : idx];
}

function jsonResponse(body: any, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
