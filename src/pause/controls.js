import React from 'react';

import { ControlsTab } from '@webrcade/app-common';

export class GamepadControlsTab extends ControlsTab {
  render() {
    const { type } = this.props;
    return (
      <>
        {type === 'genplusgx-md'
          ? [
              this.renderControl('start', 'Start'),
              this.renderControl('select', 'Mode'),
              this.renderControl('dpad', 'Move'),
              this.renderControl('lanalog', 'Move'),
              this.renderControl('x', 'A'),
              this.renderControl('a', 'B'),
              this.renderControl('b', 'C'),
              this.renderControl('lbump', 'X'),
              this.renderControl('y', 'Y'),
              this.renderControl('rbump', 'Z'),
            ]
          : null}
        {type === 'genplusgx-sg' || type === 'genplusgx-sms'
          ? [
              this.renderControl('start', 'Pause'),
              this.renderControl('dpad', 'Move'),
              this.renderControl('lanalog', 'Move'),
              this.renderControl('a', '1/Start'),
              this.renderControl('b', '2'),
            ]
          : null}
        {type === 'genplusgx-gg'
          ? [
              this.renderControl('start', 'Start'),
              this.renderControl('dpad', 'Move'),
              this.renderControl('lanalog', 'Move'),
              this.renderControl('a', '1'),
              this.renderControl('b', '2'),
            ]
          : null}
      </>
    );
  }
}

export class KeyboardControlsTab extends ControlsTab {
  render() {
    const { type } = this.props;
    return (
      <>
        {type === 'genplusgx-md'
          ? [
              this.renderKey('Enter', 'Start'),
              this.renderKey('ShiftRight', 'Mode'),
              this.renderKey('ArrowUp', 'Up'),
              this.renderKey('ArrowDown', 'Down'),
              this.renderKey('ArrowLeft', 'Left'),
              this.renderKey('ArrowRight', 'Right'),
              this.renderKey('KeyA', 'A'),
              this.renderKey('KeyZ', 'B'),
              this.renderKey('KeyX', 'C'),
              this.renderKey('KeyQ', 'X'),
              this.renderKey('KeyS', 'Y'),
              this.renderKey('KeyW', 'Z'),
            ]
          : null}
        {type === 'genplusgx-sg' || type === 'genplusgx-sms'
          ? [
              this.renderKey('Enter', 'Pause'),
              this.renderKey('ArrowUp', 'Up'),
              this.renderKey('ArrowDown', 'Down'),
              this.renderKey('ArrowLeft', 'Left'),
              this.renderKey('ArrowRight', 'Right'),
              this.renderKey('KeyZ', '1/Start'),
              this.renderKey('KeyX', '2'),
            ]
          : null}
        {type === 'genplusgx-gg'
          ? [
              this.renderKey('Enter', 'Start'),
              this.renderKey('ArrowUp', 'Up'),
              this.renderKey('ArrowDown', 'Down'),
              this.renderKey('ArrowLeft', 'Left'),
              this.renderKey('ArrowRight', 'Right'),
              this.renderKey('KeyZ', '1'),
              this.renderKey('KeyX', '2'),
            ]
          : null}
      </>
    );
  }
}
