export interface SocketableSlotEntry {
  type: string;     // PoB emits "Rune" for everything currently; we preserve it verbatim.
  mods: string[];
}

export interface SocketableEntry {
  slots: Record<string, SocketableSlotEntry>;
}

export type SocketableSchema = Record<string, SocketableEntry>;
