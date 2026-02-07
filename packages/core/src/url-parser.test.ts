import { describe, expect, it } from 'vitest';
import { parseSkillUrl, isValidSkillId, getRegistrableDomain } from './url-parser';

describe('getRegistrableDomain', () => {
  it('returns root domain for subdomains', () => {
    expect(getRegistrableDomain('docs.cdp.coinbase.com')).toBe('coinbase.com');
    expect(getRegistrableDomain('docs.x.com')).toBe('x.com');
  });

  it('returns root domain as-is', () => {
    expect(getRegistrableDomain('mintlify.com')).toBe('mintlify.com');
    expect(getRegistrableDomain('moltbook.com')).toBe('moltbook.com');
  });

  it('handles public suffixes (github.io, vercel.app)', () => {
    expect(getRegistrableDomain('anthropics.github.io')).toBe('anthropics.github.io');
    expect(getRegistrableDomain('my-app.vercel.app')).toBe('my-app.vercel.app');
    expect(getRegistrableDomain('my-site.pages.dev')).toBe('my-site.pages.dev');
  });
});

describe('parseSkillUrl', () => {
  describe('GitHub URLs', () => {
    it('parses owner/repo/tree/ref/skills/name format', () => {
      const result = parseSkillUrl(
        'https://github.com/vercel-labs/agent-skills/tree/main/skills/react'
      );
      expect(result.host).toBe('github.com');
      expect(result.owner).toBe('vercel-labs');
      expect(result.repo).toBe('agent-skills');
      expect(result.skill).toBe('react');
      expect(result.ref).toBe('main');
      expect(result.id).toBe('github.com/vercel-labs/agent-skills/react');
    });

    it('parses owner/repo format', () => {
      const result = parseSkillUrl('https://github.com/anthropics/skills');
      expect(result.host).toBe('github.com');
      expect(result.owner).toBe('anthropics');
      expect(result.repo).toBe('skills');
      expect(result.skill).toBeUndefined();
      expect(result.id).toBe('github.com/anthropics/skills');
    });

    it('strips .git suffix from repo', () => {
      const result = parseSkillUrl('git@github.com:anthropics/skills.git');
      expect(result.repo).toBe('skills');
    });

    it('infers github.com for shorthand owner/repo', () => {
      const result = parseSkillUrl('vercel/next.js');
      expect(result.host).toBe('github.com');
      expect(result.owner).toBe('vercel');
      expect(result.repo).toBe('next.js');
    });

    it('parses deeply nested monorepo skill', () => {
      const result = parseSkillUrl(
        'https://github.com/microsoft/skills/blob/main/skills/python/m365/m365-agents'
      );
      expect(result.owner).toBe('microsoft');
      expect(result.repo).toBe('skills');
      expect(result.skill).toBe('python/m365/m365-agents');
      expect(result.ref).toBe('main');
    });
  });

  describe('ClawHub URLs', () => {
    it('parses site URL with owner=clawhub.ai, repo=publisher', () => {
      const result = parseSkillUrl('https://clawhub.ai/Callmedas69/credential-manager');
      expect(result.host).toBe('clawhub.ai');
      expect(result.owner).toBe('clawhub.ai');
      expect(result.repo).toBe('callmedas69');
      expect(result.skill).toBe('credential-manager');
      expect(result.id).toBe('clawhub.ai/callmedas69/credential-manager');
    });

    it('parses download URL with slug query param', () => {
      const result = parseSkillUrl(
        'https://clawhub.ai/api/v1/download?slug=desktop-control&tag=1.0.0'
      );
      expect(result.owner).toBe('clawhub.ai');
      expect(result.repo).toBe('clawhub');
      expect(result.skill).toBe('desktop-control');
      expect(result.ref).toBe('1.0.0');
    });
  });

  describe('Domain-hosted URLs', () => {
    it('parses root skill.md with owner=registrable domain', () => {
      const result = parseSkillUrl('https://www.moltbook.com/skill.md');
      expect(result.host).toBe('moltbook.com');
      expect(result.owner).toBe('moltbook.com');
      expect(result.repo).toBeUndefined();
      expect(result.skill).toBe('moltbook');
    });

    it('parses docs/skill.md with repo=docs', () => {
      const result = parseSkillUrl('https://www.mintlify.com/docs/skill.md');
      expect(result.host).toBe('mintlify.com');
      expect(result.owner).toBe('mintlify.com');
      expect(result.repo).toBe('docs');
      expect(result.skill).toBe('docs');
    });

    it('strips subdomains to registrable domain for owner', () => {
      const result = parseSkillUrl('https://docs.x.com/skill.md');
      expect(result.host).toBe('docs.x.com');
      expect(result.owner).toBe('x.com');
      expect(result.repo).toBeUndefined();
      expect(result.skill).toBe('x');
    });

    it('strips deep subdomains to registrable domain', () => {
      const result = parseSkillUrl(
        'https://docs.cdp.coinbase.com/.well-known/skills/default/skill.md'
      );
      expect(result.host).toBe('docs.cdp.coinbase.com');
      expect(result.owner).toBe('coinbase.com');
      expect(result.repo).toBe('default');
      expect(result.skill).toBe('default');
    });

    it('strips .well-known/skills prefix from path', () => {
      const result = parseSkillUrl('https://example.com/.well-known/skills/my-tool/skill.md');
      expect(result.owner).toBe('example.com');
      expect(result.repo).toBe('my-tool');
      expect(result.skill).toBe('my-tool');
    });

    it('handles .well-known/skills with nested path', () => {
      const result = parseSkillUrl(
        'https://example.com/.well-known/skills/tools/debugger/skill.md'
      );
      expect(result.owner).toBe('example.com');
      expect(result.repo).toBe('tools');
      expect(result.skill).toBe('debugger');
    });

    it('handles named .md file', () => {
      const result = parseSkillUrl('https://example.com/docs/frontend.md');
      expect(result.owner).toBe('example.com');
      expect(result.repo).toBe('docs');
      expect(result.skill).toBe('frontend');
    });

    it('handles bare domain', () => {
      const result = parseSkillUrl('https://example.com/');
      expect(result.owner).toBe('example.com');
      expect(result.repo).toBeUndefined();
      expect(result.skill).toBe('example');
    });

    it('preserves full subdomain in host field', () => {
      const result = parseSkillUrl('https://anthropics.github.io/my-tool/skill.md');
      expect(result.host).toBe('anthropics.github.io');
      expect(result.owner).toBe('anthropics.github.io');
      expect(result.repo).toBe('my-tool');
      expect(result.skill).toBe('my-tool');
    });
  });
});

describe('isValidSkillId', () => {
  it('accepts valid IDs', () => {
    expect(isValidSkillId('github.com/owner/repo')).toBe(true);
    expect(isValidSkillId('github.com/owner/repo/skill')).toBe(true);
    expect(isValidSkillId('example.com/docs/frontend')).toBe(true);
    expect(isValidSkillId('clawhub.ai/publisher/skill')).toBe(true);
  });

  it('rejects IDs without domain', () => {
    expect(isValidSkillId('owner/repo')).toBe(false);
  });

  it('rejects IDs with empty parts', () => {
    expect(isValidSkillId('github.com//repo')).toBe(false);
    expect(isValidSkillId('github.com/owner/')).toBe(false);
  });
});
