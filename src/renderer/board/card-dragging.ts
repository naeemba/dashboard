import { dropCard, selectionOf, type Board, type Card, type Change, type Selection } from '../../shared/board/board';
import { realRow } from './board-filter';
import { createDropMarker } from './drop-marker';

// What the drag reads off the board it is on, and the moves it hands back. Getters rather than values:
// the board, the rows the filter keeps and whether it is busy all change between one drag event and
// the next.
export type CardDraggingPorts = {
  busy(): boolean;
  board(): Board;
  visible(): number[][];
  // Puts the keyboard on the grabbed card, and says whether it could.
  grab(card: Card): boolean;
  // However the drag ended: the view forgets the press and redraws.
  ended(): void;
  move(from: Selection, next: Change): void;
  onNotice(text: string): void;
};

export type CardDragging = {
  card(item: HTMLElement, card: Card): void;
  column(section: HTMLElement, list: HTMLElement, columnIndex: number): void;
};

// The mouse half of the board, native drag and drop rather than a gesture spelled out of pointer
// events: Chromium draws the card under the cursor, ends the drag when you let go anywhere, and gives
// up on Escape, none of which is worth writing again. The listeners and the drop's lookup live here;
// which gap a pointer names is decided in board-drag.ts, and the move itself is board.ts's dropCard.
export function createCardDragging(ports: CardDraggingPorts): CardDragging {
  // The line that says where a dragged card would land.
  const dropMarker = createDropMarker();

  // Grabbing a card moves the selection onto it, so that when the drag is over — dropped or abandoned —
  // the highlight is on the card the pointer last had hold of rather than wherever it was before.
  //
  // It does not redraw here, and does not move the highlight by hand either. Chromium takes the picture
  // that follows the cursor after this handler returns, and render() replaces every card on the board
  // including this one, so a redraw here hands the picture a node that no longer exists and the drag
  // runs with nothing under the pointer. The redraw happens on dragend instead, which fires however the
  // drag ends; the card under the cursor is what says where you are until then.
  function beginDrag(event: DragEvent, card: Card): void {
    // Nothing to drag: refusing the gesture outright is better than a card that follows the cursor and
    // then will not be let go of anywhere.
    if (!ports.grab(card)) return event.preventDefault();
    if (!event.dataTransfer) return;
    // Chromium cancels a drag that carries nothing, and the id is what the drop looks the card up by.
    event.dataTransfer.setData('text/plain', card.id);
    // The board has one drag and it is a move. Left uninitialized, a cancelled dragover gives an
    // operation of copy, and the cursor grows the green plus that says the card stays where it is.
    event.dataTransfer.effectAllowed = 'move';
  }

  // However the drag ended. A drop has already redrawn through ports.move; this is what puts the
  // highlight on the grabbed card when you let go over nothing, or press Escape.
  function endDrag(): void {
    dropMarker.clear();
    ports.ended();
  }

  // Letting go. The same move Shift+Arrow makes, including the one into Ship that hands the card to an
  // agent: a column means the same thing however the card got there, and a drag that quietly skipped
  // the ship would be a second, silent set of rules for the mouse.
  function dropOnColumn(event: DragEvent, columnIndex: number, list: HTMLElement): void {
    event.preventDefault();
    // Before the row is read, so the line is gone whether or not this board has the card.
    dropMarker.clear();
    if (ports.busy()) return;
    // Found by id rather than taken from this board's selection: the manager stacks every open
    // project's board in one scroller, so the card let go of here may belong to another one of them.
    const id = event.dataTransfer?.getData('text/plain') ?? '';
    // Something dragged in from outside the app carries no card id, and there is nothing to say about
    // it. A dragover cannot read the id, so the column drew a line promising this drop would land —
    // the one refusal you can reach with the mouse, and the only place that knows it was refused.
    if (id === '') return;
    const board = ports.board();
    const at = selectionOf(board, id);
    if (!at) return ports.onNotice('That card belongs to another project — a card stays on the board it was made on');
    const row = realRow(ports.visible(), columnIndex, dropMarker.rowUnder(list, event.clientY), board.columns[columnIndex].cards.length);
    ports.move(at, dropCard(board, at, columnIndex, row));
  }

  function card(item: HTMLElement, card: Card): void {
    item.draggable = true;
    item.addEventListener('dragstart', (event) => beginDrag(event, card));
    item.addEventListener('dragend', endDrag);
  }

  function column(section: HTMLElement, list: HTMLElement, columnIndex: number): void {
    // On the whole column, not the cards in it: a column you can only drop onto by hitting a card is
    // a column you cannot drop into once it is empty, and the heading and the gap under the last card
    // are both places a hand aims at. preventDefault is what makes the column a place a card can be
    // let go of at all — without it the drop never fires and the card springs back.
    section.addEventListener('dragover', (event) => {
      // dropEffect, not a withheld preventDefault: renderer.ts cancels dragover at the window so a
      // file dropped on the page cannot navigate it, and one listener cancelling is enough to allow
      // the drop however this one returns. dropEffect is read after that and does turn the cursor
      // into the one that says no. Without it the card snaps back off dropOnColumn's own busy check
      // with nothing on screen having said the column would not take it.
      if (ports.busy()) {
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'none';
        // A board can go busy mid-drag — a board:change from the command line starts a read — and the
        // line drawn a moment ago would sit there saying the card lands here while the cursor says no.
        dropMarker.clear();
        return;
      }
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
      dropMarker.markSoon(list, event.clientY);
    });
    section.addEventListener('drop', (event) => dropOnColumn(event, columnIndex, list));
    // A board the pointer merely crossed never hears dragend — that fires at the card the drag
    // started from, which on the manager's stack of boards can be another project's. Without this,
    // pass over a column until the line appears and then press Escape, and the line stays hard
    // against a card nothing is being dropped into until something else redraws that board, which
    // nothing does. relatedTarget is where the pointer went: still inside this column means it only
    // moved between the cards in it.
    section.addEventListener('dragleave', (event) => {
      if (!(event.relatedTarget instanceof Node) || !section.contains(event.relatedTarget)) dropMarker.clear();
    });
  }

  return { card, column };
}
