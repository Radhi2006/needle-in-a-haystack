import { Game } from './core/Game';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const game = new Game(canvas);
void game.start();

// akses dari konsol saat debugging
(window as unknown as { game: Game }).game = game;
