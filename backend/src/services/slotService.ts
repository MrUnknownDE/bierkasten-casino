// path: backend/src/services/slotService.ts
import { randomInt } from "crypto";

// backend/src/services/slotService.ts
export type SymbolId =
  | "TEN" | "J" | "Q" | "K" | "A"
  | "MUG" | "BARREL" | "BARON"
  | "BOOK";

interface SymbolDefinition {
  id: SymbolId;
  weight: number;
}

const SYMBOLS: SymbolDefinition[] = [
  { id: "TEN",    weight: 40 },
  { id: "J",      weight: 40 },
  { id: "Q",      weight: 35 },
  { id: "K",      weight: 30 },
  { id: "A",      weight: 30 },
  { id: "MUG",    weight: 15 },
  { id: "BARREL", weight: 10 },
  { id: "BARON",  weight: 5 },
  { id: "BOOK",   weight: 5 }
];

const PAYTABLE: Record<Exclude<SymbolId, "BOOK">, { [count: number]: number }> = {
  TEN:    { 3: 5, 4: 10, 5: 20 },
  J:      { 3: 5, 4: 10, 5: 20 },
  Q:      { 3: 5, 4: 10, 5: 20 },
  K:      { 3: 10, 4: 20, 5: 40 },
  A:      { 3: 10, 4: 20, 5: 40 },
  MUG:    { 3: 20, 4: 40, 5: 80 },
  BARREL: { 3: 30, 4: 60, 5: 120 },
  BARON:  { 3: 50, 4: 100, 5: 200 }
};

// Scatter-Bonus: 3+ BOOK irgendwo auf dem Board
const BOOK_SCATTER: { [count: number]: number } = {
  3: 2,
  4: 5,
  5: 20
};

// Wie viele Freispiele gibt es bei x Büchern im Hauptspiel?
// 3 Bücher  -> 10 Freispiele
// 4 Bücher  -> 12 Freispiele
// 5+ Bücher -> 15 Freispiele
export function getFreeSpinsForBooks(bookCount: number): number {
  if (bookCount >= 5) return 15;
  if (bookCount === 4) return 12;
  if (bookCount === 3) return 10;
  return 0;
}

export interface LineWin {
  lineIndex: number;
  symbol: SymbolId;
  count: number;
  win: number;
}

export interface SpinResult {
  grid: SymbolId[][];
  totalWin: number;
  lineWins: LineWin[];
  bookCount: number;
}

function randomSymbol(): SymbolId {
  const totalWeight = SYMBOLS.reduce((s, sym) => s + sym.weight, 0);
  let r = Math.random() * totalWeight;
  for (const sym of SYMBOLS) {
    r -= sym.weight;
    if (r <= 0) return sym.id;
  }
  return SYMBOLS[0].id;
}

// 5 Walzen x 3 Reihen
function generateGrid(): SymbolId[][] {
  const reels = 5;
  const rows = 3;
  const grid: SymbolId[][] = [];
  for (let r = 0; r < reels; r++) {
    const col: SymbolId[] = [];
    for (let row = 0; row < rows; row++) {
      col.push(randomSymbol());
    }
    grid.push(col);
  }
  return grid;
}

// 10 einfache Gewinnlinien (je 5 Koordinaten [reel,row])
const PAYLINES: [number, number][][] = [
  // 0: gerade Mitte
  [[0,1],[1,1],[2,1],[3,1],[4,1]],
  // 1: gerade oben
  [[0,0],[1,0],[2,0],[3,0],[4,0]],
  // 2: gerade unten
  [[0,2],[1,2],[2,2],[3,2],[4,2]],
  // 3: V oben -> unten -> oben
  [[0,0],[1,1],[2,2],[3,1],[4,0]],
  // 4: V unten -> oben -> unten
  [[0,2],[1,1],[2,0],[3,1],[4,2]],
  // 5: Diagonale oben links -> unten rechts
  [[0,0],[1,1],[2,2],[3,2],[4,2]],
  // 6: Diagonale unten links -> oben rechts
  [[0,2],[1,1],[2,0],[3,0],[4,0]],
  // 7: Z-Mitte
  [[0,1],[1,0],[2,1],[3,2],[4,1]],
  // 8: Z gespiegelt
  [[0,1],[1,2],[2,1],[3,0],[4,1]],
  // 9: W-förmig
  [[0,0],[1,1],[2,0],[3,1],[4,0]]
];

function countBooks(grid: SymbolId[][]): number {
  let count = 0;
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      if (grid[r][c] === "BOOK") count++;
    }
  }
  return count;
}

function evaluateLines(grid: SymbolId[][], bet: number): LineWin[] {
  const lineWins: LineWin[] = [];

  PAYLINES.forEach((line, lineIndex) => {
    const [startReel, startRow] = line[0];
    const firstSymbol = grid[startReel][startRow];

    if (firstSymbol === "BOOK") {
      return; // keine Liniengewinne für Scatter
    }

    let count = 1;
    for (let i = 1; i < line.length; i++) {
      const [reel, row] = line[i];
      if (grid[reel][row] === firstSymbol) {
        count++;
      } else {
        break;
      }
    }

    if (count >= 3 && firstSymbol in PAYTABLE) {
      const payConfig = PAYTABLE[firstSymbol as Exclude<SymbolId, "BOOK">];
      const multiplier = payConfig[count];
      if (multiplier && multiplier > 0) {
        const win = bet * multiplier;
        lineWins.push({
          lineIndex,
          symbol: firstSymbol,
          count,
          win
        });
      }
    }
  });

  return lineWins;
}

export function spinBookOfBier(bet: number): SpinResult {
  const grid = generateGrid();
  const lineWins = evaluateLines(grid, bet);
  const lineWinTotal = lineWins.reduce((s, lw) => s + lw.win, 0);

  const books = countBooks(grid);
  let scatterWin = 0;

  if (books >= 3) {
    const key = books > 5 ? 5 : books;
    const mult = BOOK_SCATTER[key] || BOOK_SCATTER[3];
    scatterWin = bet * mult;
  }

  const totalWin = lineWinTotal + scatterWin;

  return {
    grid,
    totalWin,
    lineWins,
    bookCount: books
  };
}