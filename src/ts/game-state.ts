import { buff, skeleton, spell, spirit, zombie } from "@gameplay/card-builders";
import { build_attack_modifier, build_defense_modifier, build_heal } from "@gameplay/effects";
import { V2 } from "@math/vector";
import { window_reference } from "./screen";
import { set_zzfx_mute } from "./zzfx";

export type GameState = [
  number[], // GAMESTATE_EVENTS
  Level, // GAMESTATE_CURRENT_DUNGEON
  Player, // GAMESTATE_PLAYER
  number[], // GAMESTATE_RESOURCES
  Card[], // GAMESTATE_CARD_COLLECTION
  Card[], // GAMESTATE_DECK
  CombatData, // GAMESTATE_COMBAT
];

export type Player = [
  number, // PLAYER_XP
  number, // PLAYER_LEVEL
  boolean, // PLAYER_LEVEL_PENDING
  number, // PLAYER_HP
  number, // PLAYER_MAX_HP
  boolean[], // PLAYER_DEBUFFS
];

let default_player: Player =
  [
    0,
    1,
    false,
    10,
    10,
    [false, false, false, false],
  ];

export type CombatData = [
  number, // ATTACK_MODIFIER
  number, // DEFENSE_MODIFIER
  V2, // SKELETON_MODIFIERS
  V2, // ZOMBIE_MODIFIERS
  V2, // SPIRIT_MODIFIERS
];

export type Card = [
  string, // CARD_NAME
  number, // CARD_TYPE
  number, // CARD_LEVEL
  number, // CARD_ATTACK
  number, // CARD_DEFENSE
  Effect[], // CARD_EFFECTS
];

export type Effect = [
  string, // EFFECT_DESCRIPTION
  number, // EFFECT_VALUE
  number, // EFFECT_APPLY_FUNCTION
];

export type Enemy = {
  _type: number,
  _alive: boolean,
  _max_hp: number,
  _hp: number,
  _attack: number,
  _block_value: number,
  _debuffs: boolean[],
  _intent_pool: Enemy_Intent[],
  _current_intent: Enemy_Intent,
};

export type Enemy_Intent = {
  _type: number,
  _value: number,
};

export type Room = {
  _seen: boolean,
  _peeked: boolean,
  _exit: boolean,
  _enemies: Enemy[],
  _loot: [];
  _events: [];
};

export type Level = {
  _tile_map: Int8Array,
  _player_position: V2,
  _rooms: Room[],
};

const null_level: Level = {
  _tile_map: new Int8Array(),
  _player_position: [0, 0],
  _rooms: [],
};

// Gamestate Object
export let game_state: GameState;
export let setup_game_state = () =>
{
  let events: number[] = [];
  for (let i = 0; i <= 0; i++)
  {
    events[i] = 0;
  }

  let deck: Card[] = [];
  for (let i = 0; i < 15; i += 3)
  {
    deck[i] = skeleton();
    deck[i + 1] = zombie();
    deck[i + 2] = spirit();
  }
  deck[15] = buff("necrotic\npower", [build_attack_modifier(1), build_defense_modifier(-1)]);
  deck[16] = spell("minor death\ncoil", 1, build_heal(1));

  game_state = [
    events,
    null_level,
    default_player,
    [0, 0, 0, 0, 0],
    [],
    deck,
    [0, 0, [0, 0], [0, 0], [0, 0]]
  ];
};

// Save file handling
let save_name = "dbrad-js13k2022";
let storage = window_reference.localStorage;

export let save_game = (): void =>
{
  if (game_state)
  {
    let json = JSON.stringify(game_state);
    let b64 = btoa(json);
    storage.setItem(save_name, b64);
  }
};

export let load_game = (): void =>
{
  let b64 = storage.getItem(save_name);
  if (!b64)
  {
    setup_game_state();
    save_game();
    return;
  }
  game_state = JSON.parse(atob(b64)) as GameState;
};

export let has_save_file = (): boolean =>
{
  return storage.getItem(save_name) !== null;
};

// Save Options
type GameOptions = {
  mm: boolean, // Mute Music
  ms: boolean, // Mute Sound
  c: boolean, // Coil
};

export let options_state: GameOptions;
let initialize_options = () =>
{
  options_state = {
    mm: false,
    ms: false,
    c: false,
  };
};

let options_save_name = save_name + "-o";

export let save_options = (): void =>
{
  let json = JSON.stringify(options_state);
  let b64 = btoa(json);
  storage.setItem(options_save_name, b64);
};

export let load_options = (): void =>
{
  let b64 = storage.getItem(options_save_name);
  if (!b64)
  {
    initialize_options();
    save_options();
    return;
  }
  options_state = JSON.parse(atob(b64)) as GameOptions;

  set_zzfx_mute(options_state.ms);
};
