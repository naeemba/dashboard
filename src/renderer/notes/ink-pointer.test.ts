import { describe, expect, it } from 'vitest';
import { FLAT_PRESSURE, pointerAction, pointerPressure } from './ink-pointer';

const mouse = { button: 0, buttons: 1, pointerType: 'mouse', pressure: 0.5 };

describe('pointerAction', () => {
  it('draws with the main button and the pen picked', () => {
    expect(pointerAction(mouse, 'pen')).toBe('draw');
  });

  it('erases with the main button and the eraser picked', () => {
    expect(pointerAction(mouse, 'eraser')).toBe('erase');
  });

  it('erases with the pen eraser end whichever tool is picked, by button or by buttons bit alone', () => {
    expect(pointerAction({ ...mouse, pointerType: 'pen', button: 5, buttons: 32 }, 'pen')).toBe('erase');
    expect(pointerAction({ ...mouse, pointerType: 'pen', button: 0, buttons: 32 }, 'pen')).toBe('erase');
  });

  it('ignores any other button', () => {
    expect(pointerAction({ ...mouse, button: 2, buttons: 2 }, 'pen')).toBe('ignore');
  });
});

describe('pointerPressure', () => {
  it('takes a pen pressure and a flat one for anything else', () => {
    expect(pointerPressure({ ...mouse, pointerType: 'pen', pressure: 0.9 })).toBe(0.9);
    expect(pointerPressure({ ...mouse, pressure: 0 })).toBe(FLAT_PRESSURE);
  });
});
