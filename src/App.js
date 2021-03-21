import { WebrcadeApp, FetchAppData, Unzip } from '@webrcade/app-common'
import { Emulator } from './emulator'

import './App.scss';
import '@webrcade/app-common/dist/index.css'

class App extends WebrcadeApp {
  emulator = null;

  componentDidMount() {
    super.componentDidMount();

    // Create the emulator
    if (this.emulator === null) {
      this.emulator = new Emulator(this, this.isDebug());
    }    

    const { appProps, emulator, ModeEnum } = this;    

    // Get the ROM location that was specified
    const rom = appProps.rom;
    if (!rom) throw new Error("A ROM file was not specified.");
    
    const type = appProps.type;
    if (!type) throw new Error("The application type was not specified.");

    // Load emscripten and the ROM
    emulator.loadEmscriptenModule()
      .then(() => new FetchAppData(rom).fetch())
      .then(response => response.blob())
      .then(blob => new Unzip().unzip(blob, [".md", ".bin", ".gen", ".smd"]))
      .then(blob => new Response(blob).arrayBuffer())
      .then(bytes => emulator.setRom(type, bytes))
      .then(() => this.setState({mode: ModeEnum.LOADED}))
      .catch(msg => { 
        this.exit("Error fetching ROM: " + msg);
      })
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
