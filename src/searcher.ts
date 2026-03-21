import * as cheerio from 'cheerio';
import { Config, BookInfo, SearchResult } from './types.js';
import { HttpClient } from './http-client.js';
import { logger } from './logger.js';

export class Searcher {
  private config: Config;
  private httpClient: HttpClient;

  constructor(config: Config, httpClient: HttpClient) {
    this.config = config;
    this.httpClient = httpClient;
  }

  private parseSize(sizeStr: string): number {
    const match = sizeStr.match(/^([\d.]+)\s*(KB|MB|GB)$/i);
    if (!match) return 0;

    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();

    switch (unit) {
      case 'KB': return Math.round(value * 1024);
      case 'MB': return Math.round(value * 1024 * 1024);
      case 'GB': return Math.round(value * 1024 * 1024 * 1024);
      default: return 0;
    }
  }

  private parseFormatInfo(text: string): { format: 'pdf' | 'epub'; language: string; size: string; sizeBytes: number; year: string } {
    // Parse text like "English [en] · PDF · 26.8MB · 1971"
    const parts = text.split('·').map(p => p.trim());

    let format: 'pdf' | 'epub' = 'pdf';
    let language = '';
    let size = '';
    let sizeBytes = 0;
    let year = '';

    for (const part of parts) {
      const lowerPart = part.toLowerCase();
      if (lowerPart === 'pdf' || lowerPart === 'epub') {
        format = lowerPart;
      } else if (part.match(/^\d{4}$/)) {
        year = part;
      } else if (part.match(/[\d.]+\s*(KB|MB|GB)/i)) {
        size = part;
        sizeBytes = this.parseSize(part);
      } else if (part.includes('[') && part.includes(']')) {
        language = part;
      }
    }

    return { format, language, size, sizeBytes, year };
  }

  async search(book: BookInfo): Promise<SearchResult[]> {
    // Determine search title based on language field
    let searchTitle: string;
    if (book.language === 'en') {
      searchTitle = book.englishTitle || book.chineseTitle;
    } else {
      searchTitle = book.chineseTitle || book.englishTitle;
    }

    if (!searchTitle) {
      logger.warn(`Row ${book.rowIndex}: No title available for search`);
      return [];
    }

    const encodedTitle = encodeURIComponent(searchTitle);
    const langParam = book.language || 'en';
    const url = `${this.config.baseUrl}/search?index=&page=1&sort=&lang=${langParam}&ext=pdf&ext=epub&display=&q=${encodedTitle}`;

    logger.info(`Searching for: ${searchTitle}`);

    try {
      const { status, body } = await this.httpClient.get(url);

      // Check for CAPTCHA
      if (this.httpClient.isCaptchaResponse(body, status)) {
        return this.handleCaptcha(url);
      }

      return this.parseSearchResults(body, searchTitle);
    } catch (error) {
      logger.error(`Search failed for "${searchTitle}": ${(error as Error).message}`);
      return [];
    }
  }

  async searchByQuery(
    query: string,
    format?: 'pdf' | 'epub'
  ): Promise<SearchResult[]> {
    if (!query || !query.trim()) {
      logger.warn('Empty search query provided');
      return [];
    }

    const encodedQuery = encodeURIComponent(query.trim());

    // Build format parameter
    let extParam: string;
    if (format === 'pdf') {
      extParam = 'ext=pdf';
    } else if (format === 'epub') {
      extParam = 'ext=epub';
    } else {
      extParam = 'ext=pdf&ext=epub';
    }

    const url = `${this.config.baseUrl}/search?index=&page=1&sort=&${extParam}&display=&q=${encodedQuery}`;

    logger.info(`Searching for: ${query}`);

    try {
      const { status, body } = await this.httpClient.get(url);

      // Check for CAPTCHA
      if (this.httpClient.isCaptchaResponse(body, status)) {
        return this.handleCaptcha(url);
      }

      return this.parseSearchResults(body, query);
    } catch (error) {
      logger.error(`Search failed for "${query}": ${(error as Error).message}`);
      return [];
    }
  }

  private handleCaptcha(url: string): SearchResult[] {
    logger.warn('CAPTCHA detected!');
    console.log('\n' + '='.repeat(60));
    console.log('CAPTCHA detected. Please visit the URL in a browser:');
    console.log(url);
    console.log('Solve the CAPTCHA, then update cookies.json with new session cookies.');
    console.log('Press Enter to continue (or type "quit" to abort)...');
    console.log('='.repeat(60) + '\n');

    // In a real implementation, we'd wait for user input
    // For now, return empty array and let main loop handle it
    throw new Error('CAPTCHA_DETECTED');
  }

  private parseSearchResults(html: string, searchTitle: string): SearchResult[] {
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];

    // Find all MD5 links
    $('a[href^="/md5/"]').each((_, element) => {
      try {
        const $link = $(element);
        const href = $link.attr('href') || '';
        const md5 = href.replace('/md5/', '');

        if (!md5 || md5.length < 20) return; // Invalid MD5

        const title = $link.text().trim();
        if (!title) return; // Skip results with empty titles

        // Find author link (spec: Links containing icon-[mdi--user-edit])
        const $parent = $link.closest('tr, div');
        let author = '';
        $parent.find('a[class*="icon-[mdi--user-edit]"], a:has([class*="icon-[mdi--user-edit]"])').each((_, el) => {
          const text = $(el).text().trim();
          if (text && !author) author = text;
        });

        // Find format info
        const parentText = $parent.text();
        const formatInfo = this.parseFormatInfo(parentText);

        results.push({
          md5,
          title,
          author,
          format: formatInfo.format,
          language: formatInfo.language,
          size: formatInfo.size,
          sizeBytes: formatInfo.sizeBytes,
          year: formatInfo.year,
          publisher: '',
        });
      } catch (error) {
        logger.warn(`Failed to parse search result: ${(error as Error).message}`);
      }
    });

    logger.info(`Found ${results.length} results for "${searchTitle}"`);
    return results;
  }

  // Standardize text for comparison
  private normalize(text: string): string {
    if (!text) return '';
    return text.toLowerCase()
      .replace(/&/g, 'and')
      .replace(/\(translator\)/gi, '')
      .replace(/\(editor\)/gi, '')
      .replace(/\(trans\.?\)/gi, '')
      .replace(/\(ed\.?\)/gi, '')
      .replace(/\btrans\.?\b/gi, '')
      .replace(/\W+/g, '');
  }

  // Check if language matches
  private isLanguageMatch(bookLanguage: string, resultLanguage: string): boolean {
    if (!bookLanguage || !resultLanguage) return true; // No info, don't filter

    const langCode = bookLanguage.toLowerCase();
    // resultLanguage format: "English [en]" or "Chinese [zh]"
    const match = resultLanguage.match(/\[([a-z-]+)\]/i);
    const resultCode = match ? match[1].toLowerCase() : '';

    // en matches en, en-us, en-gb etc.
    if (langCode === 'en') return resultCode.startsWith('en');
    if (langCode === 'zh') return resultCode.startsWith('zh');
    return resultCode.includes(langCode);
  }

  // Check if author matches (full name or surname)
  private isAuthorMatch(searchAuthor: string, resultAuthor: string): boolean {
    const normSearch = this.normalize(searchAuthor);
    const normResult = this.normalize(resultAuthor);

    // Full name match
    if (normResult.includes(normSearch)) return true;

    // Surname match: extract from original string before normalizing
    const cleanSearch = searchAuthor
      .replace(/\(.*?\)/g, '')      // Remove (Translator), (Editor), etc.
      .replace(/\btrans\.?\b/gi, '') // Remove trans., trans
      .trim();
    const surname = cleanSearch.split(/\s+/).pop()?.toLowerCase() || '';

    if (surname && surname.length > 1 && normResult.includes(surname)) return true;

    return false;
  }

  // Check if title matches (segment matching)
  private isTitleMatch(searchTitle: string, resultTitle: string): boolean {
    const normSearch = this.normalize(searchTitle);
    const normResult = this.normalize(resultTitle);

    // Skip empty normalized titles (e.g., Chinese-only titles when searching English)
    if (!normResult || !normSearch) return false;

    // Full match
    if (normResult.includes(normSearch) || normSearch.includes(normResult)) return true;

    // Segment matching: split by :;—-
    const separators = /[:;—\-]/;
    const searchSegments = searchTitle.split(separators).map(s => this.normalize(s.trim()));
    const resultSegments = resultTitle.split(separators).map(s => this.normalize(s.trim()));

    // Check if main title (first segment) matches
    if (searchSegments[0] && resultSegments[0] && searchSegments[0] === resultSegments[0]) {
      return true;
    }

    return false;
  }

  // Use LLM to determine which candidate best matches the search title
  private async llmBatchMatch(searchTitle: string, candidates: SearchResult[]): Promise<SearchResult | null> {
    const openaiEnabled = this.config.openai?.enable !== false && this.config.openai?.apiKey;
    if (!openaiEnabled || candidates.length === 0) {
      return null;
    }

    // Build candidate list for prompt
    const candidateList = candidates.map((c, i) => `${i + 1}. "${c.title}"`).join('\n');
    const prompt = `Determine which candidate refers to the same book as the search title.

Search: "${searchTitle}"

Candidates:
${candidateList}

Reply only the number of the best match, or "none" if no match.`;

    // DEBUG: Print prompt without calling API
    console.log('\n========== LLM PROMPT ==========');
    console.log(prompt);
    console.log('================================\n');
    return null;  // Skip actual API call for debugging

    /*  // Actual API call (commented for debugging)
    try {
      // Build API URL - handle if baseUrl already contains /chat/completions
      let apiUrl = this.config.openai.baseUrl || 'https://api.openai.com/v1';
      if (!apiUrl.includes('/chat/completions')) {
        apiUrl = apiUrl.replace(/\/$/, '') + '/chat/completions';
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.openai.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.openai.model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 10,
          temperature: 0,
        }),
      });

      if (!response.ok) {
        logger.warn(`LLM API error: ${response.status}`);
        return null;
      }

      const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      const content = data.choices?.[0]?.message?.content?.trim().toLowerCase() || '';
      logger.info(`LLM response for "${searchTitle}": ${content}`);

      // Parse response - expect a number or "none"
      if (content === 'none') {
        return null;
      }

      const matchIndex = parseInt(content) - 1;
      if (matchIndex >= 0 && matchIndex < candidates.length) {
        return candidates[matchIndex];
      }

      return null;
    } catch (error) {
      logger.warn(`LLM batch match failed: ${(error as Error).message}`);
      return null;
    }
    */
  }

  // Filter candidates based on volume and other metadata
  private preFilterCandidates(searchTitle: string, candidates: SearchResult[]): SearchResult[] {
    return candidates.filter(r => {
      // Volume filter: if search title has "Volume X", candidate must match
      const searchVolume = searchTitle.match(/volume\s*(\d+)/i)?.[1];
      const resultVolume = r.title.match(/volume\s*(\d+)/i)?.[1];
      if (searchVolume && resultVolume && searchVolume !== resultVolume) {
        return false;
      }

      return true;
    });
  }

  async selectBestResult(results: SearchResult[], searchTitle: string, searchAuthor?: string, bookLanguage?: string): Promise<SearchResult | null> {
    if (results.length === 0) return null;
    logger.info(`[Filter] Starting with ${results.length} results`);

    // Filter by format priority: PDF > EPUB, and exclude empty titles
    const pdfResults = results.filter(r => r.format === 'pdf' && r.title);
    const epubResults = results.filter(r => r.format === 'epub' && r.title);
    logger.info(`[Filter] Format: ${pdfResults.length} PDF, ${epubResults.length} EPUB`);

    let candidates = pdfResults.length > 0 ? pdfResults : epubResults;

    // Filter by language
    if (bookLanguage) {
      const beforeLang = candidates.length;
      const langFiltered = candidates.filter(r => this.isLanguageMatch(bookLanguage, r.language));
      logger.info(`[Filter] Language (${bookLanguage}): ${beforeLang} → ${langFiltered.length}`);
      if (langFiltered.length === 0) {
        logger.warn(`No results match language: ${bookLanguage}`);
        return null;
      }
      candidates = langFiltered;
    }

    if (candidates.length === 0) return null;

    // Filter by author
    if (searchAuthor) {
      const beforeAuthor = candidates.length;
      const authorFiltered = candidates.filter(r => r.author && this.isAuthorMatch(searchAuthor, r.author));
      logger.info(`[Filter] Author ("${searchAuthor}"): ${beforeAuthor} → ${authorFiltered.length}`);

      // DEBUG: Show candidates that failed author match
      const failedAuthorMatch = candidates.filter(r => !r.author || !this.isAuthorMatch(searchAuthor, r.author));
      if (failedAuthorMatch.length > 0) {
        logger.info(`[DEBUG] ${failedAuthorMatch.length} candidates failed author match:`);
        failedAuthorMatch.slice(0, 10).forEach((r, i) => {
          logger.info(`  ${i + 1}. Author: "${r.author}" | Title: ${r.title.substring(0, 60)}...`);
        });
      }

      if (authorFiltered.length === 0) {
        logger.warn(`No results match author: ${searchAuthor}`);
        return null;
      }
      candidates = authorFiltered;
    }

    // Score candidates
    const scoredCandidates = candidates.map(r => {
      let score = 0;

      // Title matching
      if (this.isTitleMatch(searchTitle, r.title)) {
        score += 60;
        // Main title exact match bonus
        const searchMain = this.normalize(searchTitle.split(/[:;—\-]/)[0]);
        const resultMain = this.normalize(r.title.split(/[:;—\-]/)[0]);
        if (searchMain === resultMain) score += 20;
      }

      return { result: r, score };
    });

    // Filter low score results (below 50 considered no match)
    let validCandidates = scoredCandidates
      .filter(c => c.score >= 50)
      .sort((a, b) => b.score - a.score);

    // If no valid candidates and OpenAI is configured, try LLM matching
    const openaiEnabled = this.config.openai?.enable !== false && this.config.openai?.apiKey;
    if (validCandidates.length === 0 && openaiEnabled) {
      logger.info(`Traditional matching failed, trying LLM for "${searchTitle}"...`);

      // Pre-filter candidates (volume match, etc.)
      const filtered = this.preFilterCandidates(searchTitle, candidates);
      logger.info(`Pre-filter: ${candidates.length} → ${filtered.length} candidates (volume filter)`);

      // Sort by size (larger files preferred), take top 10
      const topCandidates = filtered
        .sort((a, b) => b.sizeBytes - a.sizeBytes)
        .slice(0, 10);

      logger.info(`Top 10 candidates for LLM:`);
      topCandidates.forEach((c, i) => {
        logger.info(`  ${i + 1}. ${c.title.substring(0, 80)}... (${c.size})`);
      });

      if (topCandidates.length > 0) {
        const llmMatch = await this.llmBatchMatch(searchTitle, topCandidates);
        if (llmMatch) {
          logger.info(`LLM matched: "${llmMatch.title}"`);
          validCandidates = [{ result: llmMatch, score: 60 }];
        }
      }
    }

    if (validCandidates.length === 0) {
      const bestScore = Math.max(...scoredCandidates.map(c => c.score));
      logger.warn(`No valid match for "${searchTitle}". Best score: ${bestScore}`);
      return null;
    }

    const best = validCandidates[0];
    logger.info(`Selected: "${best.result.title}" (score: ${best.score})`);
    return best.result;
  }

  // Fetch book details from detail page to get year and publisher
  async fetchBookDetails(md5: string): Promise<{ year: string; publisher: string }> {
    const url = `${this.config.baseUrl}/md5/${md5}`;
    try {
      const { body } = await this.httpClient.get(url);
      const $ = cheerio.load(body);

      let year = '';
      let publisher = '';

      // Find year: look for leaf node with text "Year" and get next sibling's text
      // Note: There may be multiple Year fields on the page (e.g., original pub date, edition date)
      // We take the first one as it's typically the original publication year
      let foundYear = false;
      $('*').each((_, el) => {
        if (foundYear) return; // Stop after finding first match
        if ($(el).children().length === 0) {
          const text = $(el).text().trim();
          if (text === 'Year') {
            const next = $(el).next();
            if (next.length) {
              year = next.text().trim();
              foundYear = true;
            }
          }
        }
      });

      // Find publisher: look in the text after author link
      // The author link has class containing "line-clamp" and text is the author name
      const authorLink = $('a.line-clamp-\\[2\\][href*="search?q="]').first();
      if (authorLink.length) {
        const parent = authorLink.parent();
        const parentText = parent.text();

        // Find the line after author name that contains publisher
        const lines = parentText.split('\n');
        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i].trim();
          // Check if this is the author line (matches the link text)
          if (line === authorLink.text().trim()) {
            const nextLine = lines[i + 1] ? lines[i + 1].trim() : '';
            // Publisher line contains comma and looks like metadata
            if (nextLine && nextLine.includes(',') && nextLine.length > 10 &&
                !nextLine.includes('http') && !nextLine.includes('function')) {
              const parts = nextLine.split(',');
              const possiblePublisher = parts[0].trim();
              if (possiblePublisher.length > 3 && possiblePublisher.length < 60) {
                publisher = possiblePublisher;
                break;
              }
            }
          }
        }
      }

      return { year, publisher };
    } catch (error) {
      logger.warn(`Failed to fetch book details for ${md5}: ${(error as Error).message}`);
      return { year: '', publisher: '' };
    }
  }
}