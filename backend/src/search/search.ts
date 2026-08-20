export interface SearchResult {
  title: string;
  url: string;
  content: string;
}

export interface SearchProvider {
  readonly name: string;
  search(query: string, maxResults?: number): Promise<SearchResult[]>;
}

export function createSearchProvider(): SearchProvider {
  const provider = process.env.SEARCH_PROVIDER || 'tavily';
  switch (provider) {
    case 'tavily':
      return new TavilyProvider();
    case 'mock':
      return new MockSearchProvider();
    default:
      throw new Error(`Proveedor de búsqueda no soportado: ${provider}`);
  }
}

/**
 * Tavily Search (keyless, sin API key): optimizado para LLMs/agentes.
 * POST https://api.tavily.com/search con header X-Tavily-Access-Mode: keyless.
 */
class TavilyProvider implements SearchProvider {
  readonly name = 'tavily';

  async search(query: string, maxResults = 5): Promise<SearchResult[]> {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Tavily-Access-Mode': 'keyless' },
      body: JSON.stringify({ query, max_results: maxResults }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Tavily error ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = (await res.json()) as {
      answer?: string | null;
      results?: Array<{ title?: string; url?: string; content?: string }>;
    };
    const results = (data.results ?? []).map((r) => ({
      title: r.title ?? '',
      url: r.url ?? '',
      content: r.content ?? '',
    }));
    if (data.answer && results.length === 0) {
      results.push({ title: 'Respuesta', url: '', content: data.answer });
    }
    return results;
  }
}

/** Provider de demostración sin red (para tests y desarrollo sin internet). */
class MockSearchProvider implements SearchProvider {
  readonly name = 'mock';

  async search(query: string, maxResults = 5): Promise<SearchResult[]> {
    return [
      {
        title: `Resultado mock para: ${query}`,
        url: 'https://example.com/mock',
        content:
          'Resultado simulado (SEARCH_PROVIDER=mock). Configurá SEARCH_PROVIDER=tavily para búsqueda real.',
      },
    ];
  }
}