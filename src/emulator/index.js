import {  
  AppWrapper,
  DisplayLoop,
  LOG,
  CIDS  
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

export class Emulator extends AppWrapper {
  constructor(app, debug = false) {
    super(app, debug);

    this.romType = null;
    this.gens = null;
    this.romBytes = null;
    this.romdata = null;
    this.romMd5 = null;
    this.vram = null;
    this.input = null;
    this.canvasContext = null;
    this.canvasImageData = null;
    this.audioChannels = new Array(2);
    this.saveStatePath = null;
    this.pal = null;
    this.ym2413 = null;
    this.sms2 = null;
    this.pad3button = false;
  }

  SRAM_FILE = "/tmp/game.srm";

  setRom(type, md5, bytes, pal, ym2413, sms2, pad3button) {
    if (bytes.byteLength === 0) {
      throw new Error("The size is invalid (0 bytes).");
    }
    this.romMd5 = md5;
    this.romBytes = bytes;
    this.romType = type;
    this.pal = pal;
    this.ym2413 = ym2413;
    this.sms2 = sms2;
    this.pad3button = pad3button;

    LOG.info("MD5: " + this.romMd5);
  }

  async onShowPauseMenu() {
    await this.saveState();
  }

  pollControls() {
    const { controllers, input } = this;

    controllers.poll();
    for (let i = 0; i < 2; i++) {
      input[i] = 0;

      if (controllers.isControlDown(i, CIDS.ESCAPE)) {
        if (this.pause(true)) {
          controllers.waitUntilControlReleased(i, CIDS.ESCAPE)
            .then(() => this.showPauseMenu());
          return;
        }
      }

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
    }
  }

  loadEmscriptenModule() {
    const { app } = this;

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
              this.gens = gens;
              gens.onAbort = msg => app.exit(msg);
              gens.onExit = () => app.exit();
              return gens;
            })
            .then(gens => resolve(gens))
            .catch(error => reject(error));
        } else {
          reject('An error occurred loading the Genesis Emscripten module');
        }
      };
    });
  }

  async onStart(canvas) {
    const { app, audioChannels, gens, romBytes, romMd5 } = this;

    // Resize canvas based on emulator callback
    window.setCanvasSize = (w, h) => {
      LOG.info(`width: ${w}, height: ${h}`);
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
    gens._init_genplus(
      this.romType === 'genplusgx-sms' ? 
        (this.sms2 === true ? 0x21 : 0x20) :
        (this.romType === 'genplusgx-gg' ? 0x40 : 0x80),
      this.pal === true ? 2 : -1, /* Region */
      this.ym2413 === true ? 1 : -1  /* YM2413*/,
      this.pad3button === true ? 1 : -1 /* Force 3 button (genesis) */ );

    // Load saved state (if applicable)
    this.saveStatePath = app.getStoragePath(`${romMd5}/sav`);
    await this.loadState();

    // Determine PAL mode
    const pal = gens._is_pal();
    canvas.setAttribute('width', CANVAS_WIDTH);
    canvas.setAttribute('height',
      pal ? CANVAS_HEIGHT_PAL : CANVAS_HEIGHT_NTSC);
    this.canvasContext = canvas.getContext('2d');
    this.canvasContext.clearRect(0, 0, canvas.width, canvas.height);
    this.canvasImageData = this.canvasContext.createImageData(
      canvas.width, canvas.height);

    // Create display loop    
    this.displayLoop = new DisplayLoop(pal ? 50 : 60, true, this.debug);

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

    // start audio processor
    this.audioProcessor.start();

    // game loop
    const canvasData = this.canvasImageData.data;
    const canvasContext = this.canvasContext;
    const audioProcessor = this.audioProcessor;

    // Start the display loop
    this.displayLoop.start(() => {
      canvasData.set(this.vram);
      canvasContext.putImageData(this.canvasImageData, 0, 0);
      gens._tick();
      this.pollControls();
      audioProcessor.storeSound(audioChannels, gens._sound());
    });
  }

  async loadState() {
    const { gens, storage, SRAM_FILE } = this;
    const FS = window.FS;

    try {
      // Create the save path (MEM FS)
      const res = FS.analyzePath(SRAM_FILE, true);
      if (!res.exists) {
        const s = await storage.get(this.saveStatePath);
        if (s) {
          FS.writeFile(SRAM_FILE, s);
          if (gens._load_sram()) {
            LOG.info('loaded sram.')
          }
        }
      }
    } catch (e) {
      LOG.error(e);
    }
  }

  async saveState() {
    const { gens, saveStatePath, started, storage, SRAM_FILE } = this;
    const FS = window.FS;

    if (!started) {
      return;
    }

    if (gens._save_sram()) {
      const res = FS.analyzePath(SRAM_FILE, true);
      if (res.exists) {
        const s = FS.readFile(SRAM_FILE);
        if (s) {
          await storage.put(saveStatePath, s);
          LOG.info('sram saved: ' + s.length)
        }
      }
    }
  }
}
