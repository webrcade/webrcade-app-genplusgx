import {
  CIDS,
  Controller,
  Controllers,
  DefaultKeyCodeToControlMapping,
  DisplayLoop,
  ScriptAudioProcessor,
  VisibilityChangeMonitor
} from "@webrcade/app-common"

const CANVAS_WIDTH = 320;
const CANVAS_HEIGHT_NTSC = 224;
const CANVAS_HEIGHT_PAL = 240;
const GAMEPAD_API_INDEX = 32;

const CONTROLS = {
  INPUT_MODE: 0x0800,
  INPUT_X: 0x0400,
  INPUT_Y: 0x0200,
  INPUT_Z: 0x0100,
  INPUT_START: 0x0080,
  INPUT_A: 0x0040,
  INPUT_C: 0x0020,
  INPUT_B: 0x0010,
  INPUT_RIGHT: 0x0008,
  INPUT_LEFT: 0x0004,
  INPUT_DOWN: 0x0002,
  INPUT_UP: 0x0001
}

export class Emulator {
  constructor() {
    this.controllers = new Controllers([
      new Controller(new DefaultKeyCodeToControlMapping()),
      new Controller()
    ]);

    this.gens = null;
    this.romBytes = null;
    this.romdata = null;
    this.vram = null;
    this.input = null;
    this.canvas = null;
    this.canvasContext = null;
    this.canvasImageData = null;
    this.audioChannels = new Array(2);
    this.audioProcessor = null;
    this.displayLoop = null;
    this.visibilityMonitor = null;
    this.started = false;
  }

  setRomBytes(bytes) {
    this.romBytes = bytes;
  }

  pollControls() {
    const { controllers, input } = this;

    controllers.poll();
    for (let i = 0; i < 2; i++) {
      input[i] = 0;
      if (controllers.isControlDown(i, CIDS.UP)) {
        input[i] |= CONTROLS.INPUT_UP;
      }
      if (controllers.isControlDown(i, CIDS.DOWN)) {
        input[i] |= CONTROLS.INPUT_DOWN;
      }
      if (controllers.isControlDown(i, CIDS.RIGHT)) {
        input[i] |= CONTROLS.INPUT_RIGHT;
      }
      if (controllers.isControlDown(i, CIDS.LEFT)) {
        input[i] |= CONTROLS.INPUT_LEFT;
      }
      if (controllers.isControlDown(i, CIDS.X)) {
        input[i] |= CONTROLS.INPUT_A;
      }
      if (controllers.isControlDown(i, CIDS.A)) {
        input[i] |= CONTROLS.INPUT_B;
      }
      if (controllers.isControlDown(i, CIDS.B)) {
        input[i] |= CONTROLS.INPUT_C;
      }
      if (controllers.isControlDown(i, CIDS.LBUMP)) {
        input[i] |= CONTROLS.INPUT_X;
      }
      if (controllers.isControlDown(i, CIDS.Y)) {
        input[i] |= CONTROLS.INPUT_Y;
      }
      if (controllers.isControlDown(i, CIDS.RBUMP)) {
        input[i] |= CONTROLS.INPUT_Z;
      }
      if (controllers.isControlDown(i, CIDS.SELECT)) {
        input[i] |= CONTROLS.INPUT_MODE;
      }
      if (controllers.isControlDown(i, CIDS.START)) {
        input[i] |= CONTROLS.INPUT_START;
      }
      if (controllers.isControlDown(i, CIDS.ESCAPE)) {
        window.history.back();
      }
    }
  }

  loadEmscriptenModule() {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      document.body.appendChild(script);
      script.src = 'genplus.js';
      script.async = true;
      script.onload = () => {
        const esmodule = window.Module;
        if (esmodule) {
          esmodule()
            .then(gens => {
              this.gens = gens; return gens;
            })
            .then(gens => resolve(gens))
            .catch(error => reject(error));
        } else {
          reject('An error occurred loading the Genesis Emscripten module');
        }
      };
    });
  }

  start(canvas) {
    const { gens, audioChannels, romBytes } = this;
    this.canvas = canvas;

    if (this.started) return;
    this.started = true;

    // Resize canvas based on emulator callback
    window.setCanvasSize = (w, h) => {
      console.log(`width: ${w}, height: ${h}`);
      canvas.setAttribute('width', w);
      canvas.setAttribute('height', h);
    };

    // memory allocate
    gens._init();

    // Load the ROM
    this.romdata = new Uint8Array(
      gens.HEAPU8.buffer,
      gens._get_rom_buffer_ref(romBytes.byteLength),
      romBytes.byteLength);
    this.romdata.set(new Uint8Array(romBytes));

    // init emulator
    gens._init_genplus();

    const pal = gens._is_pal(); // pal mode
    canvas.setAttribute('width', CANVAS_WIDTH);
    canvas.setAttribute('height', 
      pal ? CANVAS_HEIGHT_PAL : CANVAS_HEIGHT_NTSC);
    this.canvasContext = canvas.getContext('2d');
    this.canvasContext.clearRect(0, 0, canvas.width, canvas.height);
    this.canvasImageData = this.canvasContext.createImageData(
      canvas.width, canvas.height);

    // Create loop and audio processor
    this.audioProcessor = new ScriptAudioProcessor();
    this.displayLoop = new DisplayLoop(pal ? 50 : 60);

    this.visibilityMonitor = new VisibilityChangeMonitor((p) => {
      this.displayLoop.pause(p);
      this.audioProcessor.pause(p);
    });

    // reset the emulator
    gens._reset();

    // vram view
    this.vram = new Uint8ClampedArray(
      gens.HEAPU8.buffer,
      gens._get_frame_buffer_ref(),
      canvas.width * canvas.height * 4);

    // audio view
    const SAMPLING_PER_FPS = (
      (this.audioProcessor.getFrequency() /
        this.displayLoop.getFrequency()) + 100);
    audioChannels[0] = new Float32Array(
      gens.HEAPF32.buffer, gens._get_web_audio_l_ref(), SAMPLING_PER_FPS);
    audioChannels[1] = new Float32Array(
      gens.HEAPF32.buffer, gens._get_web_audio_r_ref(), SAMPLING_PER_FPS);

    // input
    this.input = new Uint16Array(
      gens.HEAPU16.buffer, gens._get_input_buffer_ref(), GAMEPAD_API_INDEX);

    // audio
    this.audioProcessor.start();

    // game loop
    const canvasData = this.canvasImageData.data;
    const canvasContext = this.canvasContext;
    const audioProcessor = this.audioProcessor;

    //this.displayLoop.setDebug(true);
    this.displayLoop.start(() => {
      // update
      gens._tick();
      // update controls
      this.pollControls();

      // draw
      canvasData.set(this.vram);
      canvasContext.putImageData(this.canvasImageData, 0, 0);
      // canvasContext.fillStyle = "#ffffff";
      // canvasContext.fillText(this.displayLoop.getFps(), 5, canvas.height - 5);

      // sound
      audioProcessor.storeSound(audioChannels, gens._sound());
    });
  }
}