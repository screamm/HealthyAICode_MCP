/**
 * SplitResidue fixture (Sprint 56): an "extract-to-evade" refactor.
 *
 * Four private helper methods (`_helperA`.._helperD`), each with cyclomatic complexity 3
 * (two branch points per helper), each called from exactly one place inside `processAll()`.
 * This is the residue of mechanically splitting one complex method into below-threshold
 * helpers — the complexity was relocated, not eliminated.
 */
export class OrderProcessor {
  processAll(orders: number[], flags: boolean[]): number {
    let total = 0;
    total += this._helperA(orders[0], flags[0]);
    total += this._helperB(orders[1], flags[1]);
    total += this._helperC(orders[2], flags[2]);
    total += this._helperD(orders[3], flags[3]);
    return total;
  }

  // CC = 3: base 1 + two conditionals.
  private _helperA(value: number, flag: boolean): number {
    if (flag) {
      value += 1;
    }
    if (value > 10) {
      value *= 2;
    }
    return value;
  }

  // CC = 3.
  private _helperB(value: number, flag: boolean): number {
    if (flag) {
      value -= 1;
    }
    if (value < 0) {
      value = 0;
    }
    return value;
  }

  // CC = 3.
  private _helperC(value: number, flag: boolean): number {
    if (flag) {
      value += 5;
    }
    if (value % 2 === 0) {
      value += 1;
    }
    return value;
  }

  // CC = 3.
  private _helperD(value: number, flag: boolean): number {
    if (flag) {
      value *= 3;
    }
    if (value > 100) {
      value = 100;
    }
    return value;
  }
}
