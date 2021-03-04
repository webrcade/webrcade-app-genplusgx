import { WebrcadeApp, FetchAppData, Unzip } from '@webrcade/app-common'
import { Emulator } from './emulator'

import './App.scss';
import '@webrcade/app-common/dist/index.css'

class App extends WebrcadeApp {
  emulator = new Emulator();

  componentDidMount() {
    super.componentDidMount();

    const { appProps, emulator, ModeEnum } = this;    

    // Get the ROM location that was specified
    const rom = appProps.rom;
    if (!rom) throw new Error("A ROM file was not specified.");

    // Load emscripten and the ROM
    emulator.loadEmscriptenModule()
      .then(() => new FetchAppData(rom).fetch())
      .then(response => response.blob())
      .then(blob => Unzip.unzip(blob, [".md", ".bin", ".gen", ".smd"]))
      .then(blob => new Response(blob).arrayBuffer())
      .then(bytes => emulator.setRomBytes(bytes))
      .then(() => this.setState({mode: ModeEnum.LOADED}))
      .catch(msg => console.error(msg))
  }  

  componentDidUpdate() {
    const { mode } = this.state;
    const { ModeEnum, emulator, canvas } = this;

    if (mode === ModeEnum.LOADED) {
      window.focus();
      // Start the emulator
      emulator.start(canvas);
    }
  }  

  renderCanvas() {
    return (
      <canvas 
        ref={canvas => { this.canvas = canvas;}}          
        id="screen">
      </canvas>
    );
  }

  render() {
    const { mode } = this.state;
    const { ModeEnum } = this;

    return (
      <>
        { mode === ModeEnum.LOADING ? this.renderLoading() : null}
        { mode === ModeEnum.LOADED ? this.renderCanvas() : null}
      </>
    );
  }
}

export default App;
