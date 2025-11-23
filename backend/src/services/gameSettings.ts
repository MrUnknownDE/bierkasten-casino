// backend/src/services/gameSettings.ts
// Wir speichern die Einstellung im Speicher des Servers.
// Für eine echte Produktionsumgebung würde man dies in der Datenbank speichern.
let winChanceModifier = 1.0; // 1.0 = Normal, <1.0 = schlechter, >1.0 = besser

export function getWinChance(): number {
  return winChanceModifier;
}

export function setWinChance(modifier: number): void {
  console.log(`[GameSettings] Win chance modifier changed from ${winChanceModifier} to ${modifier}`);
  winChanceModifier = modifier;
}