// Cronologia annulla/ripeti a istantanee (JSON). Le modifiche consecutive con la stessa «chiave di unione»
// (es. digitare un nome) diventano un solo passo.

export class Storia<T> {
  private passato: string[] = [];
  private futuro: string[] = [];
  private ultimaUnione: { chiave: string; quando: number } | null = null;

  constructor(private limite = 100, private finestraUnione = 1200) {}

  /** Da chiamare PRIMA di applicare una modifica, con lo stato corrente. */
  registra(stato: T, unione?: string): void {
    const ora = Date.now();
    if (unione && this.ultimaUnione && this.ultimaUnione.chiave === unione && ora - this.ultimaUnione.quando < this.finestraUnione) {
      this.ultimaUnione.quando = ora;
      return;
    }
    this.passato.push(JSON.stringify(stato));
    if (this.passato.length > this.limite) this.passato.shift();
    this.futuro = [];
    this.ultimaUnione = unione ? { chiave: unione, quando: ora } : null;
  }

  /** Restituisce lo stato precedente (o null) e memorizza `corrente` per il ripeti. */
  annulla(corrente: T): T | null {
    const prec = this.passato.pop();
    if (prec === undefined) return null;
    this.futuro.push(JSON.stringify(corrente));
    this.ultimaUnione = null;
    return JSON.parse(prec) as T;
  }

  ripeti(corrente: T): T | null {
    const succ = this.futuro.pop();
    if (succ === undefined) return null;
    this.passato.push(JSON.stringify(corrente));
    this.ultimaUnione = null;
    return JSON.parse(succ) as T;
  }

  get puoAnnullare() {
    return this.passato.length > 0;
  }
  get puoRipetere() {
    return this.futuro.length > 0;
  }

  svuota() {
    this.passato = [];
    this.futuro = [];
    this.ultimaUnione = null;
  }
}
