// Fixture: a GodClass living in a models/ (domain entity) path.
// Under SATT role-aware scoring (Sprint 56), a GodClass in an entity is a serious design
// flaw and should receive an increased (1.20×) weight — yielding a LOWER score than the
// structurally identical controller-god-class.ts in controllers/.
// >20 public methods → triggers the GodClass biomarker.

export class UserModel {
  index() { return 'list'; }
  show() { return 'one'; }
  create() { return 'created'; }
  update() { return 'updated'; }
  destroy() { return 'deleted'; }
  search() { return 'results'; }
  filter() { return 'filtered'; }
  sort() { return 'sorted'; }
  paginate() { return 'page'; }
  export() { return 'csv'; }
  importData() { return 'imported'; }
  validate() { return true; }
  authorize() { return true; }
  authenticate() { return true; }
  refresh() { return 'token'; }
  logout() { return 'bye'; }
  profile() { return 'profile'; }
  settings() { return 'settings'; }
  notifications() { return 'notifs'; }
  preferences() { return 'prefs'; }
  archive() { return 'archived'; }
  restore() { return 'restored'; }
}
