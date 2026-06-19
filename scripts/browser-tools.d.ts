// Types ambiants pour les 2 outils navigateur (design-review.ts, moodboard-analyzer.ts).
//
// `playwright` est une dépendance RUNTIME EXTERNE volontairement absente de package.json :
// ces scripts s'exécutent via la skill senior-designer, dans un contexte où playwright est
// disponible (jamais par les gates check/test/quality, qui restent zéro-dep). Ce fichier
// TYPE seulement le sous-ensemble réellement utilisé pour que le typecheck zéro-dep passe —
// il N'INSTALLE PAS playwright. Conforme au hook (c'est du code .d.ts, pas une config tsconfig).
// Pour exécuter ces 2 scripts, playwright doit être disponible à l'exécution.

declare module "playwright" {
  interface Viewport {
    width: number;
    height: number;
  }
  interface Page {
    goto(url: string, opts?: { waitUntil?: string; timeout?: number }): Promise<unknown>;
    screenshot(opts: { path: string; fullPage?: boolean; type?: string; quality?: number }): Promise<unknown>;
    evaluate<T>(fn: () => T): Promise<T>;
    close(): Promise<void>;
  }
  interface BrowserContext {
    newPage(): Promise<Page>;
  }
  interface Browser {
    newContext(opts?: { viewport?: Viewport }): Promise<BrowserContext>;
    close(): Promise<void>;
  }
  export const chromium: {
    launch(opts?: { headless?: boolean }): Promise<Browser>;
  };
}

// Globals DOM utilisés DANS les callbacks page.evaluate() (contexte navigateur, hors lib Node).
// Typés au minimum strict utilisé — pas de `any`.
interface MinimalElement {
  readonly tagName?: string;
}
interface MinimalCSSStyleDeclaration {
  fontFamily: string;
  color: string;
  backgroundColor: string;
}
declare function getComputedStyle(el: MinimalElement): MinimalCSSStyleDeclaration;
declare const document: {
  querySelectorAll(selectors: string): ArrayLike<MinimalElement>;
};
