declare module "citation-js" {
  interface CitePlugins {
    input: {
      chainLink(data: string): Array<{
        type: string;
        label: string;
        properties: Record<string, any>;
      }>;
      [key: string]: any;
    };
    output: { [key: string]: any };
    config: {
      get(plugin: string): any;
      list(): string[];
    };
    [key: string]: any;
  }

  class Cite {
    constructor(data: any, options?: any);
    data: Record<string, any>[];
    static plugins: CitePlugins;
    static util: { downgradeCsl(data: Record<string, any>[]): Record<string, any>[] };
    format(style: string, options?: Record<string, any>): string;
  }

  export default Cite;
}

declare module "citeproc" {
  /** The subset of citeproc-js used here; see https://citeproc-js.readthedocs.io. */
  interface VariableWrapperParams {
    itemData?: Record<string, any>;
    variableNames?: string[];
    context?: "bibliography" | "citation";
    mode?: string;
  }

  interface Sys {
    retrieveItem(id: string): Record<string, any>;
    retrieveLocale(lang: string): unknown;
    variableWrapper?(params: VariableWrapperParams, prePunct: string, str: string, postPunct: string): string;
  }

  class Engine {
    constructor(sys: Sys, style: string, lang?: string, forceLang?: boolean);
    opt: { development_extensions: Record<string, unknown> };
    updateItems(ids: string[], nosort?: boolean): string[];
    makeBibliography(): [Record<string, unknown>, string[]] | false;
  }

  const CSL: { Engine: typeof Engine };
  export default CSL;
}
