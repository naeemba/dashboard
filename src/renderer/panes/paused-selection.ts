// Keeps an off-screen terminal from redrawing every row each time it scrolls.
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
// ponytail: reaches xterm's private render service. If an upgrade renames it, `pauseSelectionRedraws`
// finds nothing and changes nothing: hidden panes go back to costing CPU, nothing breaks. Drop this
// once xterm checks the pause in handleSelectionChanged itself.

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
    if (!render._isPaused) return redraw(start, end, columnSelectMode);
    render._selectionState = { start, end, columnSelectMode };
    render._needsSelectionRefresh = true;
    render._needsFullRefresh = true;
  };
}
