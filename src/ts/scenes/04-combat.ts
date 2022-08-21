import { assert } from "@debug/assert";
import { effects } from "@gameplay/effects";
import { get_next_enemy_intent } from "@gameplay/enemy-builder";
import { BLACK, floor_palettes, wall_palettes, WHITE } from "@graphics/colour";
import { push_quad, push_textured_quad } from "@graphics/quad";
import { push_text } from "@graphics/text";
import { key_state } from "@input/controls";
import { V2 } from "@math/vector";
import { Card, Effect, Enemy, game_state, Level, Player } from "@root/game-state";
import { get_modifiers, render_card } from "@root/nodes/card";
import { render_panel } from "@root/nodes/panel";
import { render_player_status } from "@root/nodes/player-status";
import { render_text_menu } from "@root/nodes/text-menu";
import { render_enemy, unit_name_map } from "@root/nodes/unit";
import { clear_particle_system } from "@root/particle-system";
import { get_next_scene_id, Scene, switch_to_scene } from "@root/scene";
import { SCREEN_CENTER_X, SCREEN_CENTER_Y, SCREEN_HEIGHT } from "@root/screen";
import { math, safe_add, safe_subtract, shuffle } from "math";
import { Dungeon } from "./03-dungeon";
export namespace Combat
{
  let mode = COMBAT_MODE_POST_COMBAT;
  let sub_mode = 0;
  let row = 1;
  let selected_card_index = 0;
  let selected_action_index = 0;

  let current_level: Level;
  let player_room_x: number;
  let player_room_y: number;
  let enemies: Enemy[] = [];

  type Minion = {
    _type: number,
    _value: number;
    _effects: Effect[];
  };

  let card_use_menu: string[] = [];

  let player: Player;
  let attackers: Minion[] = [];
  let defenders: Minion[] = [];
  let deck: Card[] = [];
  let discard: Card[] = [];

  let total_attack = 0;
  let total_defense = 0;
  let barbs_damage = 0;

  let casting_spell = false;

  let hand: Card[] = [];
  let hand_size: number = 0;
  let discarding = [false, false, false, false, false];

  type AttackAnimation = {
    _source_index: number,
    _attack_value: number,
    _done: boolean,
    _playing: boolean,
    _lifetime_remaining: number,
    _animation_fn: () => void;
  };

  let attack_queue: AttackAnimation[] = [];
  let queue_index = 0;
  for (let i = 0; i < 4; i++)
  {
    attack_queue[i] = {
      _source_index: 0,
      _attack_value: 0,
      _done: true,
      _playing: false,
      _lifetime_remaining: 0,
      _animation_fn: () => { }
    };
  }

  let add_attack = (source_index: number, attack_value: number, lifetime: number, animation_fn: () => void) =>
  {
    attack_queue[queue_index]._source_index = source_index;
    attack_queue[queue_index]._attack_value = attack_value;
    attack_queue[queue_index]._done = false;
    attack_queue[queue_index]._playing = false;
    attack_queue[queue_index]._lifetime_remaining = lifetime;
    attack_queue[queue_index]._animation_fn = animation_fn;
    queue_index++;
  };

  let player_position: V2 = [1.5 * 48 + SCREEN_CENTER_X - 264, 3 * 48 + 48];
  let summon_positions: V2[] = [
    [3.5 * 48 + SCREEN_CENTER_X - 264, 3 * 48 + 48],
    [1.5 * 48 + SCREEN_CENTER_X - 264, 2 * 48 + 48],
    [1.5 * 48 + SCREEN_CENTER_X - 264, 4 * 48 + 48],
    [3 * 48 + SCREEN_CENTER_X - 264, 1.5 * 48 + 48],
    [3 * 48 + SCREEN_CENTER_X - 264, 4.5 * 48 + 48],
  ];
  let enemy_starting_positions: V2[] = [
    [8.5 * 48 + SCREEN_CENTER_X - 264, 3 * 48 + 48],
    [7.5 * 48 + SCREEN_CENTER_X - 264, 1.5 * 48 + 48],
    [7.5 * 48 + SCREEN_CENTER_X - 264, 4.5 * 48 + 48],
    [6.5 * 48 + SCREEN_CENTER_X - 264, 3 * 48 + 48],
  ];
  let enemy_positions: V2[] = [];

  let target_index: number = 0;
  let target_list: string[] = [];
  let target_index_map: number[] = [];

  let go_to_target_mode = () =>
  {
    target_index = 0;
    mode = COMBAT_MODE_SELECT_TARGET;
    let list_index = 0;
    target_list.length = 0;
    target_index_map.length = 0;
    for (let [index, enemy] of enemies.entries())
    {
      if (enemy._alive)
      {
        target_list[list_index] = unit_name_map[enemy._type];
        target_index_map[list_index] = index;
        list_index++;
      }
    }
    clear_particle_system();
  };

  let check_enemies_alive = (enemies: Enemy[]): boolean =>
  {
    let enemies_alive = false;
    for (let enemy of enemies)
    {
      if (enemy._hp <= 0)
        enemy._alive = false;
      enemies_alive = enemies_alive || enemy._alive;
      if (enemy._alive)
        get_next_enemy_intent(enemy);
    }
    return enemies_alive;
  };

  let _reset_fn = () =>
  {
    player = game_state[GAMESTATE_PLAYER];

    mode = COMBAT_MODE_POST_COMBAT;
    sub_mode = 0;
    row = 1;

    current_level = game_state[GAMESTATE_CURRENT_DUNGEON];
    let player_tile_x = math.floor(current_level._player_position[0] / 16);
    let player_tile_y = math.floor(current_level._player_position[1] / 16);
    player_room_x = math.floor(player_tile_x / 11);
    player_room_y = math.floor(player_tile_y / 9);
    let player_room_index = player_room_y * 10 + player_room_x;
    let player_room = current_level._rooms[player_room_index];

    enemies = player_room._enemies;
    for (let [i, [x, y]] of enemy_starting_positions.entries())
      enemy_positions[i] = [x, y];

    game_state[GAMESTATE_COMBAT] = [0, 0, [0, 0], [0, 0], [0, 0]];
    hand.length = 0;
    deck.length = 0;
    discard.length = 0;

    deck = JSON.parse(JSON.stringify(game_state[GAMESTATE_DECK]));
  };

  let _update_fn = (now: number, delta: number) =>
  {
    let UP_PRESSED = key_state[D_UP] === KEY_WAS_DOWN;
    let DOWN_PRESSED = key_state[D_DOWN] === KEY_WAS_DOWN;
    let LEFT_PRESSED = key_state[D_LEFT] === KEY_WAS_DOWN;
    let RIGHT_PRESSED = key_state[D_RIGHT] === KEY_WAS_DOWN;
    let A_PRESSED = key_state[A_BUTTON] === KEY_WAS_DOWN;
    let B_PRESSED = key_state[B_BUTTON] === KEY_WAS_DOWN;
    hand_size = hand.length;

    if (selected_card_index >= hand_size)
      selected_card_index = hand_size - 1;
    if (selected_card_index < 0)
      selected_card_index = 0;

    if (mode === COMBAT_MODE_DRAW)
    {
      for (let i = 0; i < 5; i++)
      {
        if (discarding[i])
          discard.push(hand.splice(i, 1)[0]);
        discarding[i] = false;
      } for (let i = 0; i < 5; i++)
      {
        if (!hand[i])
        {
          let card = deck.pop();
          if (!card)
          {
            deck = JSON.parse(JSON.stringify(shuffle(discard)));
            discard.length = 0;
            card = deck.pop();
          }
          assert(card !== undefined, "card from deck undefined after shuffling in discard pile");
          hand[i] = card;
        }
      }
      hand_size = hand.length;
      mode = COMBAT_MODE_CARD_SELECT;
    }
    else if (mode === COMBAT_MODE_CARD_SELECT)
    {
      if (hand_size === 0)
        go_to_target_mode();

      if (UP_PRESSED)
        row = 0;
      else if (DOWN_PRESSED)
        row = 1;
      else if (LEFT_PRESSED && row)
        selected_card_index = (selected_card_index + hand_size - 1) % hand_size;
      else if (RIGHT_PRESSED && row)
        selected_card_index = (selected_card_index + 1) % hand_size;
      else if (A_PRESSED)
      {
        if (sub_mode) // 1 = Play card mode
        {
          if (row)
          {
            selected_action_index = 0;
            casting_spell = false;
            card_use_menu = ["activate"];
            mode = COMBAT_MODE_ACTION_SELECT;

            let card = hand[selected_card_index];
            let card_type = card[CARD_TYPE];
            if (card_type === 3) // Buff Spell
            {
              for (let effect of card[CARD_EFFECTS])
                effects[effect[EFFECT_APPLY_FUNCTION]](effect);

              hand.splice(selected_card_index, 1);
              clear_particle_system();
              mode = COMBAT_MODE_CARD_SELECT;
            }
            else if (card_type === 4)
            {
              casting_spell = true;
              go_to_target_mode();
            }
            else
              card_use_menu = ["attack!", "protect me!"];
          }
          else
          {
            row = 1;
            go_to_target_mode();
          }
        }
        else // 0 = Discard Mode
        {
          if (row)
            discarding[selected_card_index] = !discarding[selected_card_index];
          else
          {
            row = 1;
            sub_mode = 1; // SWITCH TO PLAY MODE
            clear_particle_system();
            mode = COMBAT_MODE_DRAW;
          }
        }
      }
    }
    else if (mode === COMBAT_MODE_ACTION_SELECT)
    {
      // ACTION SELECT
      if (UP_PRESSED)
        selected_action_index = safe_subtract(selected_action_index, 1);
      else if (DOWN_PRESSED)
        selected_action_index = safe_add(1, selected_action_index, 1);
      else if (A_PRESSED)
      {
        let card = hand.splice(selected_card_index, 1)[0];
        let card_type = card[CARD_TYPE];

        let [attack_modifier, defense_modifier] = get_modifiers(card_type);
        let attack = math.max(0, card[CARD_ATTACK] + attack_modifier);
        let defense = math.max(0, card[CARD_DEFENSE] + defense_modifier);
        if (selected_action_index)
          defenders.push({ _type: card_type, _value: defense, _effects: card[CARD_EFFECTS] });
        else
          attackers.push({ _type: card_type, _value: attack, _effects: card[CARD_EFFECTS] });

        discard.push(card);
        clear_particle_system();
        mode = COMBAT_MODE_CARD_SELECT;
      }
      else if (B_PRESSED)
        mode = COMBAT_MODE_CARD_SELECT;
    }
    else if (mode === COMBAT_MODE_SELECT_TARGET)
    {
      if (UP_PRESSED)
        target_index = safe_subtract(target_index, 1);
      else if (DOWN_PRESSED)
        target_index = safe_add(target_list.length - 1, target_index, 1);
      else if (A_PRESSED)
      {
        if (casting_spell)
        {
          let card = hand[selected_card_index];
          for (let effect of card[CARD_EFFECTS])
            effects[effect[EFFECT_APPLY_FUNCTION]](effect);

          let target_enemy = enemies[target_index_map[target_index]];
          target_enemy._hp = math.max(0, target_enemy._hp - card[CARD_ATTACK]);

          hand.splice(selected_card_index, 1);
          casting_spell = false;
          clear_particle_system();
          mode = COMBAT_MODE_CARD_SELECT;
        }
        else
          mode = COMBAT_MODE_ATTACK_ACTION;
      }
    }
    else if (mode === COMBAT_MODE_ATTACK_ACTION)
    {
      // ATTACK ACTION MINIGAME
      // TODO: Minigame here
      if (A_PRESSED)
      {
        let target_enemy = enemies[target_index_map[target_index]];
        total_attack = 0;
        for (let attacker of attackers)
          total_attack += attacker._value;
        target_enemy._hp = math.max(0, target_enemy._hp - total_attack);

        attackers.length = 0;
        mode = COMBAT_MODE_DEFEND_ACTION;
      }
    }
    else if (mode === COMBAT_MODE_DEFEND_ACTION)
    {
      // DEFENSE ACTION MINIGAME
      // TODO: Minigame here
      if (A_PRESSED)
      {
        total_defense = 0;
        barbs_damage = 0;
        for (let defender of defenders)
        {
          total_defense += defender._value;
          for (let effect of defender._effects)
          {
            if (effect[EFFECT_DESCRIPTION] === "barbs")
              barbs_damage += effect[EFFECT_VALUE];
          }
        }

        for (let [index, enemy] of enemies.entries())
        {
          if (enemy._alive)
            add_attack(index, enemy._attack, 100, () => { });
        }

        defenders.length = 0;
        mode = COMBAT_MODE_ENEMY_ATTACKS;
      }
    }
    else if (mode === COMBAT_MODE_ENEMY_ATTACKS)
    {
      let attacks_done = 0;
      for (let attack of attack_queue)
      {
        if (attack._done)
        {
          attacks_done++;
          continue;
        }
        if (attack._lifetime_remaining <= 0)
        {
          attack._done = true;
          player[PLAYER_HP] = safe_subtract(player[PLAYER_HP], safe_subtract(attack._attack_value, total_defense));
          total_defense = safe_subtract(total_defense, attack._attack_value);
          enemies[attack._source_index]._hp = safe_subtract(enemies[attack._source_index]._hp, barbs_damage);
          // player death?
        }

        attack._lifetime_remaining -= delta;
        if (!attack._playing)
        {
          attack._animation_fn();
          attack._playing = true;
        }
        break;
      }
      if (attacks_done === 4)
      {
        queue_index = 0;
        mode = COMBAT_MODE_POST_COMBAT;
      }
    }
    else if (mode === COMBAT_MODE_POST_COMBAT)
    {
      row = 1;
      if (check_enemies_alive(enemies))
      {
        for (let enemy of enemies)
        {
          if (enemy._alive)
            get_next_enemy_intent(enemy);
        }
        mode = COMBAT_MODE_DRAW;
      }
      else
        mode = COMBAT_MODE_LOOT_AND_LEAVE;
    }
    else if (mode === COMBAT_MODE_LOOT_AND_LEAVE)
    {
      // COMBAT OVER, SHOW LOOT THEN LEAVE TO MAP
      switch_to_scene(Dungeon._scene_id);
    }
  };

  let _render_fn = () =>
  {
    for (let y = -1; y < 6; y++)
    {
      for (let x = -2; x < 15; x++)
      {
        let tile_x = player_room_x * 11 + x;
        let tile_y = player_room_y * 9 + y;

        let render_x = x * 48 + SCREEN_CENTER_X - 264;
        let render_y = y * 48 + 48;

        let tile_id = current_level._tile_map[tile_y * 110 + tile_x];
        if (tile_id > 4)
          push_quad(render_x, render_y, 48, 48, 0xff2a1f1c);
        else
          push_quad(render_x, render_y, 48, 48, BLACK);

        if (tile_id > 5)
          push_textured_quad(TEXTURE_FLOOR, render_x, render_y, { _scale: 3, _palette_offset: floor_palettes[tile_id - 6] });
        else if (tile_id > 1 && tile_id < 5)
          push_textured_quad(TEXTURE_WALL, render_x, render_y, { _scale: 3, _palette_offset: wall_palettes[tile_id - 2] });

        let distance = math.sqrt((player_room_x * 11 + 2 - tile_x) ** 2 + (player_room_y * 9 + 3 - tile_y) ** 2);
        if (distance >= 7)
          push_quad(render_x, render_y, 48, 48, 0xBD000000);
        else if (distance >= 5)
          push_quad(render_x, render_y, 48, 48, 0x7F000000);
        else if (distance >= 3)
          push_quad(render_x, render_y, 48, 48, 0x40000000);
      }
    }

    push_quad(player_position[0] + 8 - 6, player_position[1] + 8 + 28, 30, 8, 0x99000000);
    push_textured_quad(TEXTURE_ROBED_MAN, player_position[0] + 8, player_position[1] + 8, { _scale: 2, _palette_offset: PALETTE_PLAYER, _animated: true });

    // for (let s = 0; s < 5; s++)
    // {
    //   if (summons[s] && summons[s][SUMMON_ALIVE])
    //     render_summon(summons[s], summon_positions[s][0] + 8, summon_positions[s][1] + 8);
    // }

    for (let e = 0; e < 4; e++)
    {
      if (enemies[e] && enemies[e]._alive)
        render_enemy(enemies[e], enemy_positions[e][0] + 8, enemy_positions[e][1] + 8);
    }

    if (mode === COMBAT_MODE_SELECT_TARGET)
    {
      let target_list_length = target_list.length;
      render_panel(SCREEN_CENTER_X - 50, SCREEN_CENTER_Y - 5, 100, 14 * target_list_length + 3);
      render_text_menu([SCREEN_CENTER_X, SCREEN_CENTER_Y], target_list, target_list.length, target_index, 1);
    }

    if (mode === COMBAT_MODE_CARD_SELECT || mode === COMBAT_MODE_DRAW || mode === COMBAT_MODE_ACTION_SELECT)
    {
      for (let hand_index = 0; hand_index < hand_size; hand_index++)
      {
        let card = hand[hand_index];
        if (card)
        {
          let selected = hand_index === selected_card_index && row;
          let highlight_colour = discarding[hand_index] ? 0xff0000ff : selected ? WHITE : undefined;
          render_card(50 + 110 * hand_index, SCREEN_HEIGHT - 85 - (selected ? 10 : 0), card, highlight_colour);
        }
      }
    }

    if (mode === COMBAT_MODE_CARD_SELECT && !sub_mode)
    {
      push_text("discard and draw", SCREEN_CENTER_X, SCREEN_HEIGHT - 110, { _align: TEXT_ALIGN_CENTER });
      render_panel(SCREEN_CENTER_X - 40, SCREEN_CENTER_Y - 10, 80, 28, !row ? WHITE : 0xff2d2d2d);
      let text = "done";
      for (let d = 0; d < 5; d++)
      {
        if (discarding[d])
        {
          text = "discard";
          break;
        }
      }
      push_text(text, SCREEN_CENTER_X, SCREEN_CENTER_Y, { _align: TEXT_ALIGN_CENTER, _colour: (row ? 0xff444444 : WHITE) });
    }
    else if (mode === COMBAT_MODE_CARD_SELECT)
    {
      render_panel(SCREEN_CENTER_X - 40, SCREEN_CENTER_Y - 10, 80, 28, !row ? WHITE : 0xff2d2d2d);
      push_text("end turn", SCREEN_CENTER_X, SCREEN_CENTER_Y, { _align: TEXT_ALIGN_CENTER, _colour: (row ? 0xff444444 : WHITE) });
    }

    render_player_status();

    if (mode === COMBAT_MODE_ACTION_SELECT)
    {
      render_panel(SCREEN_CENTER_X - 55, SCREEN_CENTER_Y + 30 - 10, 110, 40);
      render_text_menu([SCREEN_CENTER_X, SCREEN_CENTER_Y + 30], card_use_menu, card_use_menu.length, selected_action_index, 1);
    }
  };
  export let _scene_id = get_next_scene_id();
  export let _scene: Scene = { _scene_id, _reset_fn, _update_fn, _render_fn };
}