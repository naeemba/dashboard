// What a pointerdown on the handwriting page means, over the event's plain fields so the rule can be
// tested without a canvas.

export type InkTool = 'pen' | 'eraser';

export type PointerFields = { button: number; buttons: number; pointerType: string; pressure: number };

// A pen reports a pressure; a mouse and a finger report nothing useful, and one half is what
// pressureFactor turns into exactly the chosen width.
export const FLAT_PRESSURE = 0.5;

// The pen's own eraser end erases whichever tool is picked. Pens report it either as button 5 or only
// as buttons bit 32, so both are asked. Any other button but the main one draws nothing.
export function pointerAction(event: PointerFields, tool: InkTool): 'draw' | 'erase' | 'ignore' {
  const penEraser = event.button === 5 || (event.buttons & 32) !== 0;
  if (penEraser) return 'erase';
  if (event.button !== 0) return 'ignore';
  return tool === 'eraser' ? 'erase' : 'draw';
}

export function pointerPressure(event: PointerFields): number {
  return event.pointerType === 'pen' ? event.pressure : FLAT_PRESSURE;
}
