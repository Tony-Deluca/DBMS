// Editor SQL basato su CodeMirror 6, pensato anche per iPad:
// niente autocorrezione/maiuscole automatiche e virgolette tipografiche convertite al volo.
import { EditorState, Compartment, type TransactionSpec, type ChangeSpec } from '@codemirror/state';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  drawSelection,
  placeholder,
  highlightSpecialChars,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { estensioneSql } from './dialetto';
import { HighlightStyle, syntaxHighlighting, bracketMatching, indentOnInput } from '@codemirror/language';
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { tags as t } from '@lezer/highlight';
import { normalizzaVirgolette } from '../sql/guard';

export interface EditorSQL {
  view: EditorView;
  testo(): string;
  imposta(testo: string): void;
  inserisci(testo: string, cursore?: number): void;
  schema(s: Record<string, string[]> | null): void;
  focus(): void;
}

const evidenziazione = HighlightStyle.define([
  { tag: t.keyword, class: 'tok-kw' },
  { tag: [t.string, t.special(t.string)], class: 'tok-str' },
  { tag: [t.number, t.bool, t.null], class: 'tok-num' },
  { tag: [t.lineComment, t.blockComment], class: 'tok-com' },
  { tag: [t.operator, t.compareOperator, t.arithmeticOperator, t.logicOperator], class: 'tok-op' },
  { tag: [t.typeName, t.standard(t.name)], class: 'tok-type' },
  { tag: [t.function(t.variableName), t.function(t.name)], class: 'tok-fn' },
  { tag: [t.punctuation, t.paren, t.separator, t.bracket], class: 'tok-punct' },
  { tag: t.special(t.name), class: 'tok-ident' },
]);

/** Converte le virgolette "intelligenti" inserite da tastiera, incolla o trascina. */
const filtroVirgolette = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged || !(tr.isUserEvent('input') || tr.isUserEvent('paste') || tr.isUserEvent('drop'))) return tr;
  const correzioni: ChangeSpec[] = [];
  tr.changes.iterChanges((_fa, _ta, fromB, _tb, inserito) => {
    const testo = inserito.toString();
    const norm = normalizzaVirgolette(testo);
    if (norm !== testo) correzioni.push({ from: fromB, to: fromB + testo.length, insert: norm });
  });
  if (correzioni.length === 0) return tr;
  return [tr, { changes: correzioni, sequential: true } as TransactionSpec];
});

export function creaEditor(
  genitore: HTMLElement,
  opzioni: { onEsegui: () => void; onVerifica: () => void; onCambio: (testo: string) => void },
): EditorSQL {
  const linguaggio = new Compartment();
  const configSql = estensioneSql;

  const view = new EditorView({
    parent: genitore,
    state: EditorState.create({
      doc: '',
      extensions: [
        lineNumbers(),
        highlightSpecialChars(),
        history(),
        drawSelection(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        autocompletion({ activateOnTyping: true, icons: false }),
        highlightActiveLine(),
        syntaxHighlighting(evidenziazione),
        EditorView.lineWrapping,
        placeholder('Scrivi qui la tua query SELECT…'),
        linguaggio.of(configSql(null)),
        filtroVirgolette,
        keymap.of([
          { key: 'Mod-Enter', run: () => (opzioni.onEsegui(), true), preventDefault: true },
          { key: 'Shift-Mod-Enter', run: () => (opzioni.onVerifica(), true), preventDefault: true },
          ...closeBracketsKeymap,
          ...completionKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          indentWithTab,
        ]),
        EditorView.contentAttributes.of({
          autocorrect: 'off',
          autocapitalize: 'off',
          autocomplete: 'off',
          spellcheck: 'false',
          'aria-label': 'Editor della query SQL',
          // suggerisce a iOS una tastiera senza correzioni
          inputmode: 'text',
          'data-gramm': 'false',
        }),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) opzioni.onCambio(u.state.doc.toString());
        }),
      ],
    }),
  });

  return {
    view,
    testo: () => view.state.doc.toString(),
    imposta(testo) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: testo }, selection: { anchor: testo.length } });
    },
    inserisci(testo, cursore) {
      const sel = view.state.selection.main;
      const pos = cursore ?? testo.length;
      view.dispatch({
        changes: { from: sel.from, to: sel.to, insert: testo },
        selection: { anchor: sel.from + pos },
        userEvent: 'input.type',
        scrollIntoView: true,
      });
      view.focus();
    },
    schema(s) {
      view.dispatch({ effects: linguaggio.reconfigure(configSql(s)) });
    },
    focus: () => view.focus(),
  };
}
