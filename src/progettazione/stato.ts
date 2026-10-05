// Stato della sezione Progettazione: elenco dei progetti, progetto aperto, annulla/ripeti e salvataggio
// automatico in IndexedDB (con la stessa richiesta di archiviazione persistente del resto dell'app).
import * as archivio from '../storage/idb';
import { clona, copiaSchemaER, normalizzaProgetto, nuovoProgetto, type Progetto, type SchemaER, type SchemaLogicoP } from './modello';
import { Storia } from './storia';
import { progettoEsempio } from './esempio';
import { nomeUnico } from './operazioni';

/** Parte del progetto coperta da annulla/ripeti (i testi liberi usano l'annulla del campo di testo). */
interface Istantanea {
  er: SchemaER;
  erRistrutturato: SchemaER | null;
  logico: SchemaLogicoP;
}

export type EventoProgetto = 'elenco' | 'progetto' | 'schema' | 'storia';

class StatoProgettazione {
  progetti: Progetto[] = [];
  corrente: Progetto | null = null;
  caricato = false;
  private storia = new Storia<Istantanea>();
  private ascoltatori = new Map<EventoProgetto, Set<() => void>>();
  private timerSalvataggio: ReturnType<typeof setTimeout> | null = null;

  on(e: EventoProgetto, f: () => void) {
    if (!this.ascoltatori.has(e)) this.ascoltatori.set(e, new Set());
    this.ascoltatori.get(e)!.add(f);
  }
  private emetti(...e: EventoProgetto[]) {
    for (const x of e) for (const f of this.ascoltatori.get(x) ?? []) f();
  }

  async carica(): Promise<void> {
    if (this.caricato) return;
    this.progetti = (await archivio.elencoProgetti()).map((p) => normalizzaProgetto(p));
    if (this.progetti.length === 0) {
      const es = progettoEsempio(archivio.nuovoId());
      await archivio.salvaProgetto(es);
      this.progetti = [es];
    }
    this.caricato = true;
    const ultimo = await archivio.leggiImpostazione<string>('ultimoProgetto');
    this.apri(this.progetti.find((p) => p.id === ultimo)?.id ?? this.progetti[0].id);
    this.emetti('elenco');
  }

  apri(id: string): void {
    this.salvaSubito();
    this.corrente = this.progetti.find((p) => p.id === id) ?? null;
    this.storia.svuota();
    archivio.scriviImpostazione('ultimoProgetto', id).catch(() => undefined);
    this.emetti('progetto', 'schema', 'storia');
  }

  // ---------- modifiche ----------

  /** Modifica degli schemi (ER, ER ristrutturato, logico): un passo di annulla/ripeti. */
  modifica(f: (p: Progetto) => void, unione?: string): void {
    const p = this.corrente;
    if (!p) return;
    this.storia.registra(this.istantanea(p), unione);
    f(p);
    this.dopoModifica(p);
    this.emetti('schema', 'storia');
  }

  /** Dopo modifiche fatte direttamente (es. durante un trascinamento già registrato): notifica e salva. */
  notifica(): void {
    const p = this.corrente;
    if (!p) return;
    this.dopoModifica(p);
    this.emetti('schema');
  }

  /** Modifica dei testi (traccia, note, bozza): niente annulla/ripeti, solo salvataggio. */
  modificaTesto(f: (p: Progetto) => void): void {
    const p = this.corrente;
    if (!p) return;
    f(p);
    this.dopoModifica(p);
  }

  private istantanea(p: Progetto): Istantanea {
    return { er: p.er, erRistrutturato: p.erRistrutturato, logico: p.logico };
  }

  private ripristina(p: Progetto, i: Istantanea) {
    p.er = i.er;
    p.erRistrutturato = i.erRistrutturato;
    p.logico = i.logico;
    this.dopoModifica(p);
    this.emetti('schema', 'storia');
  }

  annulla(): void {
    const p = this.corrente;
    const prec = p && this.storia.annulla(this.istantanea(p));
    if (p && prec) this.ripristina(p, prec);
  }

  ripeti(): void {
    const p = this.corrente;
    const succ = p && this.storia.ripeti(this.istantanea(p));
    if (p && succ) this.ripristina(p, succ);
  }

  get puoAnnullare() {
    return this.storia.puoAnnullare;
  }
  get puoRipetere() {
    return this.storia.puoRipetere;
  }

  creaCopiaRistrutturazione(): void {
    this.modifica((p) => {
      p.erRistrutturato = copiaSchemaER(p.er);
    });
  }

  // ---------- salvataggio ----------

  private dopoModifica(p: Progetto) {
    p.modificato = Date.now();
    if (this.timerSalvataggio) clearTimeout(this.timerSalvataggio);
    this.timerSalvataggio = setTimeout(() => this.salvaSubito(), 400);
  }

  salvaSubito(): void {
    if (this.timerSalvataggio) clearTimeout(this.timerSalvataggio);
    this.timerSalvataggio = null;
    const p = this.corrente;
    if (p) archivio.salvaProgetto(clona(p)).catch(() => undefined);
  }

  // ---------- gestione progetti ----------

  async nuovo(nome?: string): Promise<Progetto> {
    const p = nuovoProgetto(nomeUnico(this.progetti.map((x) => x.nome), nome ?? 'Nuovo progetto'), archivio.nuovoId());
    return this.aggiungi(p);
  }

  async aggiungi(p: Progetto): Promise<Progetto> {
    p.nome = nomeUnico(this.progetti.filter((x) => x.id !== p.id).map((x) => x.nome), p.nome);
    await archivio.salvaProgetto(clona(p));
    this.progetti.unshift(p);
    void archivio.richiediPersistenza();
    this.emetti('elenco');
    this.apri(p.id);
    return p;
  }

  async rinomina(id: string, nome: string): Promise<void> {
    const p = this.progetti.find((x) => x.id === id);
    if (!p || !nome.trim()) return;
    p.nome = nome.trim();
    p.modificato = Date.now();
    await archivio.salvaProgetto(clona(p));
    this.emetti('elenco', 'progetto');
  }

  async duplica(id: string): Promise<Progetto | undefined> {
    const p = this.progetti.find((x) => x.id === id);
    if (!p) return undefined;
    const copia = clona(p);
    copia.id = archivio.nuovoId();
    copia.nome = `${p.nome} (copia)`;
    copia.creato = copia.modificato = Date.now();
    return this.aggiungi(copia);
  }

  async elimina(id: string): Promise<void> {
    await archivio.eliminaProgetto(id);
    this.progetti = this.progetti.filter((x) => x.id !== id);
    if (this.progetti.length === 0) {
      const es = progettoEsempio(archivio.nuovoId());
      await archivio.salvaProgetto(es);
      this.progetti = [es];
    }
    this.emetti('elenco');
    if (this.corrente?.id === id) this.apri(this.progetti[0].id);
  }

  /** Importa un progetto da JSON (file esportato). Restituisce un messaggio d'errore oppure null. */
  async importaJson(testo: string): Promise<string | null> {
    let dati: unknown;
    try {
      dati = JSON.parse(testo.replace(/^﻿/, '').trim());
    } catch {
      return 'Il file non contiene un JSON valido.';
    }
    const o = dati as Partial<Progetto> & { tipo?: string };
    if (!o || typeof o !== 'object' || !o.er || !o.logico) return 'Non sembra un progetto di Progettazione (mancano «er» e «logico»).';
    const p = normalizzaProgetto({ ...o, id: archivio.nuovoId() });
    p.nome = o.nome ?? 'Progetto importato';
    await this.aggiungi(p);
    return null;
  }

  esportaJson(p: Progetto): string {
    return JSON.stringify({ tipo: 'palestra-sql-progetto', ...p }, null, 2);
  }
}

export const progettazione = new StatoProgettazione();
