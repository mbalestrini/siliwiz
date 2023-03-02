import { createSignal, Show } from 'solid-js';
import SpiceDebugView from '~/components/SpiceDebugView';

export const [transparentLayers, setTransparentLayers] = createSignal(false);

export const [showBorders, setShowBorders] = createSignal(false);

export function ExpertOptions() {
  const [showSpice, setShowSpice] = createSignal(false);

  return (
    <>
      <label>
        <input
          type="checkbox"
          onClick={(e) => setShowSpice((e.target as HTMLInputElement).checked)}
        />
        Show SPICE
      </label>
      <br />
      <label>
        <input
          type="checkbox"
          onClick={(e) => setTransparentLayers((e.target as HTMLInputElement).checked)}
        />
        Transparent Layers
      </label>
      <br />
      <label>
        <input
          type="checkbox"
          onClick={(e) => setShowBorders((e.target as HTMLInputElement).checked)}
        />
        Show Borders
      </label>
      <Show when={showSpice()}>
        <SpiceDebugView />
      </Show>
    </>
  );
}
