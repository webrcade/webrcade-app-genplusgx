import {
  blobToStr,
  md5,
  romNameScorer,
  settings,
  AppRegistry,
  FetchAppData,
  Resources,
  Unzip,
  WebrcadeApp,
  APP_TYPE_KEYS,
  LOG,
  TEXT_IDS
} from '@webrcade/app-common'
import { Emulator } from './emulator'
import { EmulatorPauseScreen } from './pause';

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
      const smsHwType = appProps.hwType !== undefined ? appProps.hwType : 0;
      const pad3button = appProps.pad3button !== undefined && appProps.pad3button === true;

      // Determine extensions
      const exts = [
        ...AppRegistry.instance.getExtensions(APP_TYPE_KEYS.GENPLUSGX_MD, true, false),
        ...AppRegistry.instance.getExtensions(APP_TYPE_KEYS.GENPLUSGX_GG, true, false),
        ...AppRegistry.instance.getExtensions(APP_TYPE_KEYS.GENPLUSGX_SMS, true, false),
        ...AppRegistry.instance.getExtensions(APP_TYPE_KEYS.GENPLUSGX_SG, true, false),
      ];
      const extsNotUnique = [
        ...new Set([
          ...AppRegistry.instance.getExtensions(APP_TYPE_KEYS.GENPLUSGX_MD, true, true),
          ...AppRegistry.instance.getExtensions(APP_TYPE_KEYS.GENPLUSGX_GG, true, true),
          ...AppRegistry.instance.getExtensions(APP_TYPE_KEYS.GENPLUSGX_SMS, true, true),
          ...AppRegistry.instance.getExtensions(APP_TYPE_KEYS.GENPLUSGX_SG, true, true),
        ])
      ];

      // Load emscripten and the ROM
      let romBlob = null;
      let romMd5 = null;
      const unzip = new Unzip().setDebug(this.isDebug());
      emulator.loadEmscriptenModule()
        .then(() => settings.load())
        // .then(() => settings.setBilinearFilterEnabled(true))
        // .then(() => settings.setVsyncEnabled(false))
        .then(() => new FetchAppData(rom).fetch())
        .then(response => response.blob())
        .then(blob => unzip.unzip(blob, extsNotUnique, exts, romNameScorer))
        .then(blob => {  romBlob = blob; return blob; })
        .then(blob => blobToStr(blob))
        .then(str => { romMd5 = md5(str); })
        .then(() => new Response(romBlob).arrayBuffer())
        .then(bytes => emulator.setRom(type, romMd5, bytes, pal, ym2413, smsHwType, pad3button))
        .then(() => this.setState({ mode: ModeEnum.LOADED }))
        .catch(msg => {
          LOG.error(msg);
          this.exit(this.isDebug() ? msg : Resources.getText(TEXT_IDS.ERROR_RETRIEVING_GAME));
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

  renderPauseScreen() {
    const { appProps, emulator } = this;

    return (
      <EmulatorPauseScreen
        type={this.getAppType()}
        emulator={emulator}
        appProps={appProps}
        closeCallback={() => this.resume()}
        exitCallback={() => this.exit()}
        isEditor={this.isEditor}
      />
    );
  }

  renderCanvas() {
    return (
      <canvas
        style={this.getCanvasStyles()}
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
