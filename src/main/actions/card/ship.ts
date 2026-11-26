import { cardById, type Board } from '../../../shared/board/board';
import type { Refused } from '../../../shared/app/bridge';
import { notOpenRefusal } from '../../ship/ship';
import { action, isRefused } from '../action';
import { cardInput, type CardInput } from './card-input';

export type CardShipInput = CardInput & { first: boolean; after: string | null };

export type CardShipPorts = {
  read(projectPath: string): Board;
  // The page the project is open on, or -1: an agent's pane belongs to an open project.
  slotOf(projectPath: string): number;
  // pane.start: the ship now when a worker slot is free (ship-flow.ts's: the worktree, the branch, the
  // pane and the agent), or queued until one frees.
  ship(input: CardShipInput & { title: string }): Promise<{ output: string } | Refused>;
};

// A card handed to an agent in a worktree of its own. card.move runs it for a card entering Ship, and
// `dashboard board ship <id> [--first] [--after <card id>]` runs it directly: --first puts it at the
// head of the pane pool's queue, --after holds it there until that card is Done or Cancelled.
export const cardShip = action<CardShipPorts, CardShipInput, { output: string }>('card.ship', {
  words: ['id'],
  flags: { first: 'switch', after: 'value' },
  input(raw) {
    const card = cardInput(raw);
    if (isRefused(card)) return card;
    const { first = false, after = null } = raw;
    if (typeof first !== 'boolean' || (after !== null && (typeof after !== 'string' || after.trim() === ''))) {
      return { refused: 'ship takes --first, and --after with a card id' };
    }
    return { ...card, first, after };
  },
  async run(ports, input) {
    const card = cardById(ports.read(input.projectPath), input.id);
    if (card === undefined) return { refused: `no card with id ${input.id}` };
    if (ports.slotOf(input.projectPath) === -1) return { refused: notOpenRefusal(card.title) };
    return ports.ship({ ...input, title: card.title });
  },
});
