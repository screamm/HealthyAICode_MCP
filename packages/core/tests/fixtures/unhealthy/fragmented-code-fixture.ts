/**
 * FragmentedCode fixture (Sprint 56): over-fragmentation guard.
 *
 * Ten trivial methods (`_step01`.._step10`), each CC=1 (no branches), under 4 logical lines,
 * each called from exactly one place inside the single orchestrator `run()`. This is the
 * micro-method-sprawl failure mode the loop must not be driven toward.
 */
export class Pipeline {
  run(x: number): number {
    let v = x;
    v = this._step01(v);
    v = this._step02(v);
    v = this._step03(v);
    v = this._step04(v);
    v = this._step05(v);
    v = this._step06(v);
    v = this._step07(v);
    v = this._step08(v);
    v = this._step09(v);
    v = this._step10(v);
    return v;
  }

  private _step01(v: number): number {
    return v + 1;
  }
  private _step02(v: number): number {
    return v + 2;
  }
  private _step03(v: number): number {
    return v + 3;
  }
  private _step04(v: number): number {
    return v + 4;
  }
  private _step05(v: number): number {
    return v + 5;
  }
  private _step06(v: number): number {
    return v + 6;
  }
  private _step07(v: number): number {
    return v + 7;
  }
  private _step08(v: number): number {
    return v + 8;
  }
  private _step09(v: number): number {
    return v + 9;
  }
  private _step10(v: number): number {
    return v + 10;
  }
}
