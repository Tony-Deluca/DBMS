// Descrizione testuale completa e non ambigua del progetto, da incollare in una chat con un'IA per la correzione.
// Formato pensato per essere letto anche da una persona (non JSON).
import type { Attributo, Progetto, SchemaER, SchemaLogicoP } from './modello';
import { elencoVincoli } from './notazioneLogico';

function descriviAttributo(a: Attributo): string {
  const parti: string[] = [a.nome || '(senza nome)'];
  if (a.identificatore) parti.push('[identificatore]');
  switch (a.cardinalita) {
    case '(0,1)':
      parti.push('(0,1) facoltativo');
      break;
    case '(1,N)':
      parti.push('(1,N) multivalore');
      break;
    case '(0,N)':
      parti.push('(0,N) facoltativo e multivalore');
      break;
  }
  if (a.componenti.length) parti.push(`[composto da: ${a.componenti.map((c) => descriviAttributo(c)).join(', ')}]`);
  return parti.join(' ');
}

export function descriviSchemaER(s: SchemaER): string {
  const righe: string[] = [];
  const nome = (id: string) => s.entita.find((e) => e.id === id)?.nome ?? '(entità eliminata)';
  const nomeRel = (id: string) => s.relazioni.find((r) => r.id === id)?.nome ?? '(relazione eliminata)';
  const padreDi = new Map<string, string>();
  for (const g of s.generalizzazioni) for (const f of g.figlie) padreDi.set(f, g.padre);

  if (s.entita.length + s.relazioni.length === 0) return 'Schema vuoto.';

  righe.push(`Entità (${s.entita.length}):`);
  for (const e of s.entita) {
    righe.push(`- ${e.nome}`);
    righe.push(`    attributi: ${e.attributi.length ? e.attributi.map(descriviAttributo).join('; ') : 'nessuno'}`);
    const interni = e.attributi.filter((a) => a.identificatore).map((a) => a.nome);
    const esterni = e.identificatoreEsterno.map((r) => {
      const rel = s.relazioni.find((x) => x.id === r);
      const altre = rel?.partecipazioni.filter((p) => p.entita !== e.id).map((p) => nome(p.entita)) ?? [];
      return `identificatore esterno tramite ${nomeRel(r)}${altre.length ? ` (da ${[...new Set(altre)].join(', ')})` : ''}`;
    });
    if (interni.length || esterni.length) {
      const parteInterna = interni.length > 1 ? `${interni.join(' + ')} (identificatore composto)` : interni.join('');
      righe.push(`    identificatore: ${[parteInterna, ...esterni].filter(Boolean).join(' + ')}`);
    } else if (padreDi.has(e.id)) {
      righe.push(`    identificatore: ereditato da ${nome(padreDi.get(e.id)!)} (generalizzazione)`);
    } else {
      righe.push('    identificatore: NON INDICATO');
    }
  }

  righe.push('', `Relazioni (${s.relazioni.length}):`);
  for (const r of s.relazioni) {
    const tipo = new Set(r.partecipazioni.map((p) => p.entita)).size < r.partecipazioni.length ? ' (ricorsiva)' : r.partecipazioni.length > 2 ? ` (${r.partecipazioni.length === 3 ? 'ternaria' : `${r.partecipazioni.length}-aria`})` : '';
    const partecipanti = r.partecipazioni.map((p) => `${nome(p.entita)}${p.ruolo.trim() ? ` [ruolo: ${p.ruolo.trim()}]` : ''} ${p.cardinalita ?? '(cardinalità non indicata)'}`);
    const elenco = partecipanti.length === 0 ? 'nessuna entità' : partecipanti.length === 1 ? `solo ${partecipanti[0]}` : `${partecipanti.slice(0, -1).join(', ')} e ${partecipanti[partecipanti.length - 1]}`;
    righe.push(`- ${r.nome}${tipo} tra ${elenco}`);
    if (r.attributi.length) righe.push(`    attributi: ${r.attributi.map(descriviAttributo).join('; ')}`);
  }

  righe.push('', `Generalizzazioni (${s.generalizzazioni.length}):`);
  if (s.generalizzazioni.length === 0) righe.push('- nessuna');
  const COPERTURE: Record<string, string> = { '(t,e)': 'totale ed esclusiva', '(t,s)': 'totale e sovrapposta', '(p,e)': 'parziale ed esclusiva', '(p,s)': 'parziale e sovrapposta' };
  for (const g of s.generalizzazioni) {
    righe.push(`- padre ${nome(g.padre)}, figlie ${g.figlie.map(nome).join(', ')}; copertura ${g.copertura} = ${COPERTURE[g.copertura]}`);
  }
  return righe.join('\n');
}

export function descriviSchemaLogico(l: SchemaLogicoP): string {
  if (l.tabelle.length === 0) return 'Schema vuoto.';
  const righe: string[] = [
    'Legenda: _Nome_ = attributo della chiave primaria (sottolineato); Nome* = attributo facoltativo (ammette NULL).',
    '',
  ];
  for (const t of l.tabelle) {
    righe.push(`${t.nome}(${t.colonne.map((c) => `${c.pk ? `_${c.nome}_` : c.nome}${c.facoltativa ? '*' : ''}`).join(', ')})`);
  }
  righe.push('', 'Chiavi primarie:');
  for (const t of l.tabelle) {
    const pk = t.colonne.filter((c) => c.pk).map((c) => c.nome);
    righe.push(`- ${t.nome}: ${pk.length ? pk.join(', ') : 'NON INDICATA'}`);
  }
  const facoltativi = l.tabelle.flatMap((t) => t.colonne.filter((c) => c.facoltativa).map((c) => `${t.nome}.${c.nome}`));
  righe.push('', `Attributi facoltativi: ${facoltativi.length ? facoltativi.join(', ') : 'nessuno'}`);
  const vincoli = elencoVincoli(l);
  righe.push('', 'Vincoli di integrità referenziale:');
  if (vincoli.length === 0) righe.push('- nessuno');
  for (const v of vincoli) righe.push(`- ${v}`);
  return righe.join('\n');
}

export function testoPerIA(p: Progetto): string {
  const sezioni: string[] = [
    `PROGETTO: ${p.nome}`,
    'Esercizio di progettazione di basi di dati (notazione Atzeni–Ceri): schema ER, ristrutturazione, traduzione nel modello relazionale.',
    'Legenda ER: cardinalità (min,max); un attributo senza cardinalità è (1,1); [identificatore] = fa parte dell\'identificatore dell\'entità.',
    '',
    '=== TRACCIA ===',
    p.traccia.trim() || '(nessuna traccia indicata)',
    '',
    '=== 1. SCHEMA CONCETTUALE (ER) ===',
    descriviSchemaER(p.er),
    '',
    '=== 2. SCHEMA ER RISTRUTTURATO ===',
    p.erRistrutturato ? descriviSchemaER(p.erRistrutturato) : '(non ancora fatto)',
    '',
    '=== NOTE SULLA RISTRUTTURAZIONE ===',
    p.noteRistrutturazione.trim() || '(nessuna nota)',
    '',
    '=== 3. SCHEMA LOGICO RELAZIONALE ===',
    descriviSchemaLogico(p.logico),
  ];
  return sezioni.join('\n') + '\n';
}
