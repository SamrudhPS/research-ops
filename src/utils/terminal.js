import chalk from 'chalk';

/** Live terminal width, with a safe fallback for non-TTY environments. */
export const tw = () => process.stdout.columns || 140;

/** A full-width dim horizontal rule using the given character. */
export const divider = (char = '─') => chalk.dim(char.repeat(Math.max(4, tw() - 4)));

/**
 * A centred bold header flanked by ═ characters.
 * Leaves a blank line above the header.
 */
export const header = (text) => {
  const inner   = `  ${text}  `;
  const total   = Math.max(inner.length, tw() - 4);
  const leftPad = Math.floor((total - inner.length) / 2);
  const right   = total - inner.length - leftPad;
  return chalk.bold('\n' + '═'.repeat(leftPad) + inner + '═'.repeat(right));
};

/**
 * Word-wraps `text` so each line fits within `tw() - indent - 4` visible
 * characters. Returns a single string with newlines; each continuation line
 * is prefixed with `indent` spaces.
 *
 * @param {string}  text
 * @param {number}  indent - leading spaces on each line (default 0)
 * @param {number?} maxWidth - override the auto-calculated width
 */
export const wrap = (text, indent = 0, maxWidth) => {
  return wrapLines(text, indent, maxWidth).join('\n');
};

/**
 * Same as `wrap` but returns an array of lines instead of a joined string.
 * Useful when you need to iterate lines (e.g. for bordered cards).
 *
 * @param {string}  text
 * @param {number}  indent - leading spaces on each line (default 0)
 * @param {number?} maxWidth - override the auto-calculated width
 */
export const wrapLines = (text, indent = 0, maxWidth) => {
  const width  = maxWidth ?? Math.max(20, tw() - indent - 4);
  const prefix = ' '.repeat(indent);
  const words  = (text ?? '').replace(/\s+/g, ' ').trim().split(' ');

  const lines = [];
  let line = '';

  for (const word of words) {
    if (!line) {
      line = word;
    } else if (line.length + 1 + word.length <= width) {
      line += ' ' + word;
    } else {
      lines.push(prefix + line);
      line = word;
    }
  }
  if (line) lines.push(prefix + line);
  return lines.length ? lines : [''];
};

/**
 * Inline section label followed by a dim rule that fills to tw().
 * Example output:  ── ABSTRACT ─────────────────────────────
 */
export const sectionLine = (label) => {
  const text = `── ${label} `;
  const fill = Math.max(0, tw() - 4 - text.length);
  return chalk.dim(text + '─'.repeat(fill));
};
