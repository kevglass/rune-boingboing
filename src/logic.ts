import type { OnChangeAction, OnChangeEvent, PlayerId, Players, RuneClient } from "rune-games-sdk/multiplayer"

const rowHeight = 0.05;
export const platformWidth = 1 / 6;
const defaultJumpPower = 0.03;
const gravity = -0.0015;
const playerHalfWidth = 0.03;
const moveSpeed = 0.02;
export const roundTime = 1000 * 60 * 2;

export enum GameEventType {
  DIE = "die",
  WIN = "win",
  BOUNCE = "bounce",
}

export interface GameEvent {
  type: GameEventType;
  playerId?: string;
}

export interface Controls {
  left: boolean;
  right: boolean;
}


export interface Jumper {
  id: string;
  x: number; // as a factor of screen width
  y: number; // as a factor of screen height
  highest: number;
  type: number;
  vy: number;
  left: boolean;
  right: boolean;
  dead: boolean;
}

export interface Platform {
  x: number; // as a factor of screen width
  y: number; // as a factor of screen height
  width: number;
}

export interface GameState {
  jumpers: Jumper[],
  platforms: Platform[],
  startAt: number,
  jumping: boolean,
  gameRestartTime: number,
  theme: number,
  events: GameEvent[]
}

// Quick type so I can pass the complex object that is the 
// Rune onChange blob around without ugliness. 
export type GameUpdate = {
  game: GameState;
  action?: OnChangeAction<GameActions>;
  event?: OnChangeEvent;
  yourPlayerId: PlayerId | undefined;
  players: Players;
  rollbacks: OnChangeAction<GameActions>[];
  previousGame: GameState;
  futureGame?: GameState;
};

type GameActions = {
  join: (params: { type: number }) => void
  controls: (params: { controls: Controls }) => void;
}

declare global {
  const Rune: RuneClient<GameState, GameActions>
}

function generateRow(state: GameState, i: number) {
  const x = Math.random() * (1 - platformWidth);
  state.platforms[i] = {
    x, y: i * rowHeight, width: platformWidth
  }
}

export function gameOver(state: GameState | undefined): boolean {
  if (!state) {
    return false;
  }
  if (state.startAt === -1) {
    return false;
  }

  return !state.jumpers.find(j => !j.dead) || (Rune.gameTime() - state?.startAt > roundTime);
}

function startGame(state: GameState): void {
  state.jumpers = [];
  state.platforms = [];

  state.theme = Math.floor(Math.random() * 5);
  state.platforms[0] = {
    x: -platformWidth,
    y: rowHeight,
    width: 2
  }
  for (let i = 5; i < 1000; i++) {
    generateRow(state, i);
  }

  state.startAt = -1;
  state.jumping = false;
  state.gameRestartTime = -1;
}

Rune.initLogic({
  minPlayers: 1,
  maxPlayers: 4,
  setup: (): GameState => {
    const initialState: GameState = {
      jumpers: [],
      platforms: [],
      startAt: -1,
      jumping: false,
      gameRestartTime: -1,
      theme: 0,
      events: []
    };

    startGame(initialState);

    return initialState;
  },
  events: {
    playerJoined: () => {
      // do nothing
    },
    playerLeft: () => {
      // do nothing
    }
  },
  updatesPerSecond: 30,
  update: (context) => {
    const game = context.game;
    game.events = [];

    if (game.jumping) {
      if (game.gameRestartTime === -1 && gameOver(game)) {
        game.gameRestartTime = Rune.gameTime() + 3000;
        game.events.push({ type: GameEventType.WIN });
      }
    }
    if (game.gameRestartTime !== -1 && Rune.gameTime() > game.gameRestartTime) {
      startGame(game);
      return;
    }
    if (!game.jumping) {
      // has everyone joined?
      if (game.jumpers.length === context.allPlayerIds.length) {
        if (game.startAt === -1) {
          game.startAt = Rune.gameTime() + (1000 * 3);
        }
      }

      if (game.startAt > 0 && Rune.gameTime() > game.startAt) {
        // start the game
        game.jumping = true;
        
        // everyone bounces at the start
        for (const playerId of context.allPlayerIds) {
          game.events.push({ type: GameEventType.BOUNCE, playerId });
        }
      }
    } else {
      for (const jumper of game.jumpers) {
        if (jumper.dead) {
          continue;
        }

        jumper.vy += gravity;
        const steps = 10;
        for (let i = 0; i < steps; i++) {
          jumper.y += jumper.vy / steps;

          // if we're falling down, then look for a platform
          // to land on
          if (jumper.vy < 0) {
            const index = Math.floor(jumper.y / rowHeight);
            const platform = game.platforms[index];
            if (platform) {
              if (jumper.x > platform.x - playerHalfWidth && jumper.x < platform.x + platform.width + playerHalfWidth) {
                // landed on the platform
                jumper.y = platform.y;
                jumper.vy = defaultJumpPower;
                game.events.push({ type: GameEventType.BOUNCE, playerId: jumper.id });
                break;
              }
            }
          }
        }

        if (jumper.right && jumper.x < 1 - playerHalfWidth) {
          jumper.x += moveSpeed;
        }
        if (jumper.left && jumper.x > playerHalfWidth) {
          jumper.x -= moveSpeed;
        }

        jumper.highest = Math.max(jumper.highest, jumper.y);

        if (jumper.y < jumper.highest - 0.5) {
          // fell off screen
          jumper.dead = true;
          game.events.push({ type: GameEventType.DIE, playerId: jumper.id });
        }
      }
    }
  },
  actions: {
    join: ({ type }, context) => {
      const baseX = 0.5 - ((context.allPlayerIds.length - 1) * 0.1);
      const x = (context.allPlayerIds.indexOf(context.playerId) * 0.2) + baseX;

      context.game.jumpers.push({
        x,
        y: rowHeight,
        highest: rowHeight,
        id: context.playerId,
        type,
        vy: defaultJumpPower,
        left: false,
        right: false,
        dead: false
      });
    },
    controls: ({ controls }, context) => {
      const jumper = context.game.jumpers.find(j => j.id === context.playerId);
      if (jumper) {
        jumper.right = controls.right;
        jumper.left = controls.left;
      }
    }
  },
})
