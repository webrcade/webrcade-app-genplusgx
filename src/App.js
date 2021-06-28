import {
  blobToStr,
  md5,  
  FetchAppData,
  Resources,
  Unzip,
  WebrcadeApp,
  LOG,  
  TEXT_IDS
} from '@webrcade/app-common'
import { Emulator } from './emulator'

import './App.scss';

class App extends WebrcadeApp {
  emulator = null;

  componentDidMount() {
    super.componentDidMount();

    // Create the emulator
    if (this.emulator === null) {
      this.emulator = new Emulator(this, this.isDebug());
    }

    const { appProps, emulator, ModeEnum } = this;

    try {
      // Get the ROM location that was specified
      const rom = appProps.rom;
      if (!rom) throw new Error("A ROM file was not specified.");

      const type = appProps.type;
      if (!type) throw new Error("The application type was not specified.");

      const pal = appProps.pal !== undefined ? appProps.pal === true : null;
      const ym2413 = appProps.ym2413 !== undefined ? appProps.ym2413 === true : null;
      const sms2 = appProps.sms2 !== undefined ? appProps.sms2 === true : null;

      // Load emscripten and the ROM
      let romBlob = null;
      let romMd5 = null;
      emulator.loadEmscriptenModule()
        .then(() => new FetchAppData(rom).fetch())
        .then(response => response.blob())
        .then(blob => new Unzip().unzip(blob, [".md", ".bin", ".gen", ".smd", ".sms", ".gg"]))
        .then(blob => { romBlob = blob; return blob; })
        .then(blob => blobToStr(blob))
        .then(str => { romMd5 = md5(str); })
        .then(() => new Response(romBlob).arrayBuffer())
        .then(bytes => emulator.setRom(type, romMd5, bytes, pal, ym2413, sms2))
        .then(() => this.setState({ mode: ModeEnum.LOADED }))
        .catch(msg => {
          LOG.error(msg);
          this.exit(Resources.getText(TEXT_IDS.ERROR_RETRIEVING_GAME));
        })
    } catch (e) {
      this.exit(e);
    }
  }

  componentDidUpdate() {
    const { mode } = this.state;
    const { canvas, emulator, ModeEnum } = this;

    if (mode === ModeEnum.LOADED) {
      window.focus();
      // Start the emulator
      emulator.start(canvas);
    }
  }

  async onPreExit() {
    try {
      await super.onPreExit();
      await this.emulator.saveState();
    } catch (e) {
      LOG.error(e);
    }
  }

  renderCanvas() {
    return (
      <canvas
        ref={canvas => { this.canvas = canvas; }}
        id="screen">
      </canvas>
    );
  }

  render() {
    const { mode } = this.state;
    const { ModeEnum } = this;

    return (
      <>
        { super.render()}
        { mode === ModeEnum.LOADING ? this.renderLoading() : null}
        { mode === ModeEnum.PAUSE ? this.renderPauseScreen() : null}
        { mode === ModeEnum.LOADED || mode === ModeEnum.PAUSE ? this.renderCanvas() : null}
      </>
    );
  }
}

export default App;
