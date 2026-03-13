import * as cheerio from 'cheerio';
import { Config, BookInfo, SearchResult } from './types.js';
import { HttpClient } from './http-client.js';
import { logger } from './logger.js';

// Punctuation to ignore in title matching
const PUNCTUATION_REGEX = /[:\-—,.!?'"]/g;

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
    const url = `${this.config.baseUrl}/search?index=&page=1&sort=&ext=pdf&ext=epub&display=&q=${encodedTitle}`;

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
        });
      } catch (error) {
        logger.warn(`Failed to parse search result: ${(error as Error).message}`);
      }
    });

    logger.info(`Found ${results.length} results for "${searchTitle}"`);
    return results;
  }

  selectBestResult(results: SearchResult[], searchTitle: string): SearchResult | null {
    if (results.length === 0) return null;

    // Filter by format priority: PDF > EPUB
    const pdfResults = results.filter(r => r.format === 'pdf');
    const epubResults = results.filter(r => r.format === 'epub');

    const candidates = pdfResults.length > 0 ? pdfResults : epubResults;

    if (candidates.length === 0) return null;

    // Try exact title match (case-insensitive, ignoring punctuation)
    const normalizedSearch = searchTitle.toLowerCase().replace(PUNCTUATION_REGEX, '');

    const exactMatches = candidates.filter(r => {
      const normalizedResult = r.title.toLowerCase().replace(PUNCTUATION_REGEX, '');
      return normalizedResult === normalizedSearch;
    });

    if (exactMatches.length > 0) {
      // If multiple exact matches, prefer larger file
      exactMatches.sort((a, b) => b.sizeBytes - a.sizeBytes);
      return exactMatches[0];
    }

    // No exact match, use first result (relevance sort)
    return candidates[0];
  }
}