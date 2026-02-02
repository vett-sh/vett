import { describe, expect, it } from 'vitest';
import { parseAddInput } from './add';

describe('parseAddInput', () => {
  it('parses owner/repo/skill as a ref', () => {
    expect(parseAddInput('vercel-labs/agent-skills/composition-patterns')).toEqual({
      kind: 'ref',
      owner: 'vercel-labs',
      repo: 'agent-skills',
      name: 'composition-patterns',
      version: undefined,
    });
  });

  it('parses owner/repo/skill@version as a ref with version', () => {
    expect(parseAddInput('vercel-labs/agent-skills/composition-patterns@1.2.3')).toEqual({
      kind: 'ref',
      owner: 'vercel-labs',
      repo: 'agent-skills',
      name: 'composition-patterns',
      version: '1.2.3',
    });
  });

  it('treats github URLs as URLs', () => {
    expect(
      parseAddInput(
        'https://github.com/vercel-labs/agent-skills/tree/main/skills/composition-patterns'
      )
    ).toEqual({
      kind: 'url',
      url: 'https://github.com/vercel-labs/agent-skills/tree/main/skills/composition-patterns',
    });
  });

  it('treats domain-prefixed refs as URLs', () => {
    expect(parseAddInput('github.com/vercel-labs/agent-skills/composition-patterns')).toEqual({
      kind: 'url',
      url: 'github.com/vercel-labs/agent-skills/composition-patterns',
    });
  });
});
