import * as cheerio from 'cheerio';
import { Config, BookInfo, SearchResult, BookDetailsExtended, BookFormat } from './types.js';
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

  private parseFormatInfo(text: string): { format: BookFormat; language: string; size: string; sizeBytes: number; year: string } {
    // Parse text like "Chinese [zh] · PDF · 26.8MB · 1971"
    const parts = text.split('·').map(p => p.trim());

    let format: BookFormat = 'pdf';
    let language = '';
    let size = '';
    let sizeBytes = 0;
    let year = '';

    for (const part of parts) {
      const lowerPart = part.toLowerCase();
      if (lowerPart === 'pdf' || lowerPart === 'epub' || lowerPart === 'djvu' || lowerPart === 'zip') {
        format = lowerPart as BookFormat;
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

    throw new Error('CAPTCHA_DETECTED');
  }

  private throwCaptchaError(url: string): never {
    logger.warn('CAPTCHA detected!');
    console.log('\n' + '='.repeat(60));
    console.log('CAPTCHA detected. Please visit the URL in a browser:');
    console.log(url);
    console.log('Solve the CAPTCHA, then update cookies.json with new session cookies.');
    console.log('Press Enter to continue (or type "quit" to abort)...');
    console.log('='.repeat(60) + '\n');

    throw new Error('CAPTCHA_DETECTED');
  }

  /**
   * Extract year from book details page.
   * Looks for leaf node with text "Year" and gets next sibling's text.
   */
  private extractYear($: cheerio.CheerioAPI): string {
    let year = '';
    let foundYear = false;
    $('*').each((_, el) => {
      if (foundYear) return;
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
    return year;
  }

  /**
   * Extract publisher from book details page.
   * Looks for publisher info in the text after author link.
   */
  private extractPublisher($: cheerio.CheerioAPI, author: string): string {
    const authorLink = $('a.line-clamp-\\[2\\][href*="search?q="]').first();
    if (!authorLink.length) return '';

    const parent = authorLink.parent();
    const parentText = parent.text();
    const lines = parentText.split('\n');

    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i].trim();
      if (line === author) {
        const nextLine = lines[i + 1] ? lines[i + 1].trim() : '';
        if (nextLine && nextLine.includes(',') && nextLine.length > 10 &&
            !nextLine.includes('http') && !nextLine.includes('function')) {
          const parts = nextLine.split(',');
          const possiblePublisher = parts[0].trim();
          if (possiblePublisher.length > 3 && possiblePublisher.length < 60) {
            return possiblePublisher;
          }
        }
      }
    }
    return '';
  }

  /**
   * Extract format (PDF/EPUB/DJVU/ZIP) from book details page.
   * Looks for format in specific elements rather than scanning entire page text.
   */
  private extractFormat($: cheerio.CheerioAPI): BookFormat {
    // Look for format in elements that typically contain file info
    // Try specific selectors first, then fall back to more general ones
    const formatSelectors = [
      '[class*="file-format"]',
      '[class*="format"]',
      '.text-lg.font-bold',
      'span.font-mono',
    ];

    for (const selector of formatSelectors) {
      const elements = $(selector);
      for (let i = 0; i < elements.length; i++) {
        const text = $(elements[i]).text().trim().toUpperCase();
        if (text === 'EPUB') return 'epub';
        if (text === 'PDF') return 'pdf';
        if (text === 'DJVU') return 'djvu';
        if (text === 'ZIP') return 'zip';
      }
    }

    // Fall back to looking for format text in structured metadata sections
    // Look for patterns like "PDF" or "EPUB" in smaller text sections
    let format: BookFormat = 'pdf';
    $('div, span, p').each((_, el) => {
      const text = $(el).text().trim();
      // Only check short text snippets to avoid false positives
      if (text.length < 20) {
        const upperText = text.toUpperCase();
        if (upperText === 'EPUB') {
          format = 'epub';
          return false; // break each loop
        }
        if (upperText === 'PDF') {
          format = 'pdf';
          return false; // break each loop
        }
        if (upperText === 'DJVU') {
          format = 'djvu';
          return false; // break each loop
        }
        if (upperText === 'ZIP') {
          format = 'zip';
          return false; // break each loop
        }
      }
    });

    return format;
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

        // Find format info using specific CSS selector
        const $formatDiv = $parent.find('.text-gray-800.font-semibold.text-sm');
        const formatText = $formatDiv.text() || '';
        const formatHtml = $formatDiv.html() || '';
        logger.debug(`Format div HTML for ${md5}: ${formatHtml}`);
        const formatInfo = this.parseFormatInfo(formatText);

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

    return results;
  }

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

  private stripSeriesName(title: string): string {
    const seriesPatterns = [
      /\s*\([^)]*[Ss]eries[^)]*\)/g,      // (SUNY series in Chinese Philosophy)
      /\s*\([^)]*[Ss]tudies[^)]*\)/g,     // (Cambridge Studies in...)
      /\s*\(SUNY[^)]*\)/g,                // (SUNY series...)
    ];

    let stripped = title;
    for (const pattern of seriesPatterns) {
      stripped = stripped.replace(pattern, '');
    }
    return stripped.trim();
  }

  private isLanguageMatch(bookLanguage: string, resultLanguage: string): boolean {
    if (!bookLanguage || !resultLanguage) return true;

    const langCode = bookLanguage.toLowerCase();
    const match = resultLanguage.match(/\[([a-z-]+)\]/i);
    const resultCode = match ? match[1].toLowerCase() : '';

    if (langCode === 'en') return resultCode.startsWith('en');
    if (langCode === 'zh') return resultCode.startsWith('zh');
    return resultCode.includes(langCode);
  }

  private isAuthorMatch(searchAuthor: string, resultAuthor: string): boolean {
    const normResult = this.normalize(resultAuthor);

    const searchAuthors = searchAuthor
      .split(';')
      .map(a => a.replace(/\(.*?\)/g, '').trim())
      .filter(a => a.length > 0);

    for (const author of searchAuthors) {
      const normSearch = this.normalize(author);

      if (normResult.includes(normSearch)) return true;

      const parts = author.split(/\s+/).filter(p => p.length > 1);
      if (parts.length < 2) continue;

      const reversed = parts.slice().reverse().join('');
      const normReversed = reversed.toLowerCase().replace(/\W+/g, '');
      if (normResult.includes(normReversed)) return true;

      const surname = parts[parts.length - 1].toLowerCase();
      if (surname.length > 2 && normResult.includes(surname)) return true;

      const firstName = parts[0];
      if (firstName.length <= 3 || firstName.endsWith('.')) {
        const firstInitial = firstName.charAt(0).toLowerCase();
        if (normResult.charAt(0) === firstInitial && normResult.includes(surname)) {
          return true;
        }
      }
    }

    return false;
  }

  private isTitleMatch(searchTitle: string, resultTitle: string): boolean {
    const strippedResult = this.stripSeriesName(resultTitle);

    const normSearch = this.normalize(searchTitle);
    const normResult = this.normalize(strippedResult);

    if (!normResult || !normSearch) return false;

    if (normResult.includes(normSearch) || normSearch.includes(normResult)) return true;

    const separators = /[:;—\-]/;
    const searchSegments = searchTitle.split(separators).map(s => this.normalize(s.trim()));
    const resultSegments = strippedResult.split(separators).map(s => this.normalize(s.trim()));

    if (searchSegments[0] && resultSegments[0] && searchSegments[0] === resultSegments[0]) {
      return true;
    }

    if (normSearch.length > 10) {
      const prefixLen = Math.floor(normSearch.length * 0.7);
      const searchPrefix = normSearch.substring(0, prefixLen);
      if (normResult.includes(searchPrefix)) return true;
    }

    return false;
  }

  private async llmBatchMatch(searchTitle: string, candidates: SearchResult[]): Promise<SearchResult | null> {
    const openaiEnabled = this.config.openai?.enable !== false && this.config.openai?.apiKey;
    if (!openaiEnabled || candidates.length === 0) {
      return null;
    }

    // Build candidate list with more context
    const candidateList = candidates.map((c, i) =>
      `${i + 1}. "${c.title}" by ${c.author || 'Unknown'} (${c.size})`
    ).join('\n');

    const prompt = `Determine which candidate refers to the same book as the search title.
A book may have different subtitle, series name, or edition. Focus on the main title.

Search: "${searchTitle}"

Candidates:
${candidateList}

Reply only the number of the best match, or "none" if no match.`;

    try {
      // Build API URL
      let apiUrl = this.config.openai?.baseUrl || 'https://api.openai.com/v1';
      if (!apiUrl.includes('/chat/completions')) {
        apiUrl = apiUrl.replace(/\/$/, '') + '/chat/completions';
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.openai?.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.openai?.model || 'gpt-3.5-turbo',
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

      // Parse response - expect a number or "none"
      if (content === 'none') return null;

      const matchIndex = parseInt(content) - 1;
      if (matchIndex >= 0 && matchIndex < candidates.length) {
        return candidates[matchIndex];
      }

      return null;
    } catch (error) {
      logger.warn(`LLM batch match failed: ${(error as Error).message}`);
      return null;
    }
  }

  private preFilterCandidates(searchTitle: string, candidates: SearchResult[]): SearchResult[] {
    return candidates.filter(r => {
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

    const pdfResults = results.filter(r => r.format === 'pdf' && r.title);
    const epubResults = results.filter(r => r.format === 'epub' && r.title);

    let candidates = pdfResults.length > 0 ? pdfResults : epubResults;

    // Filter by minimum size (0.3MB)
    const MIN_SIZE_BYTES = 314573; // 0.3 * 1024 * 1024
    candidates = candidates.filter(r => r.sizeBytes >= MIN_SIZE_BYTES);
    if (candidates.length === 0) {
      logger.warn(`No results meet minimum size requirement (0.3MB)`);
      return null;
    }

    // Filter by language
    if (bookLanguage) {
      const langFiltered = candidates.filter(r => this.isLanguageMatch(bookLanguage, r.language));
      if (langFiltered.length === 0) {
        logger.warn(`No results match language: ${bookLanguage}`);
        return null;
      }
      candidates = langFiltered;
    }

    if (candidates.length === 0) return null;

    // Filter by author
    if (searchAuthor) {
      const authorFiltered = candidates.filter(r => r.author && this.isAuthorMatch(searchAuthor, r.author));

      if (authorFiltered.length === 0) {
        logger.warn(`No results match author: ${searchAuthor}`);
        return null;
      }
      candidates = authorFiltered;
    }

    const scoredCandidates = candidates.map(r => {
      let score = 0;

      if (this.isTitleMatch(searchTitle, r.title)) {
        score += 60;
        const searchMain = this.normalize(searchTitle.split(/[:;—\-]/)[0]);
        const resultMain = this.normalize(r.title.split(/[:;—\-]/)[0]);
        if (searchMain === resultMain) score += 20;
      }

      return { result: r, score };
    });

    const SCORE_THRESHOLD = 40;
    let validCandidates = scoredCandidates
      .filter(c => c.score >= SCORE_THRESHOLD)
      .sort((a, b) => b.score - a.score);

    const openaiEnabled = this.config.openai?.enable !== false && this.config.openai?.apiKey;
    if (validCandidates.length === 0 && openaiEnabled) {
      logger.info(`Traditional matching failed, trying LLM for "${searchTitle}"...`);

      const filtered = this.preFilterCandidates(searchTitle, candidates);

      const topCandidates = filtered
        .sort((a, b) => b.sizeBytes - a.sizeBytes)
        .slice(0, 10);

      if (topCandidates.length > 0) {
        const llmMatch = await this.llmBatchMatch(searchTitle, topCandidates);
        if (llmMatch) {
          validCandidates = [{ result: llmMatch, score: 60 }];
        }
      }
    }

    if (validCandidates.length === 0) {
      const bestScore = Math.max(...scoredCandidates.map(c => c.score));
      logger.warn(`No valid match for "${searchTitle}". Best score: ${bestScore}`);
      return null;
    }

    return validCandidates[0].result;
  }

  async fetchBookDetails(md5: string): Promise<{ year: string; publisher: string }> {
    const url = `${this.config.baseUrl}/md5/${md5}`;
    try {
      const { status, body } = await this.httpClient.get(url);

      // Check for CAPTCHA
      if (this.httpClient.isCaptchaResponse(body, status)) {
        this.throwCaptchaError(url);
      }

      const $ = cheerio.load(body);

      // Extract author first (needed for publisher extraction)
      const authorLink = $('a.line-clamp-\\[2\\][href*="search?q="]').first();
      const author = authorLink.length ? authorLink.text().trim() : '';

      // Use helper methods for extraction
      const year = this.extractYear($);
      const publisher = this.extractPublisher($, author);

      return { year, publisher };
    } catch (error) {
      if ((error as Error).message === 'CAPTCHA_DETECTED') {
        throw error;
      }
      logger.warn(`Failed to fetch book details for ${md5}: ${(error as Error).message}`);
      return { year: '', publisher: '' };
    }
  }

  async fetchBookDetailsExtended(md5: string): Promise<BookDetailsExtended> {
    const url = `${this.config.baseUrl}/md5/${md5}`;
    try {
      const { status, body } = await this.httpClient.get(url);

      // Check for CAPTCHA
      if (this.httpClient.isCaptchaResponse(body, status)) {
        this.throwCaptchaError(url);
      }

      const $ = cheerio.load(body);

      // Extract title: usually in the first h1 or a specific element
      const titleElement = $('h1').first();
      const title = titleElement.length ? titleElement.text().trim() : '';

      // Extract author: look for link with author search
      const authorLink = $('a.line-clamp-\\[2\\][href*="search?q="]').first();
      const author = authorLink.length ? authorLink.text().trim() : '';

      // Extract format using improved specific element lookup
      const format = this.extractFormat($);

      // Use helper methods for year and publisher extraction
      const year = this.extractYear($);
      const publisher = this.extractPublisher($, author);

      // Extract language
      let language = '';
      $('*').each((_, el) => {
        if (language) return;
        if ($(el).children().length === 0) {
          const text = $(el).text().trim();
          if (text === 'Language') {
            const next = $(el).next();
            if (next.length) {
              language = next.text().trim();
            }
          }
        }
      });

      // Extract size: look for file size pattern in specific metadata sections
      let size = '';
      $('div, span').each((_, el) => {
        if (size) return;
        const text = $(el).text().trim();
        const sizeMatch = text.match(/^([\d.]+\s*(?:KB|MB|GB))$/i);
        if (sizeMatch) {
          size = sizeMatch[1];
        }
      });
      // Fallback: search in broader text if not found in specific elements
      if (!size) {
        const bodyText = $('body').text();
        const sizeMatch = bodyText.match(/([\d.]+\s*(?:KB|MB|GB))/i);
        if (sizeMatch) {
          size = sizeMatch[1];
        }
      }

      return { title, author, format, year, publisher, language, size };
    } catch (error) {
      if ((error as Error).message === 'CAPTCHA_DETECTED') {
        throw error;
      }
      logger.warn(`Failed to fetch extended book details for ${md5}: ${(error as Error).message}`);
      return { title: '', author: '', format: 'pdf', year: '', publisher: '', language: '', size: '' };
    }
  }
}