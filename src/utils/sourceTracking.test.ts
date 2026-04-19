/**
 * Source Tracking Utilities Tests
 *
 * Run with: npm test src/utils/sourceTracking.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  generateFingerprint,
  extractDomain,
  computeDedupHash
} from './sourceTracking';

describe('Source Tracking Utilities', () => {
  describe('generateFingerprint', () => {
    it('should generate consistent hashes for identical content', () => {
      const content = 'Test content for fingerprinting';
      const hash1 = generateFingerprint(content);
      const hash2 = generateFingerprint(content);
      expect(hash1).toBe(hash2);
    });

    it('should generate different hashes for different content', () => {
      const hash1 = generateFingerprint('Content A');
      const hash2 = generateFingerprint('Content B');
      expect(hash1).not.toBe(hash2);
    });

    it('should normalize whitespace', () => {
      const hash1 = generateFingerprint('test   content');
      const hash2 = generateFingerprint('test content');
      expect(hash1).toBe(hash2);
    });

    it('should remove tracking parameters', () => {
      const url1 = 'https://example.com/page?utm_source=test';
      const url2 = 'https://example.com/page';
      const hash1 = generateFingerprint(url1);
      const hash2 = generateFingerprint(url2);
      expect(hash1).toBe(hash2);
    });

    it('should be case-insensitive', () => {
      const hash1 = generateFingerprint('Test Content');
      const hash2 = generateFingerprint('test content');
      expect(hash1).toBe(hash2);
    });
  });

  describe('extractDomain', () => {
    it('should extract domain from valid URL', () => {
      expect(extractDomain('https://example.com/page')).toBe('example.com');
      expect(extractDomain('http://example.com/page')).toBe('example.com');
    });

    it('should remove www prefix', () => {
      expect(extractDomain('https://www.example.com/page')).toBe('example.com');
    });

    it('should handle subdomains', () => {
      expect(extractDomain('https://blog.example.com/page')).toBe('blog.example.com');
    });

    it('should return null for invalid URLs', () => {
      expect(extractDomain('not-a-url')).toBeNull();
      expect(extractDomain('')).toBeNull();
    });
  });

  describe('computeDedupHash', () => {
    it('should generate consistent hashes for same URL and title', () => {
      const hash1 = computeDedupHash('https://example.com/article', 'Test Title');
      const hash2 = computeDedupHash('https://example.com/article', 'Test Title');
      expect(hash1).toBe(hash2);
    });

    it('should handle different protocols as same', () => {
      const hash1 = computeDedupHash('https://example.com/article', 'Test');
      const hash2 = computeDedupHash('http://example.com/article', 'Test');
      expect(hash1).toBe(hash2);
    });

    it('should handle www prefix as same', () => {
      const hash1 = computeDedupHash('https://example.com/article', 'Test');
      const hash2 = computeDedupHash('https://www.example.com/article', 'Test');
      expect(hash1).toBe(hash2);
    });

    it('should strip query parameters and fragments', () => {
      const hash1 = computeDedupHash('https://example.com/article?param=1#section', 'Test');
      const hash2 = computeDedupHash('https://example.com/article', 'Test');
      expect(hash1).toBe(hash2);
    });

    it('should include dedup_ prefix', () => {
      const hash = computeDedupHash('https://example.com/article', 'Test');
      expect(hash).toMatch(/^dedup_/);
    });
  });
});
