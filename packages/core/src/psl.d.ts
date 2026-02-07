declare module 'psl' {
  interface ParsedDomain {
    input: string;
    tld: string | null;
    sld: string | null;
    domain: string | null;
    subdomain: string | null;
    listed: boolean;
  }

  interface ParseError {
    input: string;
    error: {
      message: string;
      code: string;
    };
  }

  function parse(domain: string): ParsedDomain | ParseError;
  function get(domain: string): string | null;
  function isValid(domain: string): boolean;
}
