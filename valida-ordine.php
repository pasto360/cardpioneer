<?php
/**
 * ════════════════════════════════════════════════════════
 *  CardPioneer — valida-ordine.php
 *  Versione PHP/MySQL equivalente alla Edge Function Supabase.
 *  Da usare dopo la migrazione ad Aruba.
 *
 *  Calcola il totale REALE lato server, ignorando i prezzi
 *  che arrivano dal client (anti-manomissione carrello).
 * ════════════════════════════════════════════════════════
 *
 * Chiamata dal frontend (fetch):
 *   const res = await fetch('valida-ordine.php', {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify({
 *       items: [{ sku: 'BS001', qty: 2 }],
 *       codice_sconto: 'WELCOME10',
 *       tipo_spedizione: 'normale'
 *     })
 *   });
 *   const result = await res.json();
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Methods: POST, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// ── Configurazione database ──
// IMPORTANTE: sostituisci con i tuoi dati Aruba reali
$DB_HOST = 'localhost';
$DB_NAME = 'cardpioneer';
$DB_USER = 'tuo_utente_mysql';
$DB_PASS = 'tua_password_mysql';

function jsonResponse($body, $status = 200) {
    http_response_code($status);
    echo json_encode($body);
    exit;
}

function round2($n) {
    return round($n, 2);
}

function pesoDiCategoria($cat) {
    $map = ['carte' => 9, 'buste' => 15, 'etb' => 500, 'altro' => 100];
    return $map[$cat] ?? 9;
}

function costoAssicurata($pesoG, $valoreEur) {
    $tabella = [
        [20,   [6.65,  9.25,  11.95, 14.65, 17.35, 20.05]],
        [50,   [8.30,  10.90, 13.60, 16.30, 19.00, 21.70]],
        [100,  [9.30,  11.90, 14.60, 17.30, 20.00, 22.70]],
        [250,  [11.65, 14.25, 16.95, 19.65, 22.35, 25.05]],
        [500,  [14.15, 16.75, 19.45, 22.15, 24.85, 27.55]],
        [1000, [18.55, 21.15, 23.85, 26.55, 29.25, 31.95]],
        [2000, [25.55, 28.15, 30.85, 33.55, 36.25, 38.95]],
        [3000, [31.55, 34.15, 36.85, 39.55, 42.25, 44.95]],
    ];
    if ($pesoG > 3000) return 20.00;

    $rigaTrovata = null;
    foreach ($tabella as $riga) {
        if ($pesoG <= $riga[0]) { $rigaTrovata = $riga; break; }
    }
    if (!$rigaTrovata) $rigaTrovata = end($tabella);

    $valori = $rigaTrovata[1];
    $sogliaVal = [50, 250, 500, 1000, 2000, 3000];
    $idx = count($sogliaVal) - 1;
    foreach ($sogliaVal as $i => $v) {
        if ($valoreEur <= $v) { $idx = $i; break; }
    }
    return $valori[$idx];
}

try {
    $input = json_decode(file_get_contents('php://input'), true);
    $items           = $input['items']           ?? [];
    $codiceSconto    = $input['codice_sconto']    ?? null;
    $tipoSpedizione  = $input['tipo_spedizione']  ?? 'normale';

    if (!is_array($items) || count($items) === 0) {
        jsonResponse(['errori' => ['Carrello vuoto.']], 400);
    }

    $pdo = new PDO(
        "mysql:host=$DB_HOST;dbname=$DB_NAME;charset=utf8mb4",
        $DB_USER, $DB_PASS,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );

    // ── 1. Recupera i prezzi REALI dal database ──
    $skus = array_map(fn($i) => (string)$i['sku'], $items);
    $placeholders = implode(',', array_fill(0, count($skus), '?'));
    $stmt = $pdo->prepare("SELECT sku, nome, prezzo, disponibile, peso, categoria FROM prodotti WHERE sku IN ($placeholders)");
    $stmt->execute($skus);
    $prodotti = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $prodMap = [];
    foreach ($prodotti as $p) { $prodMap[$p['sku']] = $p; }

    // ── 2. Valida ogni riga del carrello ──
    $errori = [];
    $righeValidate = [];
    $subtotale = 0;
    $pesoTotale = 20; // imballo fisso

    foreach ($items as $item) {
        $sku  = (string)$item['sku'];
        $qty  = max(1, (int)($item['qty'] ?? 1));
        $prod = $prodMap[$sku] ?? null;

        if (!$prod) {
            $errori[] = "Prodotto non trovato: $sku";
            continue;
        }
        if ((int)$prod['disponibile'] < $qty) {
            $errori[] = "\"{$prod['nome']}\" — disponibili solo {$prod['disponibile']} pezzi (richiesti $qty).";
            continue;
        }

        $prezzoReale = (float)$prod['prezzo'];
        $pesoReale   = (float)($prod['peso'] ?: pesoDiCategoria($prod['categoria']));

        $subtotale  += $prezzoReale * $qty;
        $pesoTotale += $pesoReale * $qty;

        $righeValidate[] = [
            'sku' => $sku, 'nome' => $prod['nome'],
            'prezzo' => $prezzoReale, 'qty' => $qty, 'peso' => $pesoReale,
        ];
    }

    if (count($errori) > 0) {
        jsonResponse(['errori' => $errori], 400);
    }

    // ── 3. Applica sconto ──
    $sconto = 0;
    if ($codiceSconto) {
        $stmt = $pdo->prepare("SELECT * FROM sconti WHERE codice = ? AND attivo = 1 LIMIT 1");
        $stmt->execute([strtoupper($codiceSconto)]);
        $discount = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($discount) {
            $oggi = new DateTime();
            $dataInizio = $discount['data_inizio'] ? new DateTime($discount['data_inizio']) : null;
            $dataFine   = $discount['data_fine']   ? new DateTime($discount['data_fine'])   : null;
            $usoOk  = !$discount['uso_max'] || $discount['uso_count'] < $discount['uso_max'];
            $dataOk = (!$dataInizio || $oggi >= $dataInizio) && (!$dataFine || $oggi <= $dataFine);

            if ($usoOk && $dataOk) {
                $sconto = $discount['tipo'] === 'percentuale'
                    ? $subtotale * ((float)$discount['valore'] / 100)
                    : min((float)$discount['valore'], $subtotale);
            }
        }
    }

    $subtotaleScontato = $subtotale - $sconto;

    // ── 4. Spedizione ──
    $stmt = $pdo->query("SELECT chiave, valore FROM impostazioni");
    $cfg = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) { $cfg[$r['chiave']] = $r['valore']; }

    $racc1000 = (float)($cfg['racc_1000'] ?? 7.95);
    $racc3000 = (float)($cfg['racc_3000'] ?? 10.30);
    $raccMax  = (float)($cfg['racc_max']  ?? 20.00);

    if ($pesoTotale <= 1000)      $spedizione = $racc1000;
    elseif ($pesoTotale <= 3000)  $spedizione = $racc3000;
    else                          $spedizione = $raccMax;

    $promoAttiva = ($cfg['promo_sped_attiva'] ?? 'false') === 'true';
    $promoSoglia = (float)($cfg['promo_sped_soglia'] ?? 30);
    if ($promoAttiva && $subtotaleScontato >= $promoSoglia) {
        $spedizione = 0;
    }

    if ($tipoSpedizione === 'assicurata') {
        $spedizione = costoAssicurata($pesoTotale, $subtotaleScontato);
    }

    // ── 5. IVA e commissione PayPal ──
    $ivaPerc = (float)($cfg['iva_percentuale'] ?? 22);
    $imponibile = round($subtotaleScontato / (1 + $ivaPerc/100), 2);
    $iva = round($subtotaleScontato - $imponibile, 2);

    $paypalPerc  = (float)($cfg['paypal_perc']  ?? 3.5);
    $paypalFisso = (float)($cfg['paypal_fisso'] ?? 0.35);
    $baseComm    = $subtotaleScontato + $spedizione;
    $commissione = round($baseComm * $paypalPerc/100 + $paypalFisso, 2);

    $totale = round($subtotaleScontato + $spedizione + $commissione, 2);

    jsonResponse([
        'righe' => $righeValidate,
        'subtotale' => round2($subtotale),
        'sconto' => round2($sconto),
        'subtotale_scontato' => round2($subtotaleScontato),
        'imponibile' => round2($imponibile),
        'iva' => round2($iva),
        'spedizione' => round2($spedizione),
        'commissione' => round2($commissione),
        'totale' => round2($totale),
        'peso_totale_g' => $pesoTotale,
        'errori' => [],
    ], 200);

} catch (Exception $e) {
    jsonResponse(['errori' => ['Errore interno: ' . $e->getMessage()]], 500);
}
