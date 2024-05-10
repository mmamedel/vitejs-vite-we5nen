<script lang="ts">
  import { onMount, tick } from "svelte";
  import { Muxer, ArrayBufferTarget } from "mp4-muxer";
  import { downloadBlob, findClosestNumber } from "./app";
  let videoEl: HTMLVideoElement;
  let isRecording = false;
  let encoder: VideoEncoder;
  let muxer: Muxer<ArrayBufferTarget>;
  let intervalId: number;
  let framesGenerated = 0;
  let allChunks: Uint8Array[] = [];
  let startTime: number;
  let lastKeyFrame = -Infinity;
  let devices: MediaDeviceInfo[] = [];
  $: audioInputDevices = devices.filter(
    (device) => device.kind === "audioinput"
  );
  $: videoInputDevices = devices.filter(
    (device) => device.kind === "videoinput"
  );
  let currentDevice: MediaDeviceInfo | null = null;
  let aspectRatio = 16 / 9;
  screen.orientation.onchange = () => {
    if (screen.width > screen.height) {
      aspectRatio = 9 / 16;
      return;
    }
    aspectRatio = 16 / 9;
  };
  $: if (currentDevice) {
    loadDevice(currentDevice, aspectRatio);
  }

  async function loadDevice(device: MediaDeviceInfo, aspectRatio: number) {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: device.deviceId,
        aspectRatio,
      },
    });
    const track = stream.getVideoTracks()[0];
    const trackSettings = track.getSettings();
    console.log(trackSettings);
    videoEl.srcObject = stream;
    videoEl.onloadedmetadata = async () => {
      videoEl.onloadedmetadata = null;
      videoEl.play();
      const width = trackSettings.width as number;
      const height = trackSettings.height as number;
      const rotation = screen.orientation.angle;

      await loadMuxerAndEncoder(width, height, rotation);
    };
  }

  async function loadMuxerAndEncoder(
    width: number,
    height: number,
    rotation: number
  ) {
    muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: {
        codec: "avc",
        width,
        height,
        rotation: findClosestNumber(rotation, [0, 90, 180, 270] as const),
      },
      fastStart: "in-memory",
      firstTimestampBehavior: "offset",
    });

    encoder = new VideoEncoder({
      output: (chunk, metadata) => muxer.addVideoChunk(chunk, metadata),
      error: console.error,
    });

    encoder.configure({
      codec: "avc1.640032",
      width,
      height,
      hardwareAcceleration: "prefer-hardware",
      bitrate: 20_000_000,
    });
  }

  onMount(async () => {
    await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    devices = await navigator.mediaDevices.enumerateDevices();
    await tick();
    currentDevice = videoInputDevices[0];
  });

  function startRecording() {
    isRecording = true;
    startTime = document.timeline.currentTime as number;
    lastKeyFrame = -Infinity;
    intervalId = setInterval(encodeVideoFrame, 1000 / 30);
  }

  async function endRecording() {
    isRecording = false;
    clearInterval(intervalId);
    framesGenerated = 0;

    await encoder.flush();
    muxer.finalize();

    const buffer = muxer.target.buffer;
    downloadBlob(new Blob([buffer]), "davinci.mp4");

    // downloadBlob(new Blob(allChunks), "davinci.yuv");
    allChunks = [];
  }

  async function encodeVideoFrame() {
    let elapsedTime = (document.timeline.currentTime as number) - startTime;
    const frame = new VideoFrame(videoEl, {
      timestamp: (framesGenerated * 1e6) / 30, // Ensure equally-spaced frames every 1/30th of a second
      duration: 1e6 / 30,
      alpha: "keep",
    });
    framesGenerated++;

    const uint8 = new Uint8Array(frame.allocationSize());
    frame.copyTo(uint8);
    allChunks.push(uint8);

    // Ensure a video key frame at least every 5 seconds for good scrubbing
    let needsKeyFrame = elapsedTime - lastKeyFrame >= 5000;
    if (needsKeyFrame) lastKeyFrame = elapsedTime;
    encoder.encode(frame, { keyFrame: needsKeyFrame });
    frame.close();
  }
</script>

<select bind:value={currentDevice}>
  {#each videoInputDevices as device}
    <option value={device}>{device.label || device.deviceId}</option>
  {/each}
</select>
{#if !isRecording}
  <button on:click={startRecording}>Start recording</button>
{:else}
  <button on:click={endRecording}>End recording</button>
{/if}
<br />
<!-- svelte-ignore a11y-media-has-caption -->
<video bind:this={videoEl} playsinline></video>
