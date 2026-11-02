import { describe, expect, it, vi } from 'vitest';
import { pauseSelectionRedraws, type RenderServiceInternals } from './paused-selection';

function fakeTerminal() {
  const drawn = vi.fn();
  const service: RenderServiceInternals = {
    _isPaused: false,
    _needsFullRefresh: false,
    _needsSelectionRefresh: false,
    _selectionState: { start: undefined, end: undefined, columnSelectMode: false },
    handleSelectionChanged: drawn,
  };
  return { terminal: { _core: { _renderService: service } }, service, drawn };
}

describe('pauseSelectionRedraws', () => {
  it('draws the selection at once while the terminal is on screen', () => {
    const { terminal, service, drawn } = fakeTerminal();
    pauseSelectionRedraws(terminal);
    service.handleSelectionChanged([0, 1], [4, 1], false);
    expect(drawn).toHaveBeenCalledWith([0, 1], [4, 1], false);
    expect(service._needsFullRefresh).toBe(false);
  });

  it('only stores the selection and marks a full redraw due while paused', () => {
    const { terminal, service, drawn } = fakeTerminal();
    pauseSelectionRedraws(terminal);
    service._isPaused = true;
    service.handleSelectionChanged([2, 3], [5, 3], true);
    expect(drawn).not.toHaveBeenCalled();
    expect(service._selectionState).toEqual({ start: [2, 3], end: [5, 3], columnSelectMode: true });
    expect(service._needsSelectionRefresh).toBe(true);
    expect(service._needsFullRefresh).toBe(true);
  });

  it('changes nothing on a terminal whose internals are not the ones it knows', () => {
    expect(() => pauseSelectionRedraws({})).not.toThrow();
    const original = () => {};
    const service = { handleSelectionChanged: original };
    pauseSelectionRedraws({ _core: { _renderService: service } });
    expect(service.handleSelectionChanged).toBe(original);
  });

  it.each([
    '_isPaused', '_needsFullRefresh', '_needsSelectionRefresh', '_selectionState', 'handleSelectionChanged',
  ] as const)('changes nothing when the render service lacks %s', (field) => {
    const { terminal, service } = fakeTerminal();
    delete (service as Partial<RenderServiceInternals>)[field];
    const original = service.handleSelectionChanged;
    pauseSelectionRedraws(terminal);
    expect(service.handleSelectionChanged).toBe(original);
  });
});
