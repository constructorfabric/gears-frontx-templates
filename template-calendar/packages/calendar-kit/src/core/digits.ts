/** Digit normalisation shared by the date and time input parsers. */

const DECIMAL_DIGIT_PATTERN = /\p{Nd}/u;

const DECIMAL_DIGIT_GLOBAL_PATTERN = /\p{Nd}/gu;

const isDecimalDigit = (code: number): boolean =>
  code >= 0 && DECIMAL_DIGIT_PATTERN.test(String.fromCodePoint(code));

// Unicode encodes every decimal digit set as a run of ten starting at zero, but some
// runs sit back to back (the five mathematical digit styles), so the digit value is
// its distance from the start of the whole run, modulo ten.
export const toAsciiDigits = (text: string): string =>
  text.replaceAll(DECIMAL_DIGIT_GLOBAL_PATTERN, (digit) => {
    const code = digit.codePointAt(0) ?? 0;
    let runStart = code;

    while (isDecimalDigit(runStart - 1)) {
      runStart -= 1;
    }

    return String((code - runStart) % 10);
  });
