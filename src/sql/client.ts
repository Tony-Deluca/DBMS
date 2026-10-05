// Client del worker SQL: chiamate asincrone con timeout. Se una query non
// termina, il worker viene terminato, ricreato e il database ricaricato.
import type { Richiesta } from './protocollo';
import type { RisultatoEsecuzione, RispostaVerifica, ProblemaSQL } from './engine';

export const TIMEOUT_MS = 8000;
export const MAX_RIGHE_VISTA = 2000;

export class ErroreTimeout extends Error {
  constructor() {
    super(
      `Query interrotta dopo ${TIMEOUT_MS / 1000} secondi: probabilmente genera un prodotto cartesiano enorme o una CTE ricorsiva senza fine. Il database è stato ricaricato.`,
    );
  }
}

interface InAttesa {
  risolvi: (v: unknown) => void;
  rifiuta: (e: Error) => void;
  timer: ReturnType<typeof setTimeout> | null;
}

export class ClientSQL {
  private worker: Worker | null = null;
  private prossimoId = 1;
  private attese = new Map<number, InAttesa>();
  private statementsCorrenti: string[] | null = null;
  private caricamento: Promise<{ schema: Record<string, string[]> }> | null = null;

  private avvia(): Worker {
    if (this.worker) return this.worker;
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (ev: MessageEvent<{ id: number; ok: boolean; risultato?: unknown; errore?: string }>) => {
      const a = this.attese.get(ev.data.id);
      if (!a) return;
      this.attese.delete(ev.data.id);
      if (a.timer) clearTimeout(a.timer);
      if (ev.data.ok) a.risolvi(ev.data.risultato);
      else a.rifiuta(new Error(ev.data.errore));
    };
    w.onerror = (ev) => {
      ev.preventDefault();
      const err = new Error(`Errore del motore SQL: ${ev.message || 'impossibile avviare SQLite'}`);
      for (const a of this.attese.values()) {
        if (a.timer) clearTimeout(a.timer);
        a.rifiuta(err);
      }
      this.attese.clear();
      this.worker?.terminate();
      this.worker = null;
    };
    this.worker = w;
    return w;
  }

  private chiama<T>(richiesta: Richiesta, timeout: number | null): Promise<T> {
    const w = this.avvia();
    const id = this.prossimoId++;
    return new Promise<T>((risolvi, rifiuta) => {
      const timer = timeout
        ? setTimeout(() => {
            this.attese.delete(id);
            this.riavvia();
            rifiuta(new ErroreTimeout());
          }, timeout)
        : null;
      this.attese.set(id, { risolvi: risolvi as (v: unknown) => void, rifiuta, timer });
      w.postMessage({ id, richiesta });
    });
  }

  /** Termina il worker (query bloccata) e ricarica il database corrente. */
  private riavvia() {
    this.worker?.terminate();
    this.worker = null;
    for (const a of this.attese.values()) {
      if (a.timer) clearTimeout(a.timer);
      a.rifiuta(new Error('Motore SQL riavviato.'));
    }
    this.attese.clear();
    if (this.statementsCorrenti) {
      const st = this.statementsCorrenti;
      this.caricamento = this.chiama<{ schema: Record<string, string[]> }>({ tipo: 'carica', statements: st }, null);
      this.caricamento.catch(() => undefined);
    }
  }

  carica(statements: string[]): Promise<{ schema: Record<string, string[]> }> {
    this.statementsCorrenti = statements;
    this.caricamento = this.chiama({ tipo: 'carica', statements }, null);
    return this.caricamento;
  }

  private async pronto() {
    if (!this.caricamento) throw new Error('Nessuno scenario caricato.');
    await this.caricamento;
  }

  async esegui(sql: string): Promise<RisultatoEsecuzione> {
    await this.pronto();
    return this.chiama({ tipo: 'esegui', sql, maxRighe: MAX_RIGHE_VISTA }, TIMEOUT_MS);
  }

  async verifica(sql: string, soluzioni: string[]): Promise<RispostaVerifica> {
    await this.pronto();
    return this.chiama({ tipo: 'verifica', sql, soluzioni, maxRighe: MAX_RIGHE_VISTA }, TIMEOUT_MS * 2);
  }

  /** Prova lo scenario su un DB temporaneo (non tocca quello corrente). */
  prova(statements: string[], esercizi: { id: string; soluzioni: string[] }[], tabelleLogico: string[]): Promise<ProblemaSQL[]> {
    return this.chiama({ tipo: 'prova', statements, esercizi, tabelleLogico }, 30000);
  }
}

export const sql = new ClientSQL();
