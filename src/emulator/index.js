import { AppWrapper, DisplayLoop, LOG, CIDS } from '@webrcade/app-common';

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
  INPUT_UP: 0x0001,
};

const STATE_FILE_PATH = "/state.out";

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
    this.saveStatePrefix = null;
    this.saveStatePath = null;
    this.pal = null;
    this.ym2413 = null;
    this.smsHwType = null;
    this.pad3button = false;
  }

  SRAM_FILE = '/tmp/game.srm';
  SAVE_NAME = 'sav';

  getDefaultAspectRatio() {
    return 1.333;
  }

  setRom(type, md5, bytes, pal, ym2413, smsHwType, pad3button) {
    if (bytes.byteLength === 0) {
      throw new Error('The size is invalid (0 bytes).');
    }
    this.romMd5 = md5;
    this.romBytes = bytes;
    this.romType = type;
    this.pal = pal;
    this.ym2413 = ym2413;
    this.smsHwType = smsHwType;
    this.pad3button = pad3button;

    LOG.info('MD5: ' + this.romMd5);
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
          controllers
            .waitUntilControlReleased(i, CIDS.ESCAPE)
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
            .then((gens) => {
              this.gens = gens;
              gens.onAbort = (msg) => app.exit(msg);
              gens.onExit = () => app.exit();
              return gens;
            })
            .then((gens) => resolve(gens))
            .catch((error) => reject(error));
        } else {
          reject('An error occurred loading the Genesis Emscripten module');
        }
      };
    });
  }

  async onStart(canvas) {
    const { app, audioChannels, gens, romBytes, romMd5, smsHwType, SAVE_NAME } =
      this;

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
      romBytes.byteLength,
    );
    this.romdata.set(new Uint8Array(romBytes));

    // Determine the SMS hardware type
    const smsHw = smsHwType === 0 ? 0x21 : smsHwType === 1 ? 0x20 : 0x10;

    if (this.romType === 'genplusgx-sms') {
      LOG.info('SMS HW type: 0x' + Number(smsHw).toString(16));
    }

    // init emulator
    gens._init_genplus(
      this.romType === 'genplusgx-sg'
        ? 0x10
        : this.romType === 'genplusgx-sms'
        ? smsHw
        : this.romType === 'genplusgx-gg'
        ? 0x40
        : 0x80,
      this.pal === true ? 2 : -1 /* Region */,
      this.ym2413 === true ? 1 : -1 /* YM2413*/,
      this.pad3button === true ? 1 : -1 /* Force 3 button (genesis) */,
    );

    // Load saved state (if applicable)
    this.saveStatePrefix = app.getStoragePath(`${romMd5}/`);
    this.saveStatePath = `${this.saveStatePrefix}${SAVE_NAME}`;
    await this.loadState();

    // Determine PAL mode
    const pal = gens._is_pal();
    canvas.setAttribute('width', CANVAS_WIDTH);
    canvas.setAttribute('height', pal ? CANVAS_HEIGHT_PAL : CANVAS_HEIGHT_NTSC);
    this.canvasContext = canvas.getContext('2d');
    this.canvasContext.clearRect(0, 0, canvas.width, canvas.height);
    this.canvasImageData = this.canvasContext.createImageData(
      canvas.width,
      canvas.height,
    );

    // Create display loop
    this.displayLoop = new DisplayLoop(pal ? 50 : 60, true, this.debug);

    // reset the emulator
    gens._reset();

    // vram view
    this.vram = new Uint8ClampedArray(
      gens.HEAPU8.buffer,
      gens._get_frame_buffer_ref(),
      canvas.width * canvas.height * 4,
    );

    // audio view
    const SAMPLING_PER_FPS =
      this.audioProcessor.getFrequency() / this.displayLoop.getFrequency() +
      100;
    audioChannels[0] = new Float32Array(
      gens.HEAPF32.buffer,
      gens._get_web_audio_l_ref(),
      SAMPLING_PER_FPS,
    );
    audioChannels[1] = new Float32Array(
      gens.HEAPF32.buffer,
      gens._get_web_audio_r_ref(),
      SAMPLING_PER_FPS,
    );

    // input
    this.input = new Uint16Array(
      gens.HEAPU16.buffer,
      gens._get_input_buffer_ref(),
      GAMEPAD_API_INDEX,
    );

    // start audio processor
    this.audioProcessor.start();

    // game loop
    const canvasData = this.canvasImageData.data;
    const canvasContext = this.canvasContext;
    const audioProcessor = this.audioProcessor;

    // Enable show message
    this.setShowMessageEnabled(true);

    // Start the display loop
    this.displayLoop.start(() => {
      canvasData.set(this.vram);
      canvasContext.putImageData(this.canvasImageData, 0, 0);
      gens._tick();
      this.pollControls();
      audioProcessor.storeSound(audioChannels, gens._sound());
    });
  }

  async migrateSaves() {
    const { saveStatePath, storage, SAVE_NAME } = this;

    // Load old saves (if applicable)
    const sram = await storage.get(saveStatePath);
    if (sram) {
      LOG.info('Migrating local saves.');

      await this.getSaveManager().saveLocal(saveStatePath, [
        {
          name: SAVE_NAME,
          content: sram,
        },
      ]);

      // Delete old location (and info)
      await storage.remove(saveStatePath);
      await storage.remove(`${saveStatePath}/info`);
    }
  }

  async loadState() {
    const { gens, saveStatePath, SAVE_NAME, SRAM_FILE } = this;
    const FS = window.FS;

    try {
      // Migrate old save format
      await this.migrateSaves();

      // Create the save path (MEM FS)
      const res = FS.analyzePath(SRAM_FILE, true);
      if (!res.exists) {
        // Load from new save format
        const files = await this.getSaveManager().load(
          saveStatePath,
          this.loadMessageCallback,
        );

        let s = null;
        if (files) {
          for (let i = 0; i < files.length; i++) {
            const f = files[i];
            if (f.name === SAVE_NAME) {
              s = f.content;
              break;
            }
          }
          // Cache the initial files
          await this.getSaveManager().checkFilesChanged(files);
        }

        if (s) {
          FS.writeFile(SRAM_FILE, s);
          if (gens._load_sram()) {
            LOG.info('loaded sram.');
          }
        }
      }
    } catch (e) {
      LOG.error(e);
    }
  }

  async saveInOldFormat(s) {
    const { saveStatePath } = this;
    // old, for testing migration
    await this.saveStateToStorage(saveStatePath, s);
  }

  async saveState() {
    const { gens, saveStatePath, started, SAVE_NAME, SRAM_FILE } = this;
    const FS = window.FS;

    if (!started) {
      return;
    }

    if (gens._save_sram()) {
      const res = FS.analyzePath(SRAM_FILE, true);
      if (res.exists) {
        const s = FS.readFile(SRAM_FILE);
        if (s) {
          const files = [
            {
              name: SAVE_NAME,
              content: s,
            },
          ];

          if (await this.getSaveManager().checkFilesChanged(files)) {
            // await this.saveInOldFormat(s);
            await this.getSaveManager().save(
              saveStatePath,
              files,
              this.saveMessageCallback,
            );

            LOG.info('sram saved: ' + s.length);
          }
        }
      }
    }
  }

  async getStateSlots(showStatus = true) {
    return await this.getSaveManager().getStateSlots(
      this.saveStatePrefix, showStatus ? this.saveMessageCallback : null
    );
  }

  async saveStateForSlot(slot) {
    const { gens } = this;

    gens._write_state();

    let s = null;
    try {

      const FS = window.FS;
      try {
        s = FS.readFile(STATE_FILE_PATH);
      } catch (e) {}

      if (s) {
        const props = {}
        props.aspectRatio = `${"" + this.getDefaultAspectRatio()}`;

        await this.getSaveManager().saveState(
          this.saveStatePrefix, slot, s,
          this.canvas,
          this.saveMessageCallback, null,
          props);
      }
    } catch (e) {
      LOG.error('Error saving state: ' + e);
    }

    return true;
  }

  async loadStateForSlot(slot) {
    const { gens } = this;

    try {
      const state = await this.getSaveManager().loadState(
        this.saveStatePrefix, slot, this.saveMessageCallback);

      if (state) {
        const FS = window.FS;
        FS.writeFile(STATE_FILE_PATH, state);
        gens._read_state();
      }
    } catch (e) {
      LOG.error('Error loading state: ' + e);
    }
    return true;
  }

  async deleteStateForSlot(slot, showStatus = true) {
    try {
      await this.getSaveManager().deleteState(
        this.saveStatePrefix, slot, showStatus ? this.saveMessageCallback : null);
    } catch (e) {
      LOG.error('Error deleting state: ' + e);
    }
    return true;
  }
}
