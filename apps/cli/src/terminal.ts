const MAX_WIDTH = 80;

/**
 * Cap `process.stdout.columns` so all downstream output (clack, etc.)
 * stays within a readable width regardless of terminal size.
 *
 * Snapshots the real width before overriding, and updates on resize.
 */
export function capTerminalWidth(): void {
  const tty = process.stdout;
  if (!tty.isTTY) return;

  let realCols = tty.columns || 80;

  tty.on('resize', () => {
    realCols = tty.getWindowSize()[0];
  });

  Object.defineProperty(tty, 'columns', {
    get: () => Math.min(realCols, MAX_WIDTH),
    configurable: true,
  });
}
