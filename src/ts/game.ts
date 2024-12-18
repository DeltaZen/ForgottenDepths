import { initialize_fps_meter, performance_mark, tick_fps_meter } from "./debug/fps-meter";
import { BLACK, WHITE } from "./graphics/colour";
import { push_text } from "./graphics/text";
import { initialize_input, is_touch_event, render_controls, update_hardware_input } from "./input/controls";
import { initialize_particle_system } from "./particle-system";
import { register_scene, render_scene, update_scene } from "./scene";
import { canvas_reference, initialize_page, SCREEN_CENTER_X, SCREEN_CENTER_Y, window_reference } from "./screen";
import { play_music, zzfx_init } from "./zzfx";
import { MainMenu } from "./scenes/00-main-menu";
import { Hub } from "./scenes/01-hub";
import { Craft } from "./scenes/01a-craft";
import { ManageDeck } from "./scenes/01b-manaage-deck";
import { LevelSelect } from "./scenes/02-level-select";
import { Dungeon } from "./scenes/03-dungeon";
import { Combat } from "./scenes/04-combat";
import { Dialog } from "./scenes/20-dialog";
import { gl_clear, gl_flush, gl_get_context, gl_init } from "./graphics/gl/gl";
import { load_palette, load_textures } from "./graphics/texture/texture";
import { animation_frame, update_animation_frame } from "./animation";

window_reference.addEventListener('load', async () =>
{
  initialize_fps_meter();
  initialize_page();

  let webgl_context = gl_get_context(canvas_reference);
  gl_init(webgl_context);

  await load_palette();
  await load_textures();

  let playing = false;
  let initialize_game = (e: PointerEvent | TouchEvent) =>
  {
    if (!playing)
    {
      is_touch_event(e);
      canvas_reference.removeEventListener("touchstart", initialize_game);
      canvas_reference.removeEventListener("pointerdown", initialize_game);
      playing = true;

      initialize_input();
      initialize_particle_system();
      zzfx_init();

      register_scene(MainMenu._scene);
      register_scene(Hub._scene);
      register_scene(Craft._scene);
      register_scene(ManageDeck._scene);
      register_scene(LevelSelect._scene);
      register_scene(Dungeon._scene);
      register_scene(Combat._scene);
      register_scene(Dialog._scene);
    }
  };

  canvas_reference.addEventListener("touchstart", initialize_game);
  canvas_reference.addEventListener("pointerdown", initialize_game);

  let time_step = 16.5;
  let then: number;
  let elasped_time: number = 0;
  let loop = (now: number): void =>
  {
    performance_mark("start_of_frame");
    gl_clear();

    let delta = now - then;
    if (delta > 1000)
      delta = time_step;

    elasped_time += delta;
    then = now;

    if (playing)
    {
      performance_mark("update_start");
      update_hardware_input();
      play_music(delta);
      while (elasped_time >= time_step)
      {
        update_animation_frame(time_step);
        update_scene(time_step);
        elasped_time -= time_step;
      }
      performance_mark("update_end");

      performance_mark("render_start");
      render_scene();
      render_controls();
      gl_flush();
      performance_mark("render_end");

      tick_fps_meter(now, delta);
    }
    else
    {
      update_animation_frame(delta);
      push_text("touch to play", SCREEN_CENTER_X, SCREEN_CENTER_Y, { _align: TEXT_ALIGN_CENTER, _colour: animation_frame ? WHITE : BLACK, _scale: 2 });
      gl_flush();
    }
    requestAnimationFrame(loop);
  };

  then = performance.now();
  requestAnimationFrame(loop);
});
