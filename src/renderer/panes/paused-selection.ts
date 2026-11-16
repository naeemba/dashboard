// Keeps a terminal from redrawing every row each time it scrolls: always while off screen, and while
// shown whenever nothing is selected.
//
// xterm stops drawing a terminal while its IntersectionObserver sees it off screen: refreshRows only
// notes that a full redraw is due. But every scroll, which is every new line at the bottom, also asks
// the selection to redraw, and that path goes straight to the renderer without asking whether it is
// paused. The DOM renderer answers it by rebuilding every row. Four hidden panes printing a build log
// cost half the CPU of watching them that way. xterm 6.0.0 and 6.1.0-beta.336 both do this
// (CoreBrowserTerminal's onScroll listener, RenderService.handleSelectionChanged).
//
// So while paused, the selection is only stored and marked due, the way refreshRows marks the rows. The
// full redraw xterm runs when the terminal comes back draws the stored selection with it.
//
// A shown terminal pays the same rebuild on every scroll, on top of the rows the scroll itself redraws,
// though there is almost never a selection to move. When there was none before and there is none now,
// the selection is only stored: nothing on screen changes, so there is nothing to draw. The renderer
// treats a missing start or end as no selection (DomRenderer.handleSelectionChanged), and so does this.
//
// ponytail: reaches xterm's private render service. If an upgrade renames it, `pauseSelectionRedraws`
// finds nothing and changes nothing: hidden panes go back to costing CPU, nothing breaks. Drop this
// once xterm's handleSelectionChanged checks the pause and skips a redraw from no selection to none.

type Point = [number, number] | undefined;

export type RenderServiceInternals = {
  _isPaused: boolean;
  _needsFullRefresh: boolean;
  _needsSelectionRefresh: boolean;
  _selectionState: { start: Point; end: Point; columnSelectMode: boolean };
  handleSelectionChanged(start: Point, end: Point, columnSelectMode: boolean): void;
}

export function pauseSelectionRedraws(terminal: object): void {
  const service = (terminal as { _core?: { _renderService?: Partial<RenderServiceInternals> } })._core?._renderService;
  if (!service || typeof service.handleSelectionChanged !== 'function' || typeof service._isPaused !== 'boolean'
    || typeof service._needsFullRefresh !== 'boolean' || typeof service._needsSelectionRefresh !== 'boolean'
    || !service._selectionState) return;
  const render = service as RenderServiceInternals;
  const redraw = render.handleSelectionChanged.bind(render);
  render.handleSelectionChanged = (start, end, columnSelectMode) => {
    const nothingToDraw = !(start && end) && !(render._selectionState.start && render._selectionState.end);
    if (!render._isPaused && !nothingToDraw) return redraw(start, end, columnSelectMode);
    render._selectionState = { start, end, columnSelectMode };
    if (render._isPaused) {
      render._needsSelectionRefresh = true;
      render._needsFullRefresh = true;
    }
  };
}
