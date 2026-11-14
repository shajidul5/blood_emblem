const GLYPHS = {
  0: ['111', '101', '101', '101', '111'],
  1: ['010', '110', '010', '010', '111'],
  2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '111', '001', '111'],
  4: ['101', '101', '111', '001', '001'],
  5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'],
  7: ['111', '001', '010', '010', '010'],
  8: ['111', '101', '111', '101', '111'],
  9: ['111', '101', '111', '001', '111'],
  '/': ['001', '001', '010', '100', '100'],
};

export function drawHpDigits(ctx, text, right, top) {
  const left = right - (text.length * 8 - 2);
  for (const [index, character] of [...text].entries()) {
    const glyph = GLYPHS[character];
    if (!glyph) throw new Error(`Unsupported HP digit: ${character}`);
    for (let row = 0; row < 5; row++) {
      for (let column = 0; column < 3; column++) {
        if (glyph[row][column] !== '1') continue;
        const x = left + index * 8 + column * 2;
        const y = top + row * 2;
        ctx.fillStyle = '#080c17';
        ctx.fillRect(x + 1, y + 1, 2, 2);
        ctx.fillStyle = '#fff9d6';
        ctx.fillRect(x, y, 2, 2);
      }
    }
  }
}
