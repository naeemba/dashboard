import { cardById, type Board } from '../../../shared/board/board';
import type { ShipRequest, ShipResult } from '../../../shared/app/bridge';
import { notOpenRefusal } from '../../ship/ship';
import { action } from '../action';
import { cardInput, type CardInput } from './card-input';

export type CardShipPorts = {
  read(projectPath: string): Board;
  // The page the project is open on, or -1: an agent's pane belongs to an open project.
  slotOf(projectPath: string): number;
  // ship-flow.ts's ship: the worktree, the branch, the pane and the agent.
  ship(request: ShipRequest): Promise<ShipResult>;
};

// A card handed to an agent in a worktree of its own. card.move runs it for a card entering Ship, and
// `dashboard board ship <id>` runs it directly. Every step is shipFlow's; this finds what it needs.
export const cardShip = action<CardShipPorts, CardInput, { output: string }>('card.ship', {
  words: ['id'],
  input: cardInput,
  async run(ports, { projectPath, id }) {
    const card = cardById(ports.read(projectPath), id);
    if (card === undefined) return { refused: `no card with id ${id}` };
    const slot = ports.slotOf(projectPath);
    if (slot === -1) return { refused: notOpenRefusal(card.title) };
    const shipped = await ports.ship({ projectPath, cardId: id, title: card.title, slot });
    return shipped.ok ? { output: `"${card.title}" shipped on ${shipped.entry.branch}` } : { refused: shipped.message };
  },
});
